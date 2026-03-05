import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { readJsonObjectBody } from "@/lib/server/payloadSchema";
import { requireTenantAdmin } from "@/lib/server/requireTenantAdmin";
import { getTenantPlan, getLimit } from "@/lib/server/tenantPlan";

export const runtime = "nodejs";

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

  // IMPORTANTE: evitamos orderBy composto (sortOrder + title) para não depender
  // de índice composto no Firestore. Ordenamos em memória (até 200 docs).
  const snap = await db
    .collection("tenants")
    .doc(tenantId)
    .collection("whatsappTemplates")
    .limit(200)
    .get();

  const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));

  rows.sort((a, b) => {
    const sa = Number.isFinite(Number(a?.sortOrder)) ? Number(a.sortOrder) : 999;
    const sb = Number.isFinite(Number(b?.sortOrder)) ? Number(b.sortOrder) : 999;
    if (sa !== sb) return sa - sb;
    const ta = String(a?.title || "");
    const tb = String(b?.title || "");
    return ta.localeCompare(tb, "pt-BR", { sensitivity: "base" });
  });

  return rows;
}

export async function GET(req) {
  try {
    const auth = await requireTenantAdmin(req, {
      bucket: "tenant-admin:whatsapp-templates:get",
      limit: 120,
      windowMs: 60_000,
    });
    if (!auth.ok) return auth.res;

    const tenantId = auth.session.tenantId;
    const templates = await listTemplates({ tenantId });

    return NextResponse.json({ ok: true, tenantId, templates }, { status: 200 });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[TENANT_ADMIN_API] whatsapp-templates:get", e);
    return NextResponse.json({ ok: false, error: "Ocorreu um erro. Tente novamente." }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const auth = await requireTenantAdmin(req, {
      bucket: "tenant-admin:whatsapp-templates:post",
      limit: 60,
      windowMs: 60_000,
    });
    if (!auth.ok) return auth.res;

    const tenantId = auth.session.tenantId;

    // Limite por plano
    const plan = await getTenantPlan(tenantId);
    const maxTemplates = getLimit(plan, "whatsappTemplatesMax", 50);
    if (Number.isFinite(maxTemplates)) {
      const existing = await admin
        .firestore()
        .collection("tenants")
        .doc(tenantId)
        .collection("whatsappTemplates")
        .limit(Number(maxTemplates) + 1)
        .get();

      if ((existing?.docs || []).length >= Number(maxTemplates)) {
        return NextResponse.json(
          {
            ok: false,
            error: `Limite do plano atingido (máx. ${maxTemplates} templates).`,
            code: "PLAN_LIMIT_EXCEEDED",
            planId: plan.planId,
            limit: maxTemplates,
          },
          { status: 403 }
        );
      }
    }

    const bodyRes = await readJsonObjectBody(req, {
      maxBytes: 30_000,
      defaultValue: {},
      allowedKeys: ["title", "body", "isActive", "sortOrder"],
      label: "tenant-admin-whatsapp-templates-post",
      showKeys: true,
    });
    if (!bodyRes.ok) return NextResponse.json({ ok: false, error: bodyRes.error }, { status: 400 });

    const tpl = normalizeTemplateInput(bodyRes.value);

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
      updatedBy: auth.session.uid,
    });

    const templates = await listTemplates({ tenantId });
    return NextResponse.json({ ok: true, tenantId, templates, createdId: ref.id }, { status: 200 });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[TENANT_ADMIN_API] whatsapp-templates:post", e);
    return NextResponse.json({ ok: false, error: "Ocorreu um erro. Tente novamente." }, { status: 500 });
  }
}

export async function PATCH(req) {
  try {
    const auth = await requireTenantAdmin(req, {
      bucket: "tenant-admin:whatsapp-templates:patch",
      limit: 120,
      windowMs: 60_000,
    });
    if (!auth.ok) return auth.res;

    const tenantId = auth.session.tenantId;

    // Limite por plano
    const plan = await getTenantPlan(tenantId);
    const maxTemplates = getLimit(plan, "whatsappTemplatesMax", 50);
    if (Number.isFinite(maxTemplates)) {
      const existing = await admin
        .firestore()
        .collection("tenants")
        .doc(tenantId)
        .collection("whatsappTemplates")
        .limit(Number(maxTemplates) + 1)
        .get();

      if ((existing?.docs || []).length >= Number(maxTemplates)) {
        return NextResponse.json(
          {
            ok: false,
            error: `Limite do plano atingido (máx. ${maxTemplates} templates).`,
            code: "PLAN_LIMIT_EXCEEDED",
            planId: plan.planId,
            limit: maxTemplates,
          },
          { status: 403 }
        );
      }
    }

    const bodyRes = await readJsonObjectBody(req, {
      maxBytes: 30_000,
      defaultValue: {},
      allowedKeys: ["templateId", "id", "title", "body", "isActive", "sortOrder"],
      label: "tenant-admin-whatsapp-templates-patch",
      showKeys: true,
    });
    if (!bodyRes.ok) return NextResponse.json({ ok: false, error: bodyRes.error }, { status: 400 });

    const body = bodyRes.value || {};
    const templateId = String(body?.templateId || body?.id || "").trim();
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
        updatedBy: auth.session.uid,
      },
      { merge: true }
    );

    const templates = await listTemplates({ tenantId });
    return NextResponse.json({ ok: true, tenantId, templates }, { status: 200 });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[TENANT_ADMIN_API] whatsapp-templates:patch", e);
    return NextResponse.json({ ok: false, error: "Ocorreu um erro. Tente novamente." }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const auth = await requireTenantAdmin(req, {
      bucket: "tenant-admin:whatsapp-templates:delete",
      limit: 60,
      windowMs: 60_000,
    });
    if (!auth.ok) return auth.res;

    const tenantId = auth.session.tenantId;

    const { searchParams } = new URL(req.url);
    const templateIdFromQuery = String(searchParams.get("templateId") || "").trim();

    const bodyRes = await readJsonObjectBody(req, {
      maxBytes: 5_000,
      defaultValue: {},
      allowedKeys: ["templateId", "id"],
      label: "tenant-admin-whatsapp-templates-delete",
      showKeys: true,
    });
    const body = bodyRes?.ok ? bodyRes.value : {};

    const templateId = templateIdFromQuery || String(body?.templateId || body?.id || "").trim();
    if (!templateId) return NextResponse.json({ ok: false, error: "templateId required" }, { status: 400 });

    const db = admin.firestore();
    await db.collection("tenants").doc(tenantId).collection("whatsappTemplates").doc(templateId).delete();

    const templates = await listTemplates({ tenantId });
    return NextResponse.json({ ok: true, tenantId, templates }, { status: 200 });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[TENANT_ADMIN_API] whatsapp-templates:delete", e);
    return NextResponse.json({ ok: false, error: "Ocorreu um erro. Tente novamente." }, { status: 500 });
  }
}
