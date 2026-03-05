// src/lib/server/tenantStatus.js
// AgendaPsi — Tenant status helpers (server-side)
//
// Objetivo:
// - Centralizar leitura do status do tenant (active/suspended)
// - Permitir bloqueio consistente em APIs e sessão do profissional
//
// Convenção:
// - Se tenants/{tenantId}.status estiver ausente, assume "active" (compat)
// - Qualquer status diferente de "active" é tratado como "suspended" para bloqueio.

import admin from "@/lib/firebaseAdmin";

function norm(v) {
  return String(v ?? "").trim().toLowerCase();
}

export async function getTenantRecord(tenantId) {
  const id = String(tenantId || "").trim();
  if (!id) return { exists: false, status: "missing", tenantId: id, data: null };

  const ref = admin.firestore().collection("tenants").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { exists: false, status: "missing", tenantId: id, data: null };

  const data = snap.data() || {};
  const status = norm(data.status || "active") || "active";

  return { exists: true, status, tenantId: id, data };
}

export async function ensureTenantActive(tenantId) {
  const t = await getTenantRecord(tenantId);
  if (!t.exists) return { ok: false, reason: "missing", ...t };

  const status = norm(t.status || "active") || "active";
  if (status !== "active") return { ok: false, reason: "suspended", ...t };

  return { ok: true, ...t, status };
}
