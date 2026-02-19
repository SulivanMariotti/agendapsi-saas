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

function normalizeStatus(v) {
  const s = String(v || "draft").toLowerCase().trim();
  if (s === "published") return "published";
  return "draft";
}

function safeBool(v) {
  return v === true || String(v).toLowerCase() === "true";
}

function safeInt(v, defVal = 0) {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : defVal;
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

async function ensureCategory({ db, authUid, label, categoryId }) {
  const name = String(label || "").trim() || "Geral";
  const baseId = String(categoryId || "").trim() || slugify(name);

  const ref = db.collection("library_categories").doc(baseId);
  const snap = await ref.get();
  if (snap.exists) {
    const data = snap.data() || {};
    const resolvedName = String(data.name || name).trim() || name;
    return { categoryId: baseId, categoryLabel: resolvedName };
  }

  // Cria automaticamente uma categoria quando ela não existe.
  // Motivo: permitir fluxo "criar artigo + criar categoria" sem fricção.
  const now = admin.firestore.FieldValue.serverTimestamp();
  await ref.set({
    name,
    order: 100,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: authUid,
    updatedBy: authUid,
    autoCreated: true,
  });

  return { categoryId: baseId, categoryLabel: name };
}

function computeReadingTime(content) {
  const text = String(content || "").trim();
  if (!text) return null;
  const words = text.split(/\s+/g).filter(Boolean).length;
  const mins = Math.max(1, Math.round(words / 200));
  if (mins <= 1) return "1 min";
  if (mins === 2) return "2 min";
  return `${mins} min`;
}

export async function GET(req) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const rl = await rateLimit(req, {
    bucket: "admin:library:list",
    limit: 120,
    windowMs: 60_000,
    uid: auth.uid,
    errorMessage: "Muitas requisições. Aguarde um pouco e tente novamente.",
  });
  if (!rl.ok) return rl.res;

  try {
    const url = new URL(req.url);
    const status = String(url.searchParams.get("status") || "all").toLowerCase().trim();

    const snap = await admin.firestore().collection("library_articles").limit(500).get();

    let items = snap.docs.map((d) => ({ id: d.id, ...serializeFirestoreValue(d.data() || {}) }));

    if (status === "published" || status === "draft") {
      items = items.filter((x) => String(x?.status || "draft").toLowerCase().trim() === status);
    }

    // Ordenação estável (sem exigir índices compostos)
    items.sort((a, b) => {
      const ap = a?.pinned ? 1 : 0;
      const bp = b?.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;

      const ao = safeInt(a?.order, 9999);
      const bo = safeInt(b?.order, 9999);
      if (ao !== bo) return ao - bo;

      const au = safeInt(a?.updatedAt, 0);
      const bu = safeInt(b?.updatedAt, 0);
      return bu - au;
    });

    return NextResponse.json({ ok: true, items });
  } catch (err) {
    return adminError({ req, auth, action: "library_articles_list", err });
  }
}

export async function POST(req) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const rl = await rateLimit(req, {
    bucket: "admin:library:create",
    limit: 60,
    windowMs: 60_000,
    uid: auth.uid,
    errorMessage: "Muitas requisições. Aguarde um pouco e tente novamente.",
  });
  if (!rl.ok) return rl.res;

  try {
    const body = await req.json().catch(() => ({}));

    const title = String(body?.title || "").trim();
    const categoryRaw = String(body?.category || "").trim();
    const categoryIdRaw = String(body?.categoryId || "").trim();
    const categoryLabelRaw = String(body?.categoryLabel || "").trim();

    const categoryLabelInput = categoryLabelRaw || categoryRaw || "Geral";
    const summary = String(body?.summary || "").trim();
    const content = String(body?.content || "").trim();
    const status = normalizeStatus(body?.status);
    const pinned = safeBool(body?.pinned);
    const order = safeInt(body?.order, 100);

    if (!title) {
      return NextResponse.json({ ok: false, error: "Título é obrigatório." }, { status: 400 });
    }
    if (!content) {
      return NextResponse.json({ ok: false, error: "Conteúdo é obrigatório." }, { status: 400 });
    }

    const readingTime = String(body?.readingTime || "").trim() || computeReadingTime(content);

    const db = admin.firestore();
    const cat = await ensureCategory({
      db,
      authUid: auth.uid,
      label: categoryLabelInput,
      categoryId: categoryIdRaw,
    });

    const now = admin.firestore.FieldValue.serverTimestamp();

    const doc = {
      title,
      // compat: patient modal usa `category` como label
      category: cat.categoryLabel,
      categoryId: cat.categoryId,
      categoryLabel: cat.categoryLabel,
      summary,
      content,
      status,
      pinned,
      order,
      readingTime: readingTime || null,
      createdAt: now,
      updatedAt: now,
      createdBy: auth.uid,
      updatedBy: auth.uid,
    };

    const ref = await db.collection("library_articles").add(doc);

    await logAdminAudit({
      req,
      actorUid: auth.uid,
      actorEmail: auth.decoded?.email || null,
      action: "library_article:create",
      target: ref.id,
      status: "success",
      meta: { status },
    });

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (err) {
    return adminError({ req, auth, action: "library_article_create", err });
  }
}
