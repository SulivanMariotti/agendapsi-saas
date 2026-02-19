import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { adminError } from "@/lib/server/adminError";

export const runtime = "nodejs";
/**
 * GET /api/admin/attendance/summary?days=7|30|90
 *
 * Server-side (Admin SDK) para evitar "Missing or insufficient permissions" no client.
 * Retorna estatísticas agregadas de attendance_logs no período.
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

const DEFAULT_TZ = process.env.APP_TZ || "America/Sao_Paulo";

function formatISODateInTZ(date, tz = DEFAULT_TZ) {
  // en-CA => YYYY-MM-DD
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(date);
  } catch (_) {
    // fallback UTC
    return new Date(date).toISOString().slice(0, 10);
  }
}

function addDaysISO(isoDate, days) {
  // Usa meio-dia UTC para evitar edge cases.
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

function normalizeStatus(s) {
  const v = String(s || "").toLowerCase().trim();
  if (["present", "confirmed", "attended", "ok", "compareceu", "presente"].includes(v)) return "present";
  if (["absent", "missed", "faltou", "falta", "no_show", "noshow"].includes(v)) return "absent";
  return "unknown";
}

function pickTimestamp(data) {
  const ts = data.createdAt || data.date || data.sessionAt || data.updatedAt || null;
  return ts && typeof ts.toDate === "function" ? ts.toDate() : null;
}

function pickIsoDate(data) {
  const iso = String(data?.isoDate || data?.dateIso || "").trim();
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const dt = pickTimestamp(data);
  if (!dt) return "";
  // tenta formatar em TZ do app
  return formatISODateInTZ(dt);
}

function pickTime(data) {
  const t = String(data?.time || data?.hora || "").trim();
  if (!t) return "";
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return t;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
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
    const now = new Date();
    const todayIso = formatISODateInTZ(now);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const startIso = formatISODateInTZ(startDate);
    const startTs = admin.firestore.Timestamp.fromDate(startDate);

    const db = admin.firestore();

    // Estratégia (clínica): constância deve olhar para a DATA DA SESSÃO (isoDate),
    // não para o momento do import (createdAt).
    // 1) Query preferencial por isoDate (string YYYY-MM-DD).
    // 2) Complementa com createdAt para registros legados sem isoDate.
    // 3) Fallback: últimos 1500 por createdAt e filtra em memória.
    let snapsIso = null;
    let snapsCreated = null;

    try {
      snapsIso = await db
        .collection("attendance_logs")
        .where("isoDate", ">=", startIso)
        .where("isoDate", "<=", todayIso)
        .orderBy("isoDate", "desc")
        .get();
    } catch (_) {
      snapsIso = null;
    }

    try {
      snapsCreated = await db
        .collection("attendance_logs")
        .where("createdAt", ">=", startTs)
        .orderBy("createdAt", "desc")
        .limit(1500)
        .get();
    } catch (_) {
      snapsCreated = null;
    }

    if (!snapsIso && !snapsCreated) {
      snapsCreated = await db.collection("attendance_logs").orderBy("createdAt", "desc").limit(1500).get();
    }

    const merged = new Map();
    (snapsIso?.docs || []).forEach((d) => merged.set(d.id, d));
    (snapsCreated?.docs || []).forEach((d) => {
      if (!merged.has(d.id)) merged.set(d.id, d);
    });

    let present = 0;
    let absent = 0;

    // faltas por paciente (phoneCanonical)
    const missesByPhone = new Map();
    const perPhone = new Map();
    const byDay = new Map();

    for (const doc of merged.values()) {
      const data = doc.data() || {};
      const isoDate = pickIsoDate(data);
      if (!isoDate) continue;

      // Filtra janela por data da sessão
      if (isoDate < startIso || isoDate > todayIso) continue;

      const status = normalizeStatus(data.status || data.state);
      if (status !== "present" && status !== "absent") continue;

      const time = pickTime(data);
      const phoneCanonical = String(data.phoneCanonical || data.phone || data.patientPhone || "").trim();

      // Totais gerais
      if (status === "present") present += 1;
      if (status === "absent") absent += 1;

      // Por dia
      if (!byDay.has(isoDate)) byDay.set(isoDate, { isoDate, present: 0, absent: 0, total: 0 });
      const day = byDay.get(isoDate);
      day.total += 1;
      if (status === "present") day.present += 1;
      if (status === "absent") day.absent += 1;

      // Por paciente (quando há chave)
      if (phoneCanonical) {
        if (!perPhone.has(phoneCanonical)) {
          perPhone.set(phoneCanonical, { phoneCanonical, present: 0, absent: 0, sessions: [] });
        }
        const p = perPhone.get(phoneCanonical);
        if (status === "present") p.present += 1;
        if (status === "absent") p.absent += 1;
        p.sessions.push({ isoDate, time, status });

        if (status === "absent") {
          missesByPhone.set(phoneCanonical, (missesByPhone.get(phoneCanonical) || 0) + 1);
        }
      }
    }

    const total = present + absent;
    const attendanceRate = total > 0 ? Math.round((present / total) * 100) : 0;

    const topMisses = Array.from(missesByPhone.entries())
      .map(([phoneCanonical, misses]) => ({ phoneCanonical, misses }))
      .sort((a, b) => b.misses - a.misses)
      .slice(0, 10);

    // Série por dia (últimos N dias) — útil para leitura clínica sem moralismo.
    const daysSeries = [];
    for (let i = 0; i < days; i++) {
      const dIso = addDaysISO(startIso, i);
      if (dIso > todayIso) break;
      const row = byDay.get(dIso) || { isoDate: dIso, present: 0, absent: 0, total: 0 };
      const t = Number(row.total || 0);
      const r = t > 0 ? Math.round((Number(row.present || 0) / t) * 100) : 0;
      daysSeries.push({ ...row, rate: r });
    }

    const daysWithData = daysSeries.filter((d) => Number(d.total || 0) > 0).length;
    const daysWithoutData = daysSeries.length - daysWithData;

    // Lista de atenção clínica (heurística) — não é punição, é sinal para cuidado ativo.
    const attention = Array.from(perPhone.values())
      .map((p) => {
        const sessions = Array.isArray(p.sessions) ? p.sessions.slice() : [];
        sessions.sort((a, b) => `${b.isoDate}T${b.time || "00:00"}`.localeCompare(`${a.isoDate}T${a.time || "00:00"}`));
        const last = sessions[0] || null;

        let absentStreak = 0;
        let presentStreak = 0;
        for (const s of sessions) {
          if (s.status === "absent") absentStreak += 1;
          else break;
        }
        for (const s of sessions) {
          if (s.status === "present") presentStreak += 1;
          else break;
        }

        const pTotal = Number(p.present || 0) + Number(p.absent || 0);
        const pRate = pTotal > 0 ? Math.round((Number(p.present || 0) / pTotal) * 100) : 0;

        // score simples para ordenação
        let score = 0;
        if (absentStreak >= 2) score += 5;
        else if (absentStreak === 1) score += 3;
        if (Number(p.absent || 0) >= 2) score += 2;
        if (pTotal >= 3 && pRate < 60) score += 2;
        if (last?.status === "absent") score += 1;

        return {
          phoneCanonical: p.phoneCanonical,
          present: Number(p.present || 0),
          absent: Number(p.absent || 0),
          total: pTotal,
          rate: pRate,
          lastStatus: last?.status || null,
          lastIsoDate: last?.isoDate || null,
          absentStreak,
          presentStreak,
          score,
        };
      })
      .filter((x) => x.total > 0)
      .sort((a, b) => (b.score - a.score) || (b.absent - a.absent) || (a.rate - b.rate))
      .slice(0, 12);

    return NextResponse.json(
      {
        ok: true,
        days,
        range: { startIso, endIso: todayIso, tz: DEFAULT_TZ },
        present,
        absent,
        total,
        attendanceRate,
        topMisses,
        byDay: daysSeries,
        daysWithData,
        daysWithoutData,
        attention,
        computedAt: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (e) {
    return adminError({ req, auth: auth?.ok ? auth : null, action: "attendance_summary", err: e });
  }
}
