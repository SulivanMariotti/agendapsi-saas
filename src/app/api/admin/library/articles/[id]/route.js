import { NextResponse } from "next/server";
import { readJsonObjectBody } from "@/lib/server/payloadSchema";
import admin from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { adminError } from "@/lib/server/adminError";
import { rateLimit } from "@/lib/server/rateLimit";
import { logAdminAudit } from "@/lib/server/auditLog";

export const runtime = "nodejs";

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

export async function PATCH(req, ctx) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const rl = await rateLimit(req, {
    bucket: "admin:library:update",
    limit: 120,
    windowMs: 60_000,
    uid: auth.uid,
    errorMessage: "Muitas requisições. Aguarde um pouco e tente novamente.",
  });
  if (!rl.ok) return rl.res;

  try {
    const id = String(ctx?.params?.id || "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "ID inválido." }, { status: 400 });
    }

    const bodyRes = await readJsonObjectBody(req, {
      maxBytes: 200000,
      defaultValue: {},
      allowedKeys: ["title", "content", "summary", "status", "category", "categoryId", "categoryLabel", "order", "pinned", "readingTime"],
      label: "library-article",
      showKeys: true,
    });
    if (!bodyRes.ok) return NextResponse.json({ ok: false, error: bodyRes.error }, { status: 400 });
    const body = bodyRes.value;

    const patch = {};

    if (body?.title != null) patch.title = String(body.title || "").trim();

    // Categoria pode vir como:
    // - categoryId (preferido) + categoryLabel opcional
    // - category (legado)
    const hasCategoryInput = body?.categoryId != null || body?.categoryLabel != null || body?.category != null;
    if (hasCategoryInput) {
      const db = admin.firestore();
      const categoryRaw = String(body?.category || "").trim();
      const categoryIdRaw = String(body?.categoryId || "").trim();
      const categoryLabelRaw = String(body?.categoryLabel || "").trim();
      const categoryLabelInput = categoryLabelRaw || categoryRaw || "Geral";
      const cat = await ensureCategory({ db, authUid: auth.uid, label: categoryLabelInput, categoryId: categoryIdRaw });

      patch.category = cat.categoryLabel;
      patch.categoryId = cat.categoryId;
      patch.categoryLabel = cat.categoryLabel;
    }
    if (body?.summary != null) patch.summary = String(body.summary || "").trim();
    if (body?.content != null) patch.content = String(body.content || "").trim();
    if (body?.status != null) patch.status = normalizeStatus(body.status);
    if (body?.pinned != null) patch.pinned = safeBool(body.pinned);
    if (body?.order != null) patch.order = safeInt(body.order, 100);
    if (body?.readingTime != null) {
      patch.readingTime = String(body.readingTime || "").trim() || null;
    }

    if (patch.title !== undefined && !patch.title) {
      return NextResponse.json({ ok: false, error: "Título é obrigatório." }, { status: 400 });
    }

    if (patch.content !== undefined && !patch.content) {
      return NextResponse.json({ ok: false, error: "Conteúdo é obrigatório." }, { status: 400 });
    }

    // Se conteúdo mudou e readingTime não foi fornecido, recalcula.
    if (patch.content !== undefined && patch.readingTime === undefined) {
      patch.readingTime = computeReadingTime(patch.content);
    }

    patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    patch.updatedBy = auth.uid;

    const ref = admin.firestore().collection("library_articles").doc(id);
    await ref.set(patch, { merge: true });

    await logAdminAudit({
      req,
      actorUid: auth.uid,
      actorEmail: auth.decoded?.email || null,
      action: "library_article:update",
      target: id,
      status: "success",
      meta: { fields: Object.keys(patch).filter((k) => !/(updatedAt|updatedBy)/.test(k)) },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return adminError({ req, auth, action: "library_article_update", err });
  }
}

export async function DELETE(req, ctx) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const rl = await rateLimit(req, {
    bucket: "admin:library:delete",
    limit: 60,
    windowMs: 60_000,
    uid: auth.uid,
    errorMessage: "Muitas requisições. Aguarde um pouco e tente novamente.",
  });
  if (!rl.ok) return rl.res;

  try {
    const id = String(ctx?.params?.id || "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "ID inválido." }, { status: 400 });
    }

    await admin.firestore().collection("library_articles").doc(id).delete();

    await logAdminAudit({
      req,
      actorUid: auth.uid,
      actorEmail: auth.decoded?.email || null,
      action: "library_article:delete",
      target: id,
      status: "success",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return adminError({ req, auth, action: "library_article_delete", err });
  }
}
