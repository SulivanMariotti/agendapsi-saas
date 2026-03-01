import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { adminError } from "@/lib/server/adminError";
import { readJsonObjectBody } from "@/lib/server/payloadSchema";

export const runtime = "nodejs";

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]; // keep consistent with server data

function normalizeTimeHHMM(v) {
  const s = String(v || "").trim();
  if (!s) return null;
  const parts = s.split(":");
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timeToMinutes(t) {
  const [h, m] = String(t || "0:0").split(":").map((x) => parseInt(x, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function safeInt(v, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function resolveTenantIdFromReq(req) {
  const { searchParams } = new URL(req.url);
  const fromQuery = String(searchParams.get("tenantId") || "").trim();
  const fromEnv = String(process.env.AGENDA_PSI_TENANT_ID || "").trim();
  return fromQuery || fromEnv || "tn_JnA5yU";
}

function buildDefaultSchedule() {
  const week = {
    mon: { enabled: true, start: "08:00", end: "18:00" },
    tue: { enabled: true, start: "08:00", end: "18:00" },
    wed: { enabled: true, start: "08:00", end: "18:00" },
    thu: { enabled: true, start: "08:00", end: "18:00" },
    fri: { enabled: true, start: "08:00", end: "18:00" },
    sat: { enabled: false, start: "08:00", end: "12:00" },
    sun: { enabled: false, start: "08:00", end: "12:00" },
  };

  return {
    slotIntervalMin: 30,
    defaultBlocks: 2,
    bufferMin: 0,
    lunch: { enabled: false, start: "12:00", end: "13:00" },
    week,
    weekAvailability: {},
  };
}

function normalizeScheduleInput(input) {
  const out = buildDefaultSchedule();

  const slot = safeInt(input?.slotIntervalMin, out.slotIntervalMin);
  out.slotIntervalMin = [30, 45, 60].includes(slot) ? slot : out.slotIntervalMin;

  const blocks = safeInt(input?.defaultBlocks, out.defaultBlocks);
  out.defaultBlocks = Math.max(1, Math.min(8, blocks));

  const buffer = safeInt(input?.bufferMin, out.bufferMin);
  out.bufferMin = Math.max(0, Math.min(120, buffer));

  const lunchEnabled = Boolean(input?.lunch?.enabled);
  const lunchStart = normalizeTimeHHMM(input?.lunch?.start) || out.lunch.start;
  const lunchEnd = normalizeTimeHHMM(input?.lunch?.end) || out.lunch.end;
  out.lunch = { enabled: lunchEnabled, start: lunchStart, end: lunchEnd };

  // week config
  const weekIn = input?.week || {};
  const week = {};
  for (const k of WEEKDAY_KEYS) {
    const w = weekIn?.[k] || {};
    const enabled = Boolean(w?.enabled);
    const start = normalizeTimeHHMM(w?.start) || out.week[k].start;
    const end = normalizeTimeHHMM(w?.end) || out.week[k].end;
    week[k] = { enabled, start, end };
  }
  out.week = week;

  // derive weekAvailability (effective ranges)
  const avail = {};
  for (const k of WEEKDAY_KEYS) {
    const d = week[k];
    if (!d?.enabled) {
      avail[k] = [];
      continue;
    }

    const startMin = timeToMinutes(d.start);
    const endMin = timeToMinutes(d.end);
    if (!(endMin > startMin)) {
      // invalid bounds: treat as disabled
      avail[k] = [];
      continue;
    }

    const ranges = [{ start: d.start, end: d.end }];

    if (out.lunch.enabled) {
      const ls = timeToMinutes(out.lunch.start);
      const le = timeToMinutes(out.lunch.end);
      const overlaps = le > ls && le > startMin && ls < endMin;
      const inside = overlaps && ls > startMin && le < endMin;
      if (inside) {
        const aLen = ls - startMin;
        const bLen = endMin - le;

        const nextRanges = [];
        if (aLen >= out.slotIntervalMin) nextRanges.push({ start: d.start, end: out.lunch.start });
        if (bLen >= out.slotIntervalMin) nextRanges.push({ start: out.lunch.end, end: d.end });
        avail[k] = nextRanges;
      } else {
        // lunch not fully inside -> don't split
        avail[k] = ranges;
      }
    } else {
      avail[k] = ranges;
    }
  }
  out.weekAvailability = avail;

  return out;
}

export async function GET(req) {
  let auth = null;
  try {
    auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const rl = await rateLimit(req, { bucket: "admin:agendapsi:schedule:get", uid: auth.uid, limit: 120, windowMs: 60_000 });
    if (!rl.ok) return rl.res;

    const tenantId = resolveTenantIdFromReq(req);
    const ref = admin.firestore().collection("tenants").doc(tenantId).collection("settings").doc("schedule");
    const snap = await ref.get();

    const data = snap.exists ? snap.data() : null;
    const normalized = normalizeScheduleInput(data || {});

    return NextResponse.json(
      {
        ok: true,
        tenantId,
        schedule: {
          slotIntervalMin: normalized.slotIntervalMin,
          defaultBlocks: normalized.defaultBlocks,
          bufferMin: normalized.bufferMin,
          lunch: normalized.lunch,
          week: normalized.week,
          weekAvailability: normalized.weekAvailability,
        },
      },
      { status: 200 }
    );
  } catch (e) {
    return adminError({ req, auth: auth?.ok ? auth : null, action: "agendapsi_schedule_get", err: e });
  }
}

export async function PUT(req) {
  let auth = null;
  try {
    auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const rl = await rateLimit(req, { bucket: "admin:agendapsi:schedule:put", uid: auth.uid, limit: 30, windowMs: 60_000 });
    if (!rl.ok) return rl.res;

    const bodyRes = await readJsonObjectBody(req, {
      maxBytes: 100_000,
      defaultValue: {},
      allowedKeys: ["tenantId", "slotIntervalMin", "defaultBlocks", "bufferMin", "lunch", "week"],
      label: "agendapsi-schedule",
      showKeys: true,
    });
    if (!bodyRes.ok) return NextResponse.json({ ok: false, error: bodyRes.error }, { status: 400 });
    const body = bodyRes.value;

    const tenantId = String(body?.tenantId || "").trim() || resolveTenantIdFromReq(req);
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "tenantId é obrigatório." }, { status: 400 });
    }

    const normalized = normalizeScheduleInput(body);

    const ref = admin.firestore().collection("tenants").doc(tenantId).collection("settings").doc("schedule");
    const snap = await ref.get();

    const now = admin.firestore.FieldValue.serverTimestamp();

    const payload = {
      slotIntervalMin: normalized.slotIntervalMin,
      defaultBlocks: normalized.defaultBlocks,
      bufferMin: normalized.bufferMin,
      lunch: normalized.lunch,
      week: normalized.week,
      weekAvailability: normalized.weekAvailability,
      updatedAt: now,
    };

    if (!snap.exists) {
      payload.createdAt = now;
    }

    await ref.set(payload, { merge: true });

    return NextResponse.json({ ok: true, tenantId }, { status: 200 });
  } catch (e) {
    return adminError({ req, auth: auth?.ok ? auth : null, action: "agendapsi_schedule_put", err: e });
  }
}
