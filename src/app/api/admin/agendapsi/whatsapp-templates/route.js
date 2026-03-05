import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { adminError } from "@/lib/server/adminError";
import { readJsonObjectBody } from "@/lib/server/payloadSchema";

export const runtime = "nodejs";

function resolveTenantIdFromReq(req, body) {
  const { searchParams } = new URL(req.url);
  const fromQuery = String(searchParams.get("tenantId") || "").trim();
  const fromBody = String(body?.tenantId || "").trim();
  const fromEnv = String(process.env.AGENDA_PSI_TENANT_ID || "").trim();
  return fromQuery || fromBody || fromEnv || "tn_JnA5yU";
}

function normalizeTemplateInput(input = {}) {
  const title = String(input?.title || "").trim();
  const body = String(input?.body || "").trim();
  const isActive = input?.isActive === false ? false : true;
  const sortOrderRaw = input?.sortOrder;
  const sortOrder = Number.isFinite(sortOrderRaw) ? sortOrderRaw : Number(sortOrderRaw);
  const sortOrderFinal = Number.isFinite(sortOrder) ? sortOrder : 999;

  return { title, body, isActive, sortOrder: sortOrderFinal };
}

async function listTemplates({ tenantId }) {
  const db = admin.firestore();
  const snap = await db
    .collection("tenants")
    .doc(tenantId)
    .collection("whatsappTemplates")
    .orderBy("sortOrder", "asc")
    .orderBy("title", "asc")
    .limit(200)
    .get();

  return snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
}

export async function GET(req) {
  try {
    await rateLimit(req, { limit: 120, windowMs: 60_000 });
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const tenantId = resolveTenantIdFromReq(req, null);
    const templates = await listTemplates({ tenantId });

    return NextResponse.json({ ok: true, tenantId, templates });
  } catch (e) {
    return adminError(e);
  }
}

export async function POST(req) {
  try {
    await rateLimit(req, { limit: 60, windowMs: 60_000 });
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const bodyRes = await readJsonObjectBody(req);
    if (!bodyRes.ok) return NextResponse.json({ ok: false, error: bodyRes.error }, { status: 400 });
    const body = bodyRes.value;

    const tenantId = resolveTenantIdFromReq(req, body);
    const tpl = normalizeTemplateInput(body);

    if (!tenantId) return NextResponse.json({ ok: false, error: "tenantId required" }, { status: 400 });
    if (!tpl.title) return NextResponse.json({ ok: false, error: "title required" }, { status: 400 });
    if (!tpl.body) return NextResponse.json({ ok: false, error: "body required" }, { status: 400 });
    if (tpl.title.length > 80) return NextResponse.json({ ok: false, error: "title too long" }, { status: 400 });
    if (tpl.body.length > 2500) return NextResponse.json({ ok: false, error: "body too long" }, { status: 400 });

    const now = admin.firestore.FieldValue.serverTimestamp();
    const db = admin.firestore();
    const ref = db.collection("tenants").doc(tenantId).collection("whatsappTemplates").doc();

    await ref.set({
      title: tpl.title,
      body: tpl.body,
      isActive: tpl.isActive,
      sortOrder: tpl.sortOrder,
      createdAt: now,
      updatedAt: now,
      updatedBy: auth.uid,
    });

    const templates = await listTemplates({ tenantId });
    return NextResponse.json({ ok: true, tenantId, templates, createdId: ref.id });
  } catch (e) {
    return adminError(e);
  }
}

export async function PATCH(req) {
  try {
    await rateLimit(req, { limit: 120, windowMs: 60_000 });
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const bodyRes = await readJsonObjectBody(req);
    if (!bodyRes.ok) return NextResponse.json({ ok: false, error: bodyRes.error }, { status: 400 });
    const body = bodyRes.value;

    const tenantId = resolveTenantIdFromReq(req, body);
    const templateId = String(body?.templateId || body?.id || "").trim();
    if (!tenantId) return NextResponse.json({ ok: false, error: "tenantId required" }, { status: 400 });
    if (!templateId) return NextResponse.json({ ok: false, error: "templateId required" }, { status: 400 });

    const tpl = normalizeTemplateInput(body);
    if (!tpl.title) return NextResponse.json({ ok: false, error: "title required" }, { status: 400 });
    if (!tpl.body) return NextResponse.json({ ok: false, error: "body required" }, { status: 400 });

    const db = admin.firestore();
    const ref = db.collection("tenants").doc(tenantId).collection("whatsappTemplates").doc(templateId);

    await ref.set(
      {
        title: tpl.title,
        body: tpl.body,
        isActive: tpl.isActive,
        sortOrder: tpl.sortOrder,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: auth.uid,
      },
      { merge: true }
    );

    const templates = await listTemplates({ tenantId });
    return NextResponse.json({ ok: true, tenantId, templates });
  } catch (e) {
    return adminError(e);
  }
}

export async function DELETE(req) {
  try {
    await rateLimit(req, { limit: 60, windowMs: 60_000 });
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const { searchParams } = new URL(req.url);
    const templateId = String(searchParams.get("templateId") || "").trim();

    const bodyRes = await readJsonObjectBody(req);
    const body = bodyRes?.ok ? bodyRes.value : null;

    const tenantId = resolveTenantIdFromReq(req, body);
    const tid = templateId || String(body?.templateId || "").trim();

    if (!tenantId) return NextResponse.json({ ok: false, error: "tenantId required" }, { status: 400 });
    if (!tid) return NextResponse.json({ ok: false, error: "templateId required" }, { status: 400 });

    const db = admin.firestore();
    await db.collection("tenants").doc(tenantId).collection("whatsappTemplates").doc(tid).delete();

    const templates = await listTemplates({ tenantId });
    return NextResponse.json({ ok: true, tenantId, templates });
  } catch (e) {
    return adminError(e);
  }
}
