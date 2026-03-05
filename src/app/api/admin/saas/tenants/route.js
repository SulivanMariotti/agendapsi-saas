import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import crypto from "crypto";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { adminError } from "@/lib/server/adminError";
import { logAdminAudit } from "@/lib/server/auditLog";
import { readJsonObjectBody, getString } from "@/lib/server/payloadSchema";
import { isValidPlanId, getPlanDefinition } from "@/lib/server/tenantPlan";
import { normalizeBillingStatus } from "@/lib/server/tenantBilling";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function norm(v) {
  return String(v ?? "").trim();
}

function toIso(ts) {
  if (!ts) return null;
  try {
    if (typeof ts?.toDate === "function") return ts.toDate().toISOString();
    if (typeof ts?.seconds === "number") return new Date(ts.seconds * 1000).toISOString();
    if (ts instanceof Date) return ts.toISOString();
    const parsed = Date.parse(String(ts));
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  } catch (_) {}
  return null;
}

function getGraceDays() {
  const raw = String(process.env.BILLING_GRACE_DAYS || "").trim();
  const n = raw ? Number(raw) : 3;
  if (!Number.isFinite(n)) return 3;
  return Math.max(0, Math.min(30, Math.floor(n)));
}

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function normalizeStatus(v) {
  const s = String(v || "").trim().toLowerCase();
  if (s === "suspended") return "suspended";
  return "active";
}

function normalizeName(v) {
  const name = norm(v);
  return name.slice(0, 140);
}

function nameLower(name) {
  return norm(name).toLowerCase();
}

function makeTenantId() {
  const hex = crypto.randomBytes(8).toString("hex");
  return "tn_" + hex.slice(0, 10);
}

async function createUniqueTenantId(db, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    const id = makeTenantId();
    const ref = db.collection("tenants").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return id;
  }
  return db.collection("tenants").doc().id;
}

async function loadTenantById(db, tenantId) {
  const tid = norm(tenantId);
  if (!tid) return null;
  const snap = await db.collection("tenants").doc(tid).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  return { tenantId: snap.id, ...data };
}

function mapTenant(doc) {
  const planIdRaw = String(doc.planId || "");
  const planDef = getPlanDefinition(planIdRaw);
  return {
    tenantId: doc.tenantId,
    name: String(doc.name || ""),
    status: normalizeStatus(doc.status),
    planId: planDef.id,
    planLabel: planDef.label,
    createdAtIso: toIso(doc.createdAt),
    updatedAtIso: toIso(doc.updatedAt),
    billingStatus: normalizeBillingStatus(doc.billingStatus),
    trialEndsAtIso: toIso(doc.trialEndsAt),
    billingPastDueAtIso: toIso(doc.billingPastDueAt),
    billingGraceEndsAtIso: toIso(doc.billingGraceEndsAt),
  };
}

export async function GET(req) {
  let auth = null;
  try {
    auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const rl = await rateLimit(req, {
      bucket: "admin:saas:tenants:get",
      uid: auth.uid,
      limit: 120,
      windowMs: 60_000,
    });
    if (!rl.ok) return rl.res;

    const url = new URL(req.url);
    const q = norm(url.searchParams.get("q"));
    const qLower = nameLower(q);

    const db = admin.firestore();
    const out = new Map();

    // Direct hit by tenantId
    if (q) {
      const direct = await loadTenantById(db, q);
      if (direct) out.set(direct.tenantId, mapTenant(direct));
    }

    // Name prefix search when available (single-field index)
    if (qLower && qLower.length >= 2) {
      const snap = await db
        .collection("tenants")
        .orderBy("nameLower")
        .startAt(qLower)
        .endAt(qLower + "\uf8ff")
        .limit(25)
        .get();

      for (const d of snap.docs) {
        const data = d.data() || {};
        out.set(d.id, mapTenant({ tenantId: d.id, ...data }));
      }
    }

    // Default list
    if (!q) {
      const snap = await db.collection("tenants").orderBy("createdAt", "desc").limit(50).get();
      for (const d of snap.docs) {
        const data = d.data() || {};
        out.set(d.id, mapTenant({ tenantId: d.id, ...data }));
      }
    }

    const tenants = Array.from(out.values()).sort((a, b) => {
      const aa = Date.parse(a.createdAtIso || "") || 0;
      const bb = Date.parse(b.createdAtIso || "") || 0;
      return bb - aa;
    });

    return NextResponse.json({ ok: true, q, tenants }, { status: 200 });
  } catch (e) {
    return adminError({ req, auth: auth?.ok ? auth : null, action: "saas_tenants_get", err: e });
  }
}

export async function POST(req) {
  let auth = null;
  try {
    auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const rl = await rateLimit(req, {
      bucket: "admin:saas:tenants:post",
      uid: auth.uid,
      limit: 30,
      windowMs: 60_000,
    });
    if (!rl.ok) return rl.res;

    const bodyRes = await readJsonObjectBody(req, { allowedKeys: ["name"] });
    if (!bodyRes.ok) return NextResponse.json({ ok: false, error: bodyRes.error }, { status: 400 });

    const nameRes = getString(bodyRes.value, "name", {
      required: true,
      min: 3,
      max: 140,
      label: "Nome do tenant",
    });
    if (!nameRes.ok) return NextResponse.json({ ok: false, error: nameRes.error }, { status: 400 });

    const name = normalizeName(nameRes.value);

    const db = admin.firestore();
    const tenantId = await createUniqueTenantId(db);

    const ref = db.collection("tenants").doc(tenantId);
    const payload = {
      name,
      nameLower: nameLower(name),
      status: "active",
      planId: "pro",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: auth.uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: auth.uid,
    };

    await ref.set(payload, { merge: false });

    await logAdminAudit({
      req,
      actorUid: auth.uid,
      actorEmail: auth.decoded?.email || null,
      action: "TENANT_CREATE",
      target: tenantId,
      meta: { name },
    });

    return NextResponse.json({ ok: true, tenant: mapTenant({ tenantId, ...payload }) }, { status: 201 });
  } catch (e) {
    return adminError({ req, auth: auth?.ok ? auth : null, action: "saas_tenants_post", err: e });
  }
}

export async function PATCH(req) {
  let auth = null;
  try {
    auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const rl = await rateLimit(req, {
      bucket: "admin:saas:tenants:patch",
      uid: auth.uid,
      limit: 60,
      windowMs: 60_000,
    });
    if (!rl.ok) return rl.res;

    const bodyRes = await readJsonObjectBody(req, { allowedKeys: ["tenantId", "status", "planId", "billingStatus", "trialEndsAtIso"] });
    if (!bodyRes.ok) return NextResponse.json({ ok: false, error: bodyRes.error }, { status: 400 });

    const tenantIdRes = getString(bodyRes.value, "tenantId", {
      required: true,
      min: 3,
      max: 80,
      label: "tenantId",
    });
    if (!tenantIdRes.ok) return NextResponse.json({ ok: false, error: tenantIdRes.error }, { status: 400 });

    const status = normalizeStatus(bodyRes.value?.status);

    const billingStatusInput = String(bodyRes.value?.billingStatus || "").trim();
    const billingStatus = billingStatusInput ? normalizeBillingStatus(billingStatusInput) : null;
    const trialEndsAtIsoInput = String(bodyRes.value?.trialEndsAtIso || "").trim();

    const planIdInput = String(bodyRes.value?.planId || "").trim();
    const planId = planIdInput ? (isValidPlanId(planIdInput) ? String(planIdInput).trim().toLowerCase() : null) : null;
    const tenantId = norm(tenantIdRes.value);

    const db = admin.firestore();
    const ref = db.collection("tenants").doc(tenantId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "Tenant não encontrado." }, { status: 404 });
    }

    // billing: se vier billingStatus, aplica. trial default = agora+14d quando status=trial e não informar trialEndsAtIso
    let trialEndsAt = null;
    if (billingStatus === "trial") {
      if (trialEndsAtIsoInput) {
        const parsed = Date.parse(trialEndsAtIsoInput);
        if (!Number.isNaN(parsed)) trialEndsAt = new Date(parsed);
      }
      if (!trialEndsAt) {
        const d = new Date();
        d.setDate(d.getDate() + 14);
        trialEndsAt = d;
      }
    }

    const graceDays = getGraceDays();
    let graceEndsAt = null;
    if (billingStatus === "past_due" && graceDays > 0) {
      graceEndsAt = addDays(new Date(), graceDays);
    }

    await ref.set(
      {
        status,
        ...(planId ? { planId } : {}),
        ...(billingStatus ? { billingStatus } : {}),
        ...(billingStatus
          ? billingStatus === "trial"
            ? {
                trialEndsAt,
                billingPastDueAt: admin.firestore.FieldValue.delete(),
                billingGraceEndsAt: admin.firestore.FieldValue.delete(),
              }
            : billingStatus === "past_due"
              ? {
                  trialEndsAt: admin.firestore.FieldValue.delete(),
                  billingPastDueAt: admin.firestore.FieldValue.serverTimestamp(),
                  ...(graceEndsAt ? { billingGraceEndsAt: graceEndsAt } : { billingGraceEndsAt: admin.firestore.FieldValue.delete() }),
                }
              : {
                  trialEndsAt: admin.firestore.FieldValue.delete(),
                  billingPastDueAt: admin.firestore.FieldValue.delete(),
                  billingGraceEndsAt: admin.firestore.FieldValue.delete(),
                }
          : {}),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: auth.uid,
      },
      { merge: true }
    );

    await logAdminAudit({
      req,
      actorUid: auth.uid,
      actorEmail: auth.decoded?.email || null,
      action: "TENANT_STATUS_CHANGE",
      target: tenantId,
      meta: { status },
    });

    if (planId) {
      await logAdminAudit({
        req,
        actorUid: auth.uid,
        actorEmail: auth.decoded?.email || null,
        action: "TENANT_PLAN_CHANGE",
        target: tenantId,
        meta: { planId },
      });
    }

    if (billingStatus) {
      await logAdminAudit({
        req,
        actorUid: auth.uid,
        actorEmail: auth.decoded?.email || null,
        action: "TENANT_BILLING_STATUS_CHANGE",
        target: tenantId,
        meta: {
          billingStatus,
          trialEndsAtIso: trialEndsAt ? trialEndsAt.toISOString() : null,
          graceEndsAtIso: graceEndsAt ? graceEndsAt.toISOString() : null,
          graceDays,
        },
      });
    }

    const updated = await loadTenantById(db, tenantId);
    return NextResponse.json({ ok: true, tenant: updated ? mapTenant(updated) : { tenantId, status } }, { status: 200 });
  } catch (e) {
    return adminError({ req, auth: auth?.ok ? auth : null, action: "saas_tenants_patch", err: e });
  }
}
