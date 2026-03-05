// src/lib/server/tenantPlan.js
// AgendaPsi — Billing/Planos (Pós-MVP)
//
// Objetivo (MVP+):
// - Centralizar definições de planos e limites por tenant
// - Permitir feature flags "efetivas" (tenant settings ∩ plano)
// - Evitar quebra de tenants legados: se planId ausente, assume "pro"
//
// Fonte:
// - tenants/{tenantId}.planId (string)  // compat: ausente => "pro"
//
// Nota:
// - Billing real (assinatura/cobrança) fica para etapa futura.
// - Este módulo só define *capacidade* (limits) e *permissão de features*.

import admin from "@/lib/firebaseAdmin";

function norm(v) {
  return String(v ?? "").trim().toLowerCase();
}

export const PLAN_DEFINITIONS = {
  free: {
    id: "free",
    label: "Free",
    features: {
      patientPortal: {
        library: false,
        notes: false,
        reminders: true,
      },
    },
    limits: {
      whatsappTemplatesMax: 5,
      patientsMax: 30,
      seriesMax: 30,
    },
  },

  pro: {
    id: "pro",
    label: "Pro",
    features: {
      patientPortal: {
        library: true,
        notes: true,
        reminders: true,
      },
    },
    limits: {
      whatsappTemplatesMax: 50,
      patientsMax: 1000,
      seriesMax: 5000,
    },
  },

  enterprise: {
    id: "enterprise",
    label: "Enterprise",
    features: {
      patientPortal: {
        library: true,
        notes: true,
        reminders: true,
      },
    },
    limits: {
      whatsappTemplatesMax: 500,
      patientsMax: 20000,
      seriesMax: 50000,
    },
  },
};

export function isValidPlanId(planId) {
  const id = norm(planId);
  return Boolean(id && PLAN_DEFINITIONS[id]);
}

export function getPlanDefinition(planId) {
  const id = norm(planId);
  return PLAN_DEFINITIONS[id] || PLAN_DEFINITIONS.pro;
}

export async function getTenantPlanId(tenantId) {
  const tid = String(tenantId || "").trim();
  if (!tid) return "pro";
  const snap = await admin.firestore().collection("tenants").doc(tid).get();
  if (!snap.exists) return "pro";
  const data = snap.data() || {};
  const planId = norm(data.planId || "");
  return isValidPlanId(planId) ? planId : "pro";
}

export async function getTenantPlan(tenantId) {
  const planId = await getTenantPlanId(tenantId);
  const def = getPlanDefinition(planId);
  return {
    planId: def.id,
    label: def.label,
    features: def.features || {},
    limits: def.limits || {},
  };
}

/**
 * featureAllowed(tenantPlan, pathArray)
 * Ex.: featureAllowed(plan, ["patientPortal","library"])
 */
export function featureAllowed(plan, path = []) {
  const p = Array.isArray(path) ? path : [];
  let cur = plan?.features || {};
  for (const k of p) {
    if (!cur || typeof cur !== "object") return false;
    cur = cur[k];
  }
  return cur === true;
}

export function getLimit(plan, key, fallback = null) {
  const v = plan?.limits?.[key];
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  return fallback;
}
