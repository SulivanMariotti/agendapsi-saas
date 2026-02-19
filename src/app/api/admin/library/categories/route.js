import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { adminError } from "@/lib/server/adminError";
import { rateLimit } from "@/lib/server/rateLimit";
import { logAdminAudit } from "@/lib/server/auditLog";

export const runtime = "nodejs";

function serializeFirestoreValue(v) {
  if (v == null) return v;
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.toDate === "function") return v.toDate().getTime();
  if (v instanceof Date) return v.getTime();
  if (Array.isArray(v)) return v.map(serializeFirestoreValue);
  if (typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = serializeFirestoreValue(val);
    return out;
  }
  return v;
}

function safeInt(v, defVal = 0) {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : defVal;
}

function safeBool(v) {
  return v === true || String(v).toLowerCase() === "true";
}

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
  // fallback: timestamp suffix (extremely unlikely)
  return `${baseSlug}-${Date.now()}`;
}

export async function GET(req) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const rl = await rateLimit(req, {
    bucket: "admin:library:categories:list",
    limit: 240,
    windowMs: 60_000,
    uid: auth.uid,
    errorMessage: "Muitas requisições. Aguarde um pouco e tente novamente.",
  });
  if (!rl.ok) return rl.res;

  try {
    const snap = await admin.firestore().collection("library_categories").limit(500).get();

    const items = snap.docs
      .map((d) => ({ id: d.id, ...serializeFirestoreValue(d.data() || {}) }))
      .map((c) => {
        return {
          id: String(c.id || ""),
          name: String(c.name || "").trim(),
          order: safeInt(c.order, 100),
          isActive: c.isActive == null ? true : Boolean(c.isActive),
          createdAt: c.createdAt ?? null,
          updatedAt: c.updatedAt ?? null,
        };
      })
      .filter((c) => c.id && c.name);

    items.sort((a, b) => {
      if (a.isActive !== b.isActive) return (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0);
      if (a.order !== b.order) return a.order - b.order;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({ ok: true, items });
  } catch (err) {
    return adminError({ req, auth, action: "library_categories_list", err });
  }
}

export async function POST(req) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const rl = await rateLimit(req, {
    bucket: "admin:library:categories:create",
    limit: 120,
    windowMs: 60_000,
    uid: auth.uid,
    errorMessage: "Muitas requisições. Aguarde um pouco e tente novamente.",
  });
  if (!rl.ok) return rl.res;

  try {
    const body = await req.json().catch(() => ({}));

    const name = String(body?.name || "").trim();
    const order = safeInt(body?.order, 100);
    const isActive = body?.isActive == null ? true : safeBool(body?.isActive);

    if (!name) {
      return NextResponse.json({ ok: false, error: "Nome é obrigatório." }, { status: 400 });
    }

    const db = admin.firestore();
    const baseSlug = slugify(body?.slug || name);
    const id = await ensureUniqueSlug(db, baseSlug);
    const now = admin.firestore.FieldValue.serverTimestamp();

    await db.collection("library_categories").doc(id).set({
      name,
      order,
      isActive,
      createdAt: now,
      updatedAt: now,
      createdBy: auth.uid,
      updatedBy: auth.uid,
    });

    await logAdminAudit({
      req,
      actorUid: auth.uid,
      actorEmail: auth.decoded?.email || null,
      action: "library_category:create",
      target: id,
      status: "success",
      meta: { name, order, isActive },
    });

    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return adminError({ req, auth, action: "library_category_create", err });
  }
}
