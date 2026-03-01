import { NextResponse } from "next/server";

import admin from "@/lib/firebaseAdmin";
import { getAdminApiSession } from "@/lib/server/getAdminApiSession";
import { getProfessionalSchedule } from "@/lib/server/agendapsiData";

export const dynamic = "force-dynamic";

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]; 

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
  const [h, m] = String(t || "0:0")
    .split(":")
    .map((x) => parseInt(x, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function isAligned(hhmm, stepMin) {
  const m = timeToMinutes(hhmm);
  return Number.isFinite(m) && m % stepMin === 0;
}

function clampInt(v, { min, max, fallback }) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function computeAvailabilityForDay({ enabled, start, end }, lunch) {
  if (!enabled) return [];
  if (!start || !end) return [];
  if (timeToMinutes(end) <= timeToMinutes(start)) return [];

  if (lunch?.enabled && lunch.start && lunch.end) {
    const ls = lunch.start;
    const le = lunch.end;
    // Only apply lunch if it is strictly inside the day.
    if (timeToMinutes(ls) > timeToMinutes(start) && timeToMinutes(le) < timeToMinutes(end)) {
      if (timeToMinutes(le) > timeToMinutes(ls)) {
        return [
          { start, end: ls },
          { start: le, end },
        ];
      }
    }
  }

  return [{ start, end }];
}

function validateAndBuildSchedule(body) {
  const slotIntervalMin = clampInt(body?.slotIntervalMin, { min: 30, max: 60, fallback: 30 });
  if (![30, 45, 60].includes(slotIntervalMin)) {
    throw new Error("slotIntervalMin deve ser 30, 45 ou 60");
  }

  const bufferMin = clampInt(body?.bufferMin, { min: 0, max: 60, fallback: 0 });
  const defaultDurationBlocks = clampInt(body?.defaultDurationBlocks, { min: 1, max: 8, fallback: 2 });

  const lunchBreakEnabled = body?.lunchBreakEnabled === true;
  const lunchStart = normalizeTimeHHMM(body?.lunchStart) || "12:00";
  const lunchEnd = normalizeTimeHHMM(body?.lunchEnd) || "13:00";
  if (lunchBreakEnabled) {
    if (!lunchStart || !lunchEnd) throw new Error("Informe horário de almoço (início e fim)");
    if (timeToMinutes(lunchEnd) <= timeToMinutes(lunchStart)) {
      throw new Error("Horário de almoço inválido (fim deve ser depois do início)");
    }
    if (!isAligned(lunchStart, slotIntervalMin) || !isAligned(lunchEnd, slotIntervalMin)) {
      throw new Error("Horário de almoço precisa alinhar com o intervalo da grade");
    }
  }

  const weekWorkingHours = {};
  const weekAvailability = {};

  for (const key of WEEKDAY_KEYS) {
    const d = body?.weekWorkingHours?.[key] || {};
    const enabled = d?.enabled === true;
    const start = enabled ? normalizeTimeHHMM(d?.start) : null;
    const end = enabled ? normalizeTimeHHMM(d?.end) : null;

    if (enabled) {
      if (!start || !end) throw new Error(`Informe início e fim para ${key}`);
      if (timeToMinutes(end) <= timeToMinutes(start)) throw new Error(`Horário inválido em ${key}`);
      if (!isAligned(start, slotIntervalMin) || !isAligned(end, slotIntervalMin)) {
        throw new Error(`Horários de ${key} precisam alinhar com o intervalo da grade`);
      }
    }

    weekWorkingHours[key] = {
      enabled,
      start: start || "",
      end: end || "",
    };

    weekAvailability[key] = computeAvailabilityForDay(
      { enabled, start, end },
      lunchBreakEnabled ? { enabled: true, start: lunchStart, end: lunchEnd } : { enabled: false }
    );
  }

  return {
    slotIntervalMin,
    bufferMin,
    defaultDurationBlocks,
    lunchBreakEnabled,
    lunchStart,
    lunchEnd,
    weekWorkingHours,
    weekAvailability,
  };
}

export async function GET() {
  const session = await getAdminApiSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const schedule = await getProfessionalSchedule({ tenantId: session.tenantId });
    return NextResponse.json(schedule);
  } catch (e) {
    return NextResponse.json({ error: "bad_request", message: e?.message || "error" }, { status: 400 });
  }
}

export async function PUT(request) {
  const session = await getAdminApiSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    const schedule = validateAndBuildSchedule(body);

    const db = admin.firestore();
    const ref = db.collection("tenants").doc(session.tenantId).collection("settings").doc("schedule");

    const snap = await ref.get();
    const payload = {
      ...schedule,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (!snap.exists) payload.createdAt = admin.firestore.FieldValue.serverTimestamp();

    await ref.set(payload, { merge: true });

    const saved = await getProfessionalSchedule({ tenantId: session.tenantId });
    return NextResponse.json({ ok: true, schedule: saved });
  } catch (e) {
    return NextResponse.json({ error: "bad_request", message: e?.message || "error" }, { status: 400 });
  }
}
