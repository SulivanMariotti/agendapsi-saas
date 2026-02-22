import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { adminError } from "@/lib/server/adminError";
import { rateLimit } from "@/lib/server/rateLimit";
import { logAdminAudit } from "@/lib/server/auditLog";
import { readJsonObjectBody } from "@/lib/server/payloadSchema";

export const runtime = "nodejs";

function slugify(input) {
  const s = String(input || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "geral";
}

async function ensureUniqueSlug(db, baseSlug) {
  const col = db.collection("library_categories");
  let slug = baseSlug;
  for (let i = 0; i < 20; i++) {
    const snap = await col.doc(slug).get();
    if (!snap.exists) return slug;
    slug = `${baseSlug}-${i + 2}`;
  }
  return `${baseSlug}-${Date.now()}`;
}

/**
 * POST /api/admin/library/categories/bootstrap
 *
 * Cria categorias a partir das categorias já existentes nos artigos.
 * - Idempotente
 * - Não altera artigos; apenas garante que a lista de categorias exista.
 */
export async function POST(req) {
  const bodyRes = await readJsonObjectBody(req, {
    allowedKeys: [],
    maxBytes: 2_000,
    defaultValue: {},
    label: "library:categories:bootstrap",
    showKeys: false,
  });
  if (!bodyRes.ok) {
    return NextResponse.json({ ok: false, error: bodyRes.error }, { status: 400 });
  }

  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const rl = await rateLimit(req, {
    bucket: "admin:library:categories:bootstrap",
    limit: 10,
    windowMs: 60_000,
    uid: auth.uid,
    errorMessage: "Aguarde um pouco e tente novamente.",
  });
  if (!rl.ok) return rl.res;

  try {
    const db = admin.firestore();
    const articlesSnap = await db.collection("library_articles").limit(500).get();

    const labels = new Set(["Geral"]);
    for (const d of articlesSnap.docs) {
      const data = d.data() || {};
      const label = String(data.categoryLabel || data.category || "").trim();
      if (label) labels.add(label);
    }

    let created = 0;
    let skipped = 0;

    const now = admin.firestore.FieldValue.serverTimestamp();

    for (const name of Array.from(labels)) {
      const baseSlug = slugify(name);
      let id = baseSlug;
      const exists = await db.collection("library_categories").doc(id).get();
      if (exists.exists) {
        skipped += 1;
        continue;
      }
      id = await ensureUniqueSlug(db, baseSlug);
      await db.collection("library_categories").doc(id).set({
        name,
        order: 100,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        createdBy: auth.uid,
        updatedBy: auth.uid,
        bootstrap: true,
      });
      created += 1;
    }

    await logAdminAudit({
      req,
      actorUid: auth.uid,
      actorEmail: auth.decoded?.email || null,
      action: "library_category:bootstrap",
      status: "success",
      meta: { created, skipped },
    });

    return NextResponse.json({ ok: true, created, skipped });
  } catch (err) {
    return adminError({ req, auth, action: "library_category_bootstrap", err });
  }
}