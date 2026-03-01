// AgendaPsi - tenant membership resolution (server only)
//
// Objetivo: resolver {tenantId, role, isActive} para um UID autenticado
// sem depender de collectionGroup('users') (pode falhar em alguns projetos).
//
// Padrão oficial:
// - membership: tenants/{tenantId}/users/{uid}
// - índice: userTenantIndex/{uid}
//
// Estratégia:
// 1) Ler o índice userTenantIndex/{uid}
// 2) (Opcional DEV/MVP) se índice não existir, fazer scan limitado em tenants/*
//    buscando tenants/{tenantId}/users/{uid} e fazer backfill do índice.
//
// Produção: scan deve ficar DESABILITADO. Ative explicitamente via env:
// - ALLOW_TENANT_SCAN_FOR_AUTH=1

import admin from "@/lib/firebaseAdmin";

const INDEX_COL = "userTenantIndex"; // top-level collection

function normalizeMembership({ uid, tenantId, data }) {
  if (!uid || !tenantId || !data) return null;
  const role = String(data.role || "professional");
  const isActive = data.isActive !== false; // default true
  const displayName = data.displayName ? String(data.displayName) : "";
  return { uid, tenantId, role, isActive, displayName };
}

function allowTenantScan() {
  const flag = String(process.env.ALLOW_TENANT_SCAN_FOR_AUTH || "").trim();
  if (flag === "1" || flag.toLowerCase() === "true") return true;
  if (flag === "0" || flag.toLowerCase() === "false") return false;
  // padrão: dev=true, prod=false
  return process.env.NODE_ENV !== "production";
}

export async function getUserTenantIndex(uid) {
  const db = admin.firestore();
  const ref = db.collection(INDEX_COL).doc(uid);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const d = snap.data() || {};
  if (!d.tenantId) return null;
  return normalizeMembership({ uid, tenantId: String(d.tenantId), data: d });
}

export async function upsertUserTenantIndex(m) {
  if (!m?.uid || !m?.tenantId) return;
  const db = admin.firestore();
  const ref = db.collection(INDEX_COL).doc(m.uid);
  const snap = await ref.get();

  const base = {
    uid: m.uid,
    tenantId: m.tenantId,
    role: m.role || "professional",
    isActive: m.isActive !== false,
    displayName: m.displayName || "",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const data = snap.exists
    ? base
    : { ...base, createdAt: admin.firestore.FieldValue.serverTimestamp() };

  await ref.set(data, { merge: true });
}

async function findMembershipByTenantScan(uid, { limit = 200 } = {}) {
  const db = admin.firestore();
  const tenantsSnap = await db.collection("tenants").limit(limit).get();

  for (const tDoc of tenantsSnap.docs) {
    const tenantId = tDoc.id;
    const memRef = db.collection("tenants").doc(tenantId).collection("users").doc(uid);
    const memSnap = await memRef.get();
    if (!memSnap.exists) continue;

    const m = normalizeMembership({ uid, tenantId, data: memSnap.data() || {} });
    if (m) return m;
  }

  return null;
}

export async function resolveMembershipByUid(uid) {
  if (!uid) return null;

  // 1) fast-path: índice
  const idx = await getUserTenantIndex(uid);
  if (idx) return idx;

  // 2) fallback controlado: scan limitado (DEV/MVP)
  if (!allowTenantScan()) return null;

  const m = await findMembershipByTenantScan(uid);
  if (!m) return null;

  // backfill índice para evitar novos scans
  try {
    await upsertUserTenantIndex(m);
  } catch {
    // ignore backfill failures
  }

  return m;
}
