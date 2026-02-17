// src/app/api/admin/ops/daily-logs/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { adminError } from "@/lib/server/adminError";
import { FieldPath } from "firebase-admin/firestore";

const COL = "ops_daily_logs";

function isISODate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
}

function tsToMs(ts) {
  if (!ts) return null;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.toDate === "function") return ts.toDate().getTime();
  if (ts instanceof Date) return ts.getTime();
  const n = Number(ts);
  if (Number.isFinite(n)) return n;
  return null;
}

function clampLimit(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 14;
  return Math.max(1, Math.min(90, Math.floor(x)));
}

function summarize(docId, data) {
  const d = data || {};
  const m = d.metrics || {};

  const blockedInactive = Number(m.blockedInactive || 0);
  const blockedNoPush = Number(m.blockedNoPush || 0);
  const blockedMissingPhone = Number(m.blockedMissingPhone || 0);
  const blockedTotal = blockedInactive + blockedNoPush + blockedMissingPhone;

  return {
    dateISO: d.dateISO || docId,
    updatedAtMs: tsToMs(d.updatedAt),
    completedAtMs: tsToMs(d.completedAt),
    selectionCount: Number(m.selectionCount || 0),
    ready: Number(m.ready || 0),
    blocked: blockedTotal,
    blockedInactive,
    blockedNoPush,
    blockedMissingPhone,
    check: Number(m.pushUnknown || 0),
    pushWithToken: Number(m.pushWithToken || 0),
    pushWithoutToken: Number(m.pushWithoutToken || 0),
    phonesUnique: Number(m.phonesUnique || 0),
    filterProf: d.context?.filterProf || null,
    sendMode: d.context?.sendMode || null,
  };
}

export async function GET(req) {
  let auth = null;
  try {
    auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const rl = await rateLimit(req, { bucket: "admin:ops:daily-logs:get", uid: auth.uid, limit: 120, windowMs: 60_000 });
    if (!rl.ok) return rl.res;

    const url = new URL(req.url);
    const limitN = clampLimit(url.searchParams.get("limit"));

    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");

    const db = admin.firestore();
    const col = db.collection(COL);

    const fpId = FieldPath.documentId();

    let q = null;

    if (start && end && isISODate(start) && isISODate(end)) {
      // Range query (asc) para auditoria por período.
      q = col.orderBy(fpId, "asc").startAt(start).endAt(end).limit(limitN);
    } else {
      // Padrão: últimos N dias (desc)
      q = col.orderBy(fpId, "desc").limit(limitN);
    }

    const snap = await q.get();
    const logs = [];
    snap.forEach((doc) => logs.push(summarize(doc.id, doc.data())));

    return NextResponse.json({ ok: true, logs, count: logs.length });
  } catch (err) {
    return adminError({ req, auth: auth?.ok ? auth : null, action: "ops_daily_logs_get", err });
  }
}
