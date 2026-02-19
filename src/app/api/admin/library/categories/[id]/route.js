import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { adminError } from "@/lib/server/adminError";
import { rateLimit } from "@/lib/server/rateLimit";
import { logAdminAudit } from "@/lib/server/auditLog";

export const runtime = "nodejs";

function safeInt(v, defVal = 0) {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : defVal;
}

function safeBool(v) {
  return v === true || String(v).toLowerCase() === "true";
}

export async function PATCH(req, ctx) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const rl = await rateLimit(req, {
    bucket: "admin:library:categories:update",
    limit: 240,
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

    const body = await req.json().catch(() => ({}));
    const patch = {};

    if (body?.name != null) patch.name = String(body.name || "").trim();
    if (body?.order != null) patch.order = safeInt(body.order, 100);
    if (body?.isActive != null) patch.isActive = safeBool(body.isActive);

    if (patch.name !== undefined && !patch.name) {
      return NextResponse.json({ ok: false, error: "Nome é obrigatório." }, { status: 400 });
    }

    patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    patch.updatedBy = auth.uid;

    await admin.firestore().collection("library_categories").doc(id).set(patch, { merge: true });

    await logAdminAudit({
      req,
      actorUid: auth.uid,
      actorEmail: auth.decoded?.email || null,
      action: "library_category:update",
      target: id,
      status: "success",
      meta: { fields: Object.keys(patch).filter((k) => !/(updatedAt|updatedBy)/.test(k)) },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return adminError({ req, auth, action: "library_category_update", err });
  }
}

export async function DELETE(req, ctx) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const rl = await rateLimit(req, {
    bucket: "admin:library:categories:delete",
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

    await admin.firestore().collection("library_categories").doc(id).delete();

    await logAdminAudit({
      req,
      actorUid: auth.uid,
      actorEmail: auth.decoded?.email || null,
      action: "library_category:delete",
      target: id,
      status: "success",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return adminError({ req, auth, action: "library_category_delete", err });
  }
}
