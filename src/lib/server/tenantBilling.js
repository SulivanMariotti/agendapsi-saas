// src/lib/server/tenantBilling.js
// AgendaPsi — Billing status helpers (Pós-MVP)
//
// Objetivo:
// - Centralizar leitura/interpretação de billingStatus (trial/active/past_due/canceled)
// - Bloqueio gradual com "carência" (grace period) para past_due
// - Compat: se billingStatus ausente => "active"
//
// Campos (tenants/{tenantId}):
// - billingStatus: "active" | "trial" | "past_due" | "canceled"   (string)
// - trialEndsAt: Firestore Timestamp | Date | ISO string (opcional)
// - billingPastDueAt: Timestamp | Date | ISO string (opcional)
// - billingGraceEndsAt: Timestamp | Date | ISO string (opcional)
//
// ENV (opcional):
// - BILLING_GRACE_DAYS (default: 3)

import admin from "@/lib/firebaseAdmin";

const DAY_MS = 1000 * 60 * 60 * 24;

function norm(v) {
  return String(v ?? "").trim().toLowerCase();
}

function toDateAny(v) {
  if (!v) return null;
  try {
    if (typeof v?.toDate === "function") return v.toDate();
    if (typeof v?.seconds === "number") return new Date(v.seconds * 1000);
    if (v instanceof Date) return v;
    const ms = Date.parse(String(v));
    if (!Number.isNaN(ms)) return new Date(ms);
  } catch (_) {}
  return null;
}

function parseGraceDays() {
  const raw = String(process.env.BILLING_GRACE_DAYS || "").trim();
  const n = raw ? Number(raw) : 3;
  if (!Number.isFinite(n)) return 3;
  return Math.max(0, Math.min(30, Math.floor(n)));
}

export function normalizeBillingStatus(v) {
  const s = norm(v);
  if (s === "trial") return "trial";
  if (s === "past_due" || s === "pastdue" || s === "past-due") return "past_due";
  if (s === "canceled" || s === "cancelled") return "canceled";
  return "active";
}

export function computeBillingStateFromTenantData(tenantData = {}) {
  const raw = normalizeBillingStatus(tenantData?.billingStatus);
  const trialEndsAtDate = toDateAny(tenantData?.trialEndsAt);
  const now = new Date();

  let effective = raw;

  // Se trial expirou, tratamos como past_due (sem depender de cron)
  const trialExpired =
    raw === "trial" &&
    trialEndsAtDate &&
    now.getTime() > trialEndsAtDate.getTime();

  if (trialExpired) effective = "past_due";

  const graceDaysCfg = parseGraceDays();

  // Past due: carência (grace period)
  const pastDueAtDate =
    toDateAny(tenantData?.billingPastDueAt) ||
    (trialExpired ? trialEndsAtDate : null);

  const storedGraceEndsAt = toDateAny(tenantData?.billingGraceEndsAt);
  const graceEndsAtDate =
    storedGraceEndsAt ||
    (pastDueAtDate && graceDaysCfg > 0
      ? new Date(pastDueAtDate.getTime() + graceDaysCfg * DAY_MS)
      : null);

  const inGrace =
    effective === "past_due" &&
    graceEndsAtDate &&
    now.getTime() <= graceEndsAtDate.getTime();

  // Writes permitidos apenas quando:
  // - active
  // - trial (não expirado)
  // - past_due dentro da carência
  const writeAllowed = effective === "active" || effective === "trial" || Boolean(inGrace);

  let trialDaysLeft = null;
  if (raw === "trial" && trialEndsAtDate) {
    const diffMs = trialEndsAtDate.getTime() - now.getTime();
    trialDaysLeft = Math.ceil(diffMs / DAY_MS);
  }

  let graceDaysLeft = null;
  if (effective === "past_due" && graceEndsAtDate) {
    const diffMs = graceEndsAtDate.getTime() - now.getTime();
    graceDaysLeft = Math.max(0, Math.ceil(diffMs / DAY_MS));
  }

  return {
    statusRaw: raw,
    statusEffective: effective,

    // Trial
    trialEndsAtIso: trialEndsAtDate ? trialEndsAtDate.toISOString() : null,
    trialDaysLeft: typeof trialDaysLeft === "number" && Number.isFinite(trialDaysLeft) ? trialDaysLeft : null,

    // Past due grace
    pastDueAtIso: pastDueAtDate ? pastDueAtDate.toISOString() : null,
    graceEndsAtIso: graceEndsAtDate ? graceEndsAtDate.toISOString() : null,
    graceDaysLeft: typeof graceDaysLeft === "number" && Number.isFinite(graceDaysLeft) ? graceDaysLeft : null,
    inGrace: Boolean(inGrace),
    graceDaysConfig: graceDaysCfg,

    // Writes
    writeAllowed,
  };
}

export async function getTenantBillingState(tenantId) {
  const tid = String(tenantId || "").trim();
  if (!tid) return computeBillingStateFromTenantData({ billingStatus: "active" });

  const snap = await admin.firestore().collection("tenants").doc(tid).get();
  const data = snap.exists ? (snap.data() || {}) : {};
  return computeBillingStateFromTenantData(data);
}

export function isBillingWriteAllowed(billingState) {
  return Boolean(billingState?.writeAllowed);
}
