// src/app/api/admin/ops/daily-log/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { readJsonObjectBody } from "@/lib/server/payloadSchema";
import admin from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { adminError } from "@/lib/server/adminError";

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

function sanitizeLog(docId, data) {
  const d = data || {};
  return {
    id: docId,
    dateISO: d.dateISO || docId,
    summaryText: d.summaryText || "",
    notes: d.notes || "",
    metrics: d.metrics || {},
    context: d.context || {},
    createdAtMs: tsToMs(d.createdAt),
    updatedAtMs: tsToMs(d.updatedAt),
    completedAtMs: tsToMs(d.completedAt),
    savedByUid: d.savedByUid || null,
    completedByUid: d.completedByUid || null,
  };
}

export async function GET(req) {
  let auth = null;
  try {
    auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const rl = await rateLimit(req, { bucket: "admin:ops:daily-log:get", uid: auth.uid, limit: 120, windowMs: 60_000 });
    if (!rl.ok) return rl.res;

    const url = new URL(req.url);
    const dateISO = url.searchParams.get("date") || "";

    if (!isISODate(dateISO)) {
      return NextResponse.json({ ok: false, error: "Parâmetro 'date' inválido (use YYYY-MM-DD)." }, { status: 400 });
    }

    const db = admin.firestore();
    const ref = db.collection(COL).doc(dateISO);
    const snap = await ref.get();

    if (!snap.exists) {
      return NextResponse.json({ ok: true, log: null });
    }

    return NextResponse.json({ ok: true, log: sanitizeLog(snap.id, snap.data()) });
  } catch (err) {
    return adminError({ req, auth: auth?.ok ? auth : null, action: "ops_daily_log_get", err });
  }
}

export async function POST(req) {
  let auth = null;
  try {
    auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const rl = await rateLimit(req, { bucket: "admin:ops:daily-log:post", uid: auth.uid, limit: 60, windowMs: 60_000 });
    if (!rl.ok) return rl.res;

    const bodyRes = await readJsonObjectBody(req, {
      maxBytes: 120000,
      defaultValue: {},
      allowedKeys: ["dateISO", "action", "summaryText", "notes", "metrics", "context"],
      label: "ops-daily-log",
      showKeys: true,
    });
    if (!bodyRes.ok) return NextResponse.json({ ok: false, error: bodyRes.error }, { status: 400 });
    const body = bodyRes.value;

    const dateISO = String(body.dateISO || "");
    const action = String(body.action || "save").toLowerCase();

    if (!isISODate(dateISO)) {
      return NextResponse.json({ ok: false, error: "Campo 'dateISO' inválido (use YYYY-MM-DD)." }, { status: 400 });
    }

    if (!(action === "save" || action === "complete")) {
      return NextResponse.json({ ok: false, error: "Campo 'action' inválido (use 'save' ou 'complete')." }, { status: 400 });
    }

    const summaryText = String(body.summaryText || "");
    const notes = String(body.notes || "");

    const metrics = (body.metrics && typeof body.metrics === "object") ? body.metrics : {};
    const context = (body.context && typeof body.context === "object") ? body.context : {};

    const db = admin.firestore();
    const ref = db.collection(COL).doc(dateISO);

    // Lê para manter idempotência do complete
    const snap = await ref.get();
    const existing = snap.exists ? snap.data() : null;

    const update = {
      dateISO,
      summaryText,
      notes,
      metrics,
      context,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      savedByUid: auth.uid,
    };

    if (!snap.exists) {
      update.createdAt = admin.firestore.FieldValue.serverTimestamp();
    }

    if (action === "complete") {
      if (!existing?.completedAt) {
        update.completedAt = admin.firestore.FieldValue.serverTimestamp();
        update.completedByUid = auth.uid;
      }
    }

    await ref.set(update, { merge: true });

    const after = await ref.get();
    const log = after.exists ? sanitizeLog(after.id, after.data()) : null;

    return NextResponse.json({ ok: true, log });
  } catch (err) {
    return adminError({ req, auth: auth?.ok ? auth : null, action: "ops_daily_log_post", err });
  }
}
