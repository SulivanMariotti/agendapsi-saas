import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { adminError } from "@/lib/server/adminError";

export const runtime = "nodejs";

/**
 * GET /api/admin/attendance/summary?days=7|30|90
 * Optional filters:
 * - professional / pro (string)
 * - service (string)
 * - location (string)
 * - patientId (string)
 * - phone (string)
 *
 * Server-side (Admin SDK) para evitar rules no client.
 *
 * Importante (clínico): o período deve ser calculado pela data real da sessão (`isoDate`),
 * não pela data do import (`createdAt`).
 */

function getServiceAccount() {
  const b64 = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_B64;
  if (b64) {
    const json = Buffer.from(b64, "base64").toString("utf-8");
    return JSON.parse(json);
  }
  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
  if (!raw) throw new Error("Missing FIREBASE_ADMIN_SERVICE_ACCOUNT(_B64) env var");
  return JSON.parse(raw);
}

function initAdmin() {
  if (admin.apps.length) return;
  const serviceAccount = getServiceAccount();
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

function clampDays(val) {
  const n = Number(val);
  return [7, 30, 90].includes(n) ? n : 7;
}

function normalizeStatus(s) {
  const v = String(s || "").toLowerCase().trim();
  if (["present", "confirmed", "attended", "ok", "compareceu", "presente"].includes(v))
    return "present";
  if (["absent", "missed", "faltou", "falta", "ausente", "no_show", "noshow"].includes(v))
    return "absent";
  return "unknown";
}

function normalizeDigits(s) {
  return String(s || "").replace(/\D+/g, "");
}

function canonicalPhone(raw) {
  const d = normalizeDigits(raw);
  if (!d) return "";
  if (d.length >= 12 && d.startsWith("55")) return d.slice(2);
  return d;
}

function isoDateRange(days) {
  const now = new Date();
  // usa dia UTC para evitar variação por fuso
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - Math.max(1, days) + 1);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { startIso: iso(start), endIso: iso(end) };
}

function listIsoDatesInclusive(startIso, endIso) {
  const out = [];
  try {
    const start = new Date(`${startIso}T00:00:00.000Z`);
    const end = new Date(`${endIso}T00:00:00.000Z`);
    const cur = new Date(start);
    const toIso = (d) => d.toISOString().slice(0, 10);
    while (cur.getTime() <= end.getTime()) {
      out.push(toIso(cur));
      cur.setUTCDate(cur.getUTCDate() + 1);
      // safety guard
      if (out.length > 400) break;
    }
  } catch (_) {
    // ignore
  }
  return out;
}

function compareIsoDate(a, b) {
  const aa = String(a || "");
  const bb = String(b || "");
  if (aa < bb) return -1;
  if (aa > bb) return 1;
  return 0;
}

function normalizeText(v) {
  const s = String(v || "");
  // remove diacríticos e normaliza espaços
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function includesNormalized(haystack, needle) {
  const h = normalizeText(haystack);
  const n = normalizeText(needle);
  if (!n) return true;
  if (!h) return false;
  return h.includes(n);
}

function pickAny(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return null;
}

function clampStr(v, max = 120) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return s.slice(0, max);
}

function computeAbsentStreak(sortedSessionsAsc) {
  // streak de faltas a partir da sessão mais recente dentro do período
  let streak = 0;
  for (let i = sortedSessionsAsc.length - 1; i >= 0; i--) {
    const s = sortedSessionsAsc[i];
    if (s?.status === "absent") streak += 1;
    else break;
  }
  return streak;
}

export async function GET(req) {
  let auth = null;
  try {
    initAdmin();

    auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const rl = await rateLimit(req, {
      bucket: "admin:attendance:summary",
      uid: auth.uid,
      limit: 120,
      windowMs: 60_000,
    });
    if (!rl.ok) return rl.res;

    const { searchParams } = new URL(req.url);
    const days = clampDays(searchParams.get("days"));

    // Filtros (opcionais) - comparações são "contains" (sem moralismo/sem rigidez),
    // evitando depender de índices compostos. Filtramos em memória após o fetch do período.
    const professional = clampStr(searchParams.get("professional") || searchParams.get("pro"));
    const service = clampStr(searchParams.get("service"));
    const location = clampStr(searchParams.get("location"));
    const patientId = clampStr(searchParams.get("patientId"), 80);
    const phoneCanonicalFilter = canonicalPhone(searchParams.get("phone") || "");
    const { startIso, endIso } = isoDateRange(days);
    const computedAt = new Date().toISOString();

    const db = admin.firestore();

    let snaps = null;

    // Estratégia:
    // 1) Query por `isoDate` (correto clinicamente)
    // 2) Fallback por `createdAt` (legado)
    try {
      snaps = await db
        .collection("attendance_logs")
        .where("isoDate", ">=", startIso)
        .where("isoDate", "<=", endIso)
        .get();
    } catch (_) {
      // fallback
      const startDate = new Date(`${startIso}T00:00:00.000Z`);
      const endDate = new Date(`${endIso}T23:59:59.999Z`);
      const startTs = admin.firestore.Timestamp.fromDate(startDate);
      const endTs = admin.firestore.Timestamp.fromDate(endDate);
      try {
        snaps = await db
          .collection("attendance_logs")
          .where("createdAt", ">=", startTs)
          .where("createdAt", "<=", endTs)
          .orderBy("createdAt", "desc")
          .get();
      } catch (_) {
        snaps = await db
          .collection("attendance_logs")
          .where("createdAt", ">=", startTs)
          .orderBy("createdAt", "desc")
          .get();
      }
    }

    let present = 0;
    let absent = 0;

    const isoDates = listIsoDatesInclusive(startIso, endIso);
    const byDayMap = new Map();
    for (const d of isoDates) {
      byDayMap.set(d, { isoDate: d, present: 0, absent: 0, unknown: 0, total: 0 });
    }

    // Agrupamento por paciente (preferência por phoneCanonical, que já é base operacional dos follow-ups)
    const patientSessions = new Map(); // phoneCanonical -> [{ isoDate, status }]

    const missesByPhone = new Map();

    for (const doc of snaps.docs) {
      const data = doc.data() || {};

      // se veio pelo fallback, filtra em memória por isoDate quando existir
      const dIso = String(data.isoDate || "").trim();
      if (dIso && (dIso < startIso || dIso > endIso)) continue;

      const status = normalizeStatus(data.status || data.state);
      const phoneCanonical = canonicalPhone(data.phoneCanonical || data.phone || data.patientPhone || "");

      // filtros em memória (evita índices compostos)
      if (phoneCanonicalFilter && phoneCanonical !== phoneCanonicalFilter) continue;
      if (patientId) {
        const pid = String(
          pickAny(data, ["patientId", "patientID", "uid", "patientUid", "patient_uid", "patientExternalId"]) || ""
        ).trim();
        if (!pid || pid !== patientId) continue;
      }
      if (professional) {
        const pro =
          pickAny(data, ["professional", "profissional", "therapist", "provider", "clinician", "psicologo"]) || "";
        if (!includesNormalized(pro, professional)) continue;
      }
      if (service) {
        const svc = pickAny(data, ["service", "servico", "specialty", "especialidade"]) || "";
        if (!includesNormalized(svc, service)) continue;
      }
      if (location) {
        const loc = pickAny(data, ["location", "local", "room", "modalidade", "mode"]) || "";
        if (!includesNormalized(loc, location)) continue;
      }

      if (status === "present") present += 1;
      if (status === "absent") {
        absent += 1;
        if (phoneCanonical) {
          missesByPhone.set(phoneCanonical, (missesByPhone.get(phoneCanonical) || 0) + 1);
        }
      }

      // byDay (apenas se isoDate estiver no range)
      if (dIso && byDayMap.has(dIso)) {
        const row = byDayMap.get(dIso);
        if (status === "present") row.present += 1;
        else if (status === "absent") row.absent += 1;
        else row.unknown += 1;
        row.total += 1;
      }

      // attention (por paciente/telefone)
      if (phoneCanonical && dIso) {
        const list = patientSessions.get(phoneCanonical) || [];
        list.push({ isoDate: dIso, status });
        patientSessions.set(phoneCanonical, list);
      }
    }

    const total = present + absent;
    const attendanceRate = total > 0 ? Math.round((present / total) * 100) : 0;

    const topMisses = Array.from(missesByPhone.entries())
      .map(([phoneCanonical, misses]) => ({ phoneCanonical, misses }))
      .sort((a, b) => b.misses - a.misses)
      .slice(0, 10);

    const byDay = Array.from(byDayMap.values()).sort((a, b) => compareIsoDate(a.isoDate, b.isoDate));
    const daysWithData = byDay.filter((d) => Number(d.total || 0) > 0).length;
    const daysWithoutData = Math.max(0, byDay.length - daysWithData);

    // Heurística clínica (sem moralismo): sinalizar possíveis quebras de continuidade
    // - prioridade: sequência de faltas (streak), depois volume de faltas e taxa
    const attention = [];
    const segments = { stable: 0, watch: 0, risk: 0, insufficient: 0 };
    let patientsTracked = 0;
    for (const [phoneCanonical, sessions] of patientSessions.entries()) {
      const sorted = (sessions || [])
        .filter((x) => x?.isoDate && x.isoDate >= startIso && x.isoDate <= endIso)
        .sort((a, b) => compareIsoDate(a.isoDate, b.isoDate));
      if (sorted.length === 0) continue;

      patientsTracked += 1;

      let p = 0;
      let a = 0;
      for (const s of sorted) {
        if (s.status === "present") p += 1;
        else if (s.status === "absent") a += 1;
      }
      const t = p + a;
      const rate = t > 0 ? Math.round((p / t) * 100) : 0;
      const last = sorted[sorted.length - 1];
      const absentStreak = computeAbsentStreak(sorted);

      // Segmentação clínica (sem rótulos): ajuda a priorizar cuidado ativo
      // - insufficient: pouco histórico no período
      // - stable: alta taxa e sem sinais de ruptura
      // - watch: oscilação leve
      // - risk: provável quebra de continuidade
      let seg = "insufficient";
      if (t < 2) seg = "insufficient";
      else if (absentStreak >= 2 || rate < 70) seg = "risk";
      else if (a >= 1 || rate < 85) seg = "watch";
      else seg = "stable";
      if (segments[seg] !== undefined) segments[seg] += 1;

      // score para ordenar (maior = mais atenção)
      const score = absentStreak * 1000 + a * 50 + (100 - rate);

      // reduz ruído: só entra se tiver pelo menos 1 falta OU streak >= 2 OU taxa baixa
      if (a === 0 && absentStreak < 2 && rate >= 85) continue;

      attention.push({
        phoneCanonical,
        lastIsoDate: last?.isoDate || null,
        lastStatus: last?.status || "unknown",
        absentStreak,
        rate,
        present: p,
        absent: a,
        total: t,
        score,
      });
    }

    attention.sort((x, y) => Number(y.score || 0) - Number(x.score || 0));

    // Tendência (quando houver volume): compara metade mais recente vs metade anterior
    const trend = (() => {
      const r = { prevRate: null, recentRate: null, delta: null, label: null };
      if (!Array.isArray(byDay) || byDay.length < 14) return r;

      const mid = Math.floor(byDay.length / 2);
      const first = byDay.slice(0, mid);
      const second = byDay.slice(mid);

      const calcRate = (arr) => {
        let pp = 0;
        let aa = 0;
        for (const d of arr) {
          pp += Number(d?.present || 0);
          aa += Number(d?.absent || 0);
        }
        const tt = pp + aa;
        if (tt < 5) return null;
        return Math.round((pp / tt) * 100);
      };

      const prev = calcRate(first);
      const recent = calcRate(second);
      if (prev === null || recent === null) return r;

      const delta = recent - prev;
      let label = "estavel";
      if (delta >= 5) label = "melhorando";
      else if (delta <= -5) label = "piorando";

      return { prevRate: prev, recentRate: recent, delta, label };
    })();

    return NextResponse.json(
      {
        ok: true,
        days,
        filtersApplied: {
          professional: professional || null,
          service: service || null,
          location: location || null,
          patientId: patientId || null,
          phoneCanonical: phoneCanonicalFilter || null,
        },
        // compat
        startIsoDate: startIso,
        endIsoDate: endIso,
        present,
        absent,
        total,
        attendanceRate,
        topMisses,

        // novos campos (UI admin)
        byDay,
        daysWithData,
        daysWithoutData,
        attention: attention.slice(0, 50).map(({ score, ...rest }) => rest),
        segments,
        cohort: { patientsTracked, attentionCount: Math.min(50, attention.length) },
        trend,
        range: { startIsoDate: startIso, endIsoDate: endIso, days },
        computedAt,
      },
      { status: 200 }
    );
  } catch (e) {
    return adminError({ req, auth: auth?.ok ? auth : null, action: "attendance_summary", err: e });
  }
}
