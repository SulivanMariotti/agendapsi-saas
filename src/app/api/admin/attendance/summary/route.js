import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { adminError } from "@/lib/server/adminError";

export const runtime = "nodejs";

/**
 * GET /api/admin/attendance/summary?days=7|30|90
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
    const { startIso, endIso } = isoDateRange(days);

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
      const startTs = admin.firestore.Timestamp.fromDate(startDate);
      snaps = await db
        .collection("attendance_logs")
        .where("createdAt", ">=", startTs)
        .orderBy("createdAt", "desc")
        .get();
    }

    let present = 0;
    let absent = 0;

    const missesByPhone = new Map();

    for (const doc of snaps.docs) {
      const data = doc.data() || {};

      // se veio pelo fallback, filtra em memória por isoDate quando existir
      const dIso = String(data.isoDate || "").trim();
      if (dIso && (dIso < startIso || dIso > endIso)) continue;

      const status = normalizeStatus(data.status || data.state);
      const phoneCanonical = canonicalPhone(data.phoneCanonical || data.phone || data.patientPhone || "");

      if (status === "present") present += 1;
      if (status === "absent") {
        absent += 1;
        if (phoneCanonical) {
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

    return NextResponse.json(
      { ok: true, days, startIsoDate: startIso, endIsoDate: endIso, present, absent, total, attendanceRate, topMisses },
      { status: 200 }
    );
  } catch (e) {
    return adminError({ req, auth: auth?.ok ? auth : null, action: "attendance_summary", err: e });
  }
}
