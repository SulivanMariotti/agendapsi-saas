// src/app/api/admin/patients/list/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { readJsonObjectBody } from "@/lib/server/payloadSchema";
import admin from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { adminError } from "@/lib/server/adminError";
import { FieldPath } from "firebase-admin/firestore";

/**
 * Admin API: List Patients (server-side via Firebase Admin SDK)
 *
 * Paginação por cursor:
 * - POST { pageSize, cursor, includePush }
 * - Resposta: { patients, nextCursor, hasMore }
 *
 * Observação importante (Turbopack-safe):
 * - Nosso wrapper "@/lib/firebaseAdmin" não expõe FieldPath, então importamos de "firebase-admin/firestore".
 */

function toIso(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate().toISOString();
  if (ts instanceof Date) return ts.toISOString();
  if (typeof ts === "string") return ts;
  return null;
}

function clampPageSize(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return 200;
  // página pequena = render rápido; mesmo assim permitimos até 500
  return Math.max(1, Math.min(500, Math.floor(x)));
}

function parseBool(v) {
  if (v === true) return true;
  if (v === false) return false;
  const s = (v ?? "").toString().toLowerCase().trim();
  return s === "1" || s === "true" || s === "yes" || s === "y";
}

function parseFilters(input) {
  const src = input?.filters ? input.filters : input;
  const noPush = Boolean(src?.noPush);
  const noContract = Boolean(src?.noContract);
  const noCode = Boolean(src?.noCode);

  const contractVersionRaw = src?.contractVersion ?? 1;
  const contractVersion = Math.max(1, Math.min(999, Number(contractVersionRaw) || 1));

  return { noPush, noContract, noCode, contractVersion };
}


function onlyDigits(v) {
  return String(v || "").replace(/\D/g, "");
}

function toPhoneCanonical(raw) {
  let d = onlyDigits(raw).replace(/^0+/, "");
  if (!d) return "";
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length === 10 || d.length === 11) return d;
  if (d.length > 11) return d.slice(-11);
  return d;
}

function parseSearch(input) {
  const src = input?.search ?? input;
  if (!src) return null;

  // { mode, term } ou string
  if (typeof src === "string") {
    const raw = src.trim();
    if (!raw) return null;
    return detectSearch(raw);
  }

  const modeRaw = String(src?.mode ?? "auto").toLowerCase().trim();
  const termRaw = String(src?.term ?? "").trim();
  if (!termRaw) return null;

  if (modeRaw === "email") return { mode: "email", term: termRaw.toLowerCase() };
  if (modeRaw === "phone") return { mode: "phone", term: toPhoneCanonical(termRaw) };
  if (modeRaw === "externalid" || modeRaw === "external_id" || modeRaw === "external") {
    return { mode: "externalId", term: termRaw };
  }

  return detectSearch(termRaw);
}

function detectSearch(raw) {
  const term = String(raw || "").trim();
  if (!term) return null;

  const lower = term.toLowerCase();
  const looksEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower);
  if (looksEmail) return { mode: "email", term: lower };

  const digits = toPhoneCanonical(term);
  if (digits && digits.length >= 10) return { mode: "phone", term: digits };

  const looksExternalId =
    !/\s/.test(term) &&
    term.length >= 4 &&
    term.length <= 64 &&
    /^[A-Za-z0-9_-]+$/.test(term) &&
    (/\d/.test(term) || term.includes("_") || term.includes("-"));

  if (looksExternalId) return { mode: "externalId", term };

  return null;
}


function hasAnyFilter(f) {
  return Boolean(f?.noPush || f?.noContract || f?.noCode);
}

function encodeCursor(payload) {
  try {
    const json = JSON.stringify(payload || {});
    return Buffer.from(json, "utf-8").toString("base64");
  } catch {
    return null;
  }
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const json = Buffer.from(String(cursor), "base64").toString("utf-8");
    const obj = JSON.parse(json);
    const updatedAtMillis = Number(obj?.updatedAtMillis ?? 0);
    const uid = (obj?.uid ?? "").toString().trim() || null;
    return { updatedAtMillis, uid };
  } catch {
    return null;
  }
}

function isIndexError(err) {
  const msg = String(err?.message || "").toLowerCase();
  // Admin SDK costuma usar FAILED_PRECONDITION (code=9) quando falta índice.
  return err?.code === 9 || msg.includes("requires an index") || msg.includes("failed_precondition") || msg.includes("index");
}

/**
 * Inativo se:
 * - status in ["inactive","disabled","archived","deleted"]
 * - isActive === false
 * - disabled === true
 * - disabledAt / deletedAt existem
 * - mergedTo existe (duplicado consolidado)
 */
function isInactivePatient(d) {
  const status = (d?.status ?? "active").toString().toLowerCase().trim();
  if (["inactive", "disabled", "archived", "deleted"].includes(status)) return true;

  if (d?.isActive === false) return true;
  if (d?.disabled === true) return true;

  if (d?.disabledAt) return true;
  if (d?.deletedAt) return true;

  if (d?.mergedTo) return true;

  return false;
}


function isAccessSuspended(d) {
  if (!d || typeof d !== "object") return false;

  if (d.accessDisabled === true) return true;
  if (d.securityHold === true) return true;

  if (d.access && typeof d.access === "object") {
    if (d.access.disabled === true) return true;
    const st = String(d.access.status || "").toLowerCase().trim();
    if (["disabled", "blocked", "suspended", "hold"].includes(st)) return true;
  }

  const accessStatus = String(d.accessStatus || "").toLowerCase().trim();
  if (["disabled", "blocked", "suspended", "hold"].includes(accessStatus)) return true;

  return false;
}

async function addHasPushToken(db, patients) {
  // Perf: batch reads using getAll() instead of N individual doc.get() calls.
  const phones = Array.from(
    new Set(
      patients
        .map((p) => (p.phoneCanonical || p.phone || "").toString().trim())
        .filter(Boolean)
    )
  );

  const chunkSize = 200;
  const chunks = [];
  for (let i = 0; i < phones.length; i += chunkSize) chunks.push(phones.slice(i, i + chunkSize));

  const hasMap = new Map();

  await Promise.all(
    chunks.map(async (chunk) => {
      const refs = chunk.map((ph) => db.collection("subscribers").doc(ph));
      const snaps = await db.getAll(...refs);
      snaps.forEach((snap, idx) => {
        const ph = chunk[idx];
        const data = snap.exists ? snap.data() || {} : {};
        const token = data?.token || data?.pushToken || null;
        const active = data?.isActive !== false;
        hasMap.set(ph, Boolean(token) && active);
      });
    })
  );

  return patients.map((p) => {
    const ph = (p.phoneCanonical || p.phone || "").toString().trim();
    return { ...p, hasPushToken: hasMap.get(ph) || false };
  });
}

function dedupePatients(list) {
  // De-duplicate by patientExternalId (keep most recently updated; fallback uid)
  const map = new Map();
  for (const p of list) {
    const key = (p.patientExternalId || p.uid || "").toString();
    const prev = map.get(key);
    if (!prev) {
      map.set(key, p);
      continue;
    }
    const prevUpdated = Date.parse(prev.updatedAt || prev.createdAt || "") || 0;
    const curUpdated = Date.parse(p.updatedAt || p.createdAt || "") || 0;
    if (curUpdated >= prevUpdated) map.set(key, p);
  }
  return Array.from(map.values());
}

function normalizePatient(doc) {
  const d = doc.data() || {};
  const phoneCanonical = (d.phoneCanonical ?? d.phone ?? "").toString().trim();
  const phone = (d.phone ?? "").toString().trim();

  return {
    uid: doc.id,
    patientExternalId: d.patientExternalId ?? null,
    name: (d.name ?? "").toString().trim(),
    phoneCanonical,
    phone,
    email: (d.email ?? "").toString().trim(),
    role: (d.role ?? "").toString(),
    status: (d.status ?? "active").toString(),
    contractAcceptedVersion: Number(d?.contractAcceptedVersion ?? 0),
    contractAcceptedAt: toIso(d?.contractAcceptedAt),
    pairCodeStatus: (d.pairCodeStatus ?? "").toString(),
    pairCodeLast4: (d.pairCodeLast4 ?? "").toString(),
    pairCodeCreatedAt: toIso(d?.pairCodeCreatedAt),
    pairCodeUsedAt: toIso(d?.pairCodeUsedAt),
    isActive: d?.isActive ?? null,
    disabled: d?.disabled ?? null,
    disabledAt: toIso(d?.disabledAt),
    deletedAt: toIso(d?.deletedAt),
    accessDisabled: d?.accessDisabled ?? null,
    accessDisabledAt: toIso(d?.accessDisabledAt),
    securityHold: d?.securityHold ?? null,
    accessStatus: d?.accessStatus ?? null,
    _accessSuspended: isAccessSuspended(d),
    mergedTo: d?.mergedTo ?? null,
    createdAt: toIso(d?.createdAt),
    updatedAt: toIso(d?.updatedAt),
    _inactive: isInactivePatient(d),
    _updatedAtMillis:
      typeof d?.updatedAt?.toMillis === "function" ? d.updatedAt.toMillis() : 0,
  };
}

function cleanAndFilterPatients(raw) {
  // Remove ghosts / incomplete / inactive
  const filtered = raw.filter((p) => {
    if (String(p?.role || "").toLowerCase() !== "patient") return false;
    if (!p.name) return false;
    if (!p.phoneCanonical && !p.phone) return false;
    if (p._inactive) return false;
    return true;
  });

  let patients = dedupePatients(filtered).sort((a, b) => {
    const aT = Date.parse(a.updatedAt || a.createdAt || "") || 0;
    const bT = Date.parse(b.updatedAt || b.createdAt || "") || 0;
    return bT - aT;
  });

  // remove internal fields
  patients = patients.map(({ _inactive, _updatedAtMillis, role, ...rest }) => rest);

  return patients;
}

function applyServerFilters(patients, filters) {
  if (!hasAnyFilter(filters)) return patients;

  let out = patients;

  if (filters?.noContract) {
    const v = Number(filters?.contractVersion || 1);
    out = out.filter((p) => Number(p?.contractAcceptedVersion || 0) < v);
  }

  if (filters?.noCode) {
    // "Sem código" = sem código ativo (pairCodeStatus !== 'active')
    const norm = (s) => String(s || "").toLowerCase().trim();
    out = out.filter((p) => norm(p?.pairCodeStatus) !== "active");
  }

  if (filters?.noPush) {
    out = out.filter((p) => !Boolean(p?.hasPushToken));
  }

  return out;
}

/**
 * Estratégia A (preferida): query estável com tie-break por __name__
 * Requer índice composto quando combinado com where(role=="patient").
 */
async function listPatientsStable({ db, pageSize, includePush, cursor, filters }) {
  const fpId = FieldPath.documentId();

  const baseQuery = () =>
    db
      .collection("users")
      .where("role", "==", "patient")
      .orderBy("updatedAt", "desc")
      .orderBy(fpId, "desc");

  const effectiveIncludePush = Boolean(includePush || filters?.noPush);

  // Sem filtros: caminho antigo (rápido, 1 query)
  if (!hasAnyFilter(filters)) {
    let q = baseQuery();

    const cur = decodeCursor(cursor);
    if (cur?.uid) {
      const ts = admin.firestore.Timestamp.fromMillis(Number(cur.updatedAtMillis || 0));
      q = q.startAfter(ts, String(cur.uid));
    }

    const snap = await q.limit(pageSize + 1).get();
    const docs = snap.docs || [];

    const hasMore = docs.length > pageSize;
    const pageDocs = docs.slice(0, pageSize);
    const lastDoc = pageDocs.length ? pageDocs[pageDocs.length - 1] : null;

    let nextCursor = null;
    if (hasMore && lastDoc) {
      const d = lastDoc.data() || {};
      const updatedAtMillis =
        typeof d?.updatedAt?.toMillis === "function" ? d.updatedAt.toMillis() : 0;
      nextCursor = encodeCursor({ updatedAtMillis, uid: lastDoc.id });
    }

    const raw = pageDocs.map(normalizePatient);
    let patients = cleanAndFilterPatients(raw);

    if (effectiveIncludePush) {
      patients = await addHasPushToken(db, patients);
    }

    return {
      rawCount: raw.length,
      count: patients.length,
      pageSize,
      hasMore,
      nextCursor,
      patients,
      _strategy: "stable",
    };
  }

  // Com filtros: varre em batches até preencher pageSize (ou acabar)
  const target = pageSize;
  const batchSize = Math.min(700, Math.max(150, target * 3));
  const maxLoops = 10;

  let collected = [];
  let hasMore = true;
  let nextCursor = null;

  let cur = decodeCursor(cursor);
  let scanned = 0;
  let loops = 0;

  while (collected.length < target && hasMore && loops < maxLoops) {
    loops += 1;

    let q = baseQuery();
    if (cur?.uid) {
      const ts = admin.firestore.Timestamp.fromMillis(Number(cur.updatedAtMillis || 0));
      q = q.startAfter(ts, String(cur.uid));
    }

    const snap = await q.limit(batchSize + 1).get();
    const docs = snap.docs || [];

    hasMore = docs.length > batchSize;
    const scanDocs = docs.slice(0, batchSize);

    if (!scanDocs.length) {
      hasMore = false;
      nextCursor = null;
      break;
    }

    scanned += scanDocs.length;

    // cursor do último doc varrido (não do último match) para não travar
    const lastScanned = scanDocs[scanDocs.length - 1];
    const d = lastScanned.data() || {};
    const updatedAtMillis =
      typeof d?.updatedAt?.toMillis === "function" ? d.updatedAt.toMillis() : 0;

    cur = { updatedAtMillis, uid: lastScanned.id };
    nextCursor = hasMore ? encodeCursor(cur) : null;

    // normalize + clean
    let batchPatients = cleanAndFilterPatients(scanDocs.map(normalizePatient));

    // filtros dependentes de push exigem enrich antes
    if (effectiveIncludePush) {
      batchPatients = await addHasPushToken(db, batchPatients);
    }

    batchPatients = applyServerFilters(batchPatients, filters);

    collected = collected.concat(batchPatients);
    if (collected.length > target) collected = collected.slice(0, target);
  }

  return {
    rawCount: scanned,
    count: collected.length,
    pageSize,
    hasMore,
    nextCursor,
    patients: collected,
    _strategy: "stable_filtered",
    _scanned: scanned,
    _loops: loops,
  };
}

/**
 * Estratégia B (fallback): evita índice composto removendo where(role==patient).
 * - Pagina por updatedAt (desc)
 * - Filtra role==patient em memória
 * - Cursor baseado no último doc varrido (garante avanço mesmo com docs não-paciente)
 */
async function listPatientsScanFallback({ db, pageSize, includePush, cursor, filters }) {
  const effectiveIncludePush = Boolean(includePush || filters?.noPush);

  // Sem filtros: mantém comportamento antigo
  if (!hasAnyFilter(filters)) {
    let q = db.collection("users").orderBy("updatedAt", "desc");

    const cur = decodeCursor(cursor);
    if (cur) {
      const ts = admin.firestore.Timestamp.fromMillis(Number(cur.updatedAtMillis || 0));
      q = q.startAfter(ts);
    }

    const batchSize = Math.min(600, Math.max(100, pageSize * 3));
    const snap = await q.limit(batchSize + 1).get();
    const docs = snap.docs || [];

    const hasMore = docs.length > batchSize;
    const scanDocs = docs.slice(0, batchSize);

    const normalized = scanDocs.map(normalizePatient);
    const patients = cleanAndFilterPatients(normalized).slice(0, pageSize);

    // Cursor do último doc varrido (não do último paciente), para não ficar preso.
    const lastScanned = scanDocs.length ? scanDocs[scanDocs.length - 1] : null;

    let nextCursor = null;
    if (hasMore && lastScanned) {
      const d = lastScanned.data() || {};
      const updatedAtMillis =
        typeof d?.updatedAt?.toMillis === "function" ? d.updatedAt.toMillis() : 0;
      nextCursor = encodeCursor({ updatedAtMillis, uid: lastScanned.id });
    }

    let out = patients;
    if (effectiveIncludePush) {
      out = await addHasPushToken(db, out);
    }

    return {
      rawCount: normalized.length,
      count: out.length,
      pageSize,
      hasMore,
      nextCursor,
      patients: out,
      _strategy: "scan_fallback",
    };
  }

  // Com filtros: varre batches até preencher pageSize (ou acabar)
  const target = pageSize;
  const batchSize = Math.min(900, Math.max(250, target * 4));
  const maxLoops = 10;

  let collected = [];
  let hasMore = true;
  let nextCursor = null;

  let cur = decodeCursor(cursor);
  let scanned = 0;
  let loops = 0;

  while (collected.length < target && hasMore && loops < maxLoops) {
    loops += 1;

    let q = db.collection("users").orderBy("updatedAt", "desc");
    if (cur?.updatedAtMillis) {
      const ts = admin.firestore.Timestamp.fromMillis(Number(cur.updatedAtMillis || 0));
      q = q.startAfter(ts);
    }

    const snap = await q.limit(batchSize + 1).get();
    const docs = snap.docs || [];

    hasMore = docs.length > batchSize;
    const scanDocs = docs.slice(0, batchSize);

    if (!scanDocs.length) {
      hasMore = false;
      nextCursor = null;
      break;
    }

    scanned += scanDocs.length;

    const lastScanned = scanDocs[scanDocs.length - 1];
    const d = lastScanned.data() || {};
    const updatedAtMillis =
      typeof d?.updatedAt?.toMillis === "function" ? d.updatedAt.toMillis() : 0;

    cur = { updatedAtMillis, uid: lastScanned.id };
    nextCursor = hasMore ? encodeCursor(cur) : null;

    let batchPatients = cleanAndFilterPatients(scanDocs.map(normalizePatient));

    if (effectiveIncludePush) {
      batchPatients = await addHasPushToken(db, batchPatients);
    }

    batchPatients = applyServerFilters(batchPatients, filters);

    collected = collected.concat(batchPatients);
    if (collected.length > target) collected = collected.slice(0, target);
  }

  return {
    rawCount: scanned,
    count: collected.length,
    pageSize,
    hasMore,
    nextCursor,
    patients: collected,
    _strategy: "scan_fallback_filtered",
    _scanned: scanned,
    _loops: loops,
  };
}


async function listPatientsExactSearch({ db, includePush, filters, search }) {
  const s = parseSearch(search);
  if (!s) return null;

  const effectiveIncludePush = Boolean(includePush || filters?.noPush);

  const users = db.collection("users");
  const seen = new Map();

  const pushDoc = (doc) => {
    if (!doc) return;
    if (!seen.has(doc.id)) seen.set(doc.id, doc);
  };

  if (s.mode === "phone") {
    const ph = toPhoneCanonical(s.term);
    if (ph) {
      const [a, b] = await Promise.all([
        users.where("phoneCanonical", "==", ph).limit(25).get(),
        users.where("phone", "==", ph).limit(25).get(),
      ]);
      (a?.docs || []).forEach(pushDoc);
      (b?.docs || []).forEach(pushDoc);
    }
  } else if (s.mode === "email") {
    const em = String(s.term || "").toLowerCase().trim();
    if (em) {
      const [a, b, c] = await Promise.all([
        users.where("emailLower", "==", em).limit(25).get(),
        users.where("email", "==", em).limit(25).get(),
        users.where("email", "==", String(typeof search === "string" ? search : (search?.term ?? "")).trim()).limit(25).get(),
      ]);
      (a?.docs || []).forEach(pushDoc);
      (b?.docs || []).forEach(pushDoc);
      (c?.docs || []).forEach(pushDoc);
    }
  } else if (s.mode === "externalId") {
    const ext = String(s.term || "").trim();
    if (ext) {
      const snap = await users.where("patientExternalId", "==", ext).limit(25).get();
      (snap?.docs || []).forEach(pushDoc);
    }
  }

  const docs = Array.from(seen.values());
  const raw = docs.map(normalizePatient);
  let patients = cleanAndFilterPatients(raw);

  if (effectiveIncludePush) {
    patients = await addHasPushToken(db, patients);
  }

  if (hasAnyFilter(filters)) {
    patients = applyServerFilters(patients, filters);
  }

  return {
    rawCount: raw.length,
    count: patients.length,
    pageSize: patients.length,
    hasMore: false,
    nextCursor: null,
    patients,
    _strategy: "search_exact",
    _search: s,
  };
}


async function listPatientsPage({ pageSize, includePush, cursor, filters, search }) {
  const db = admin.firestore();

  const exact = await listPatientsExactSearch({ db, includePush, filters, search });
  if (exact) return exact;


  // Preferida: estável e determinística.
  try {
    return await listPatientsStable({ db, pageSize, includePush, cursor, filters });
  } catch (err) {
    // Se faltar índice, cai pro fallback sem travar o Admin.
    if (!isIndexError(err)) throw err;
    return await listPatientsScanFallback({ db, pageSize, includePush, cursor, filters });
  }
}

async function readBody(req) {
  const res = await readJsonObjectBody(req, {
    maxBytes: 60_000,
    defaultValue: {},
    allowedKeys: ["pageSize", "limit", "cursor", "includePush", "filters", "search", "q"],
    label: "patients-list",
    showKeys: true,
  });
  if (!res.ok) return { __error: res.error };
  return res.value;
}
export async function POST(req) {
  let auth = null;
  try {
    auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const rl = await rateLimit(req, {
      bucket: "admin:patients:list",
      uid: auth.uid,
      limit: 180,
      windowMs: 60_000,
    });
    if (!rl.ok) return rl.res;

    const body = await readBody(req);
    if (body && body.__error) {
      return NextResponse.json({ ok: false, error: body.__error }, { status: 400 });
    }

    // Backward compat: 'limit' vira pageSize
    const pageSize = clampPageSize(body?.pageSize ?? body?.limit ?? 200);
    const includePush = parseBool(body?.includePush ?? true);
    const cursor = body?.cursor ?? null;
    const search = body?.search ?? body?.q ?? null;

    const filters = parseFilters(body?.filters ?? body);

    const out = await listPatientsPage({ pageSize, includePush, cursor, filters, search });
    return NextResponse.json({ ok: true, ...out }, { status: 200 });
  } catch (err) {
    return adminError({ req, auth: auth?.ok ? auth : null, action: "patients_list", err });
  }
}

export async function GET(req) {
  let auth = null;
  try {
    auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const url = new URL(req.url);
    const pageSize = clampPageSize(
      url.searchParams.get("pageSize") ?? url.searchParams.get("limit") ?? 200
    );
    const includePush = parseBool(url.searchParams.get("includePush") ?? "true");
    const cursor = url.searchParams.get("cursor");
    const search = url.searchParams.get("search") ?? url.searchParams.get("q") ?? null;

    const filters = parseFilters({
      noPush: url.searchParams.get("noPush"),
      noContract: url.searchParams.get("noContract"),
      noCode: url.searchParams.get("noCode"),
      contractVersion: url.searchParams.get("contractVersion"),
    });

    const out = await listPatientsPage({ pageSize, includePush, cursor, filters, search });
    return NextResponse.json({ ok: true, ...out }, { status: 200 });
  } catch (err) {
    return adminError({ req, auth: auth?.ok ? auth : null, action: "patients_list", err });
  }
}
