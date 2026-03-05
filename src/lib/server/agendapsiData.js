import admin from "@/lib/firebaseAdmin";
import { getTenantPlan, getLimit } from "@/lib/server/tenantPlan";

function toIsoDate(d) {
  try {
    return new Date(d).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function normalizeSearchParam(v) {
  if (Array.isArray(v)) return v[0];
  return v;
}

function normalizeIsoDate(v) {
  if (!v) return null;
  // Accept Date objects
  if (v instanceof Date) return toIsoDate(v);
  const s = String(v || "").trim();
  if (!s) return null;
  const s10 = s.includes("T") ? s.slice(0, 10) : s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s10)) return s10;
  return null;
}

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

function makeSlotKey(isoDate, startTime) {
  const iso = normalizeIsoDate(isoDate) || String(isoDate || "").trim();
  const st = normalizeTimeHHMM(startTime) || String(startTime || "").trim();
  return `${iso}#${st}`;
}

function safeToDate(tsOrDate) {
  if (!tsOrDate) return null;
  // Firestore Timestamp
  if (typeof tsOrDate.toDate === "function") return tsOrDate.toDate();
  if (tsOrDate instanceof Date) return tsOrDate;
  const d = new Date(tsOrDate);
  return Number.isFinite(d.getTime()) ? d : null;
}

function plain(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function minutesToTime(m) {
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function timeToMinutes(t) {
  const [h, m] = String(t || "0:0").split(":").map((x) => parseInt(x, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

// ------------------------------------------------------------
// Billing/Planos — enforcement (Pós-MVP)
// - Limites por tenant são definidos em src/lib/server/tenantPlan.js
// - Aplicamos enforcement no momento de criação de:
//   - pacientes (tenants/{tenantId}/patients)
//   - séries (tenants/{tenantId}/appointmentSeries) — inclui holds
// ------------------------------------------------------------

async function getQueryCount(q) {
  try {
    if (typeof q?.count === "function") {
      const snap = await q.count().get();
      const data = snap?.data?.() || {};
      const n = Number(data?.count);
      return Number.isFinite(n) ? n : 0;
    }
  } catch {
    // fallback abaixo
  }

  // Fallback seguro (best-effort): busca pequena amostra.
  // Em ambientes modernos, o Admin SDK já suporta count().
  const snap = await q.limit(2000).get();
  return (snap?.docs || []).length;
}

async function enforcePlanLimitMaxDocs({ tenantRef, tenantId, limitKey, collectionName, friendlyName }) {
  const plan = await getTenantPlan(tenantId);
  const max = getLimit(plan, limitKey, null);
  if (!Number.isFinite(Number(max))) return;

  const q = tenantRef.collection(collectionName);
  const total = await getQueryCount(q);

  if (total >= Number(max)) {
    const err = new Error(`Limite do plano atingido (máx. ${max} ${friendlyName}).`);
    err.code = "PLAN_LIMIT_EXCEEDED";
    err.planId = plan.planId;
    err.limitKey = limitKey;
    err.limit = Number(max);
    err.current = total;
    throw err;
  }
}




const RECURRENCE_FREQUENCIES = ["daily", "weekly", "biweekly", "monthly"];

function normalizeRecurrenceFrequency(v) {
  const s = String(v || "").trim().toLowerCase();
  if (RECURRENCE_FREQUENCIES.includes(s)) return s;
  return null;
}

function normalizePlannedTotalSessions(v) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(200, n));
}

function addDaysIso(isoDate, days) {
  const d = dateMidnightUtc(isoDate);
  d.setUTCDate(d.getUTCDate() + (parseInt(days, 10) || 0));
  return d.toISOString().slice(0, 10);
}

function addMonthsIso(isoDate, months) {
  const d = dateMidnightUtc(isoDate);
  d.setUTCMonth(d.getUTCMonth() + (parseInt(months, 10) || 0));
  return d.toISOString().slice(0, 10);
}

function buildRecurrenceIsoDates({ startIsoDate, frequency, count }) {
  const freq = normalizeRecurrenceFrequency(frequency) || "weekly";
  const n = normalizePlannedTotalSessions(count);
  const out = [];
  let cur = startIsoDate;
  for (let i = 0; i < n; i++) {
    out.push(cur);
    if (i === n - 1) break;
    if (freq === "daily") cur = addDaysIso(cur, 1);
    else if (freq === "weekly") cur = addDaysIso(cur, 7);
    else if (freq === "biweekly") cur = addDaysIso(cur, 14);
    else if (freq === "monthly") cur = addMonthsIso(cur, 1);
  }
  return out;
}


function addMinutesToHHMM(hhmm, deltaMin) {
  const base = timeToMinutes(hhmm);
  const next = base + (Number(deltaMin) || 0);
  if (!Number.isFinite(next) || next < 0 || next >= 24 * 60) return null;
  return minutesToTime(next);
}

function getSlotIntervalMin(schedule) {
  const v = Number(schedule?.slotIntervalMin);
  if (Number.isFinite(v) && v > 0) return v;
  // Fallback legacy field
  const legacy = Number(schedule?.sessionDurationMin);
  // legacy is session duration, not slot, but better than nothing for early stage
  if (Number.isFinite(legacy) && legacy > 0) return legacy;
  return 30;
}

function normalizeBlocks(blocks, slotIntervalMin, durationMin) {
  const b = parseInt(blocks, 10);
  if (Number.isFinite(b) && b > 0) return Math.max(1, Math.min(8, b));
  const dur = Number(durationMin);
  if (Number.isFinite(dur) && dur > 0) {
    return Math.max(1, Math.min(8, Math.ceil(dur / slotIntervalMin)));
  }
  return 1;
}

function deriveDayBounds(schedule, weekdayKey) {
  // Supports weekAvailability: { mon: [{start,end}], ... }
  const ranges = schedule?.weekAvailability?.[weekdayKey];
  if (Array.isArray(ranges) && ranges.length) {
    const starts = ranges.map((r) => timeToMinutes(r?.start)).filter(Number.isFinite);
    const ends = ranges.map((r) => timeToMinutes(r?.end)).filter(Number.isFinite);
    if (starts.length && ends.length) {
      const startMin = Math.min(...starts);
      const endMin = Math.max(...ends);
      if (endMin > startMin) return { start: minutesToTime(startMin), end: minutesToTime(endMin) };
    }
  }
  // fallback for seed / early stage
  return { start: "07:00", end: "20:00" };
}

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function resolveTenantId(searchParams) {
  const t = normalizeSearchParam(searchParams?.tenantId);
  return t || process.env.AGENDA_PSI_TENANT_ID || "tn_JnA5yU";
}

export function resolveIsoDate(searchParams) {
  const d = normalizeSearchParam(searchParams?.date);
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return toIsoDate(new Date());
}

export async function getProfessionalDayData({ tenantId, isoDate }) {
  const db = admin.firestore();
  const tenantRef = db.collection("tenants").doc(tenantId);

  const day = new Date(`${isoDate}T00:00:00.000Z`);
  // Keep user's timezone differences out of Firestore querying for now.
  // We query by UTC boundaries and render in UI with isoDate.
  const start = new Date(day);
  const end = new Date(day);
  end.setUTCDate(end.getUTCDate() + 1);

  // schedule
  const scheduleSnap = await tenantRef.collection("settings").doc("schedule").get();
  const schedule = scheduleSnap.exists ? scheduleSnap.data() : null;

  const weekdayKey = WEEKDAY_KEYS[new Date(`${isoDate}T12:00:00.000Z`).getUTCDay()];
  const dayBounds = deriveDayBounds(schedule, weekdayKey);

  // Ranges efetivos do dia (ex.: almoço removido). Usado para renderizar a grade.
  const dayRangesRaw = schedule?.weekAvailability?.[weekdayKey];
  const dayRanges = Array.isArray(dayRangesRaw)
    ? dayRangesRaw
        .map((r) => ({ start: normalizeTimeHHMM(r?.start), end: normalizeTimeHHMM(r?.end) }))
        .filter((r) => r.start && r.end && timeToMinutes(r.end) > timeToMinutes(r.start))
    : [];

  // occurrences for the day
  const occQuerySnap = await tenantRef
    .collection("appointmentOccurrences")
    .where("date", ">=", start)
    .where("date", "<", end)
    .orderBy("date", "asc")
    .get();

  const occurrences = occQuerySnap.docs.map((doc) => {
    const d = doc.data() || {};
    const date = safeToDate(d.date);
    return {
      id: doc.id,
      ...d,
      dateIso: date ? toIsoDate(date) : isoDate,
    };
  });

  // hydrate patients and series
  const patientIds = Array.from(new Set(occurrences.map((o) => o.patientId).filter(Boolean)));
  const seriesIds = Array.from(new Set(occurrences.map((o) => o.seriesId).filter(Boolean)));

  const patientRefs = patientIds.map((id) => tenantRef.collection("patients").doc(id));
  const seriesRefs = seriesIds.map((id) => tenantRef.collection("appointmentSeries").doc(id));

  const patientSnaps = patientRefs.length ? await db.getAll(...patientRefs) : [];
  const seriesSnaps = seriesRefs.length ? await db.getAll(...seriesRefs) : [];

  const patientsById = {};
  for (const s of patientSnaps) {
    if (!s.exists) continue;
    patientsById[s.id] = { id: s.id, ...s.data() };
  }

  const seriesById = {};
  for (const s of seriesSnaps) {
    if (!s.exists) continue;
    const d = s.data() || {};
    seriesById[s.id] = {
      id: s.id,
      ...d,
      startDateIso: d.startDate ? toIsoDate(safeToDate(d.startDate)) : null,
      endDateIso: d.endDate ? toIsoDate(safeToDate(d.endDate)) : null,
    };
  }

  // whatsapp templates
  const waSnap = await tenantRef.collection("whatsappTemplates").get();
  const whatsappTemplates = waSnap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
    .filter((t) => t && t.isActive !== false)
    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));

  return plain({
    tenantId,
    isoDate,
    weekdayKey,
    dayBounds,
    dayRanges,
    schedule: schedule ? { id: scheduleSnap.id, ...schedule } : null,
    occurrences,
    patientsById,
    seriesById,
    whatsappTemplates,
  });
}



function weekStartIsoFromIsoDate(isoDate) {
  const iso = normalizeIsoDate(isoDate) || String(isoDate || '').slice(0, 10) || toIsoDate(new Date());
  const d = new Date(`${iso}T12:00:00.000Z`);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const diffToMon = (dow + 6) % 7; // Mon => 0
  d.setUTCDate(d.getUTCDate() - diffToMon);
  return d.toISOString().slice(0, 10);
}

export async function getProfessionalWeekData({ tenantId, isoDate }) {
  if (!tenantId) throw new Error('tenantId required');

  const db = admin.firestore();
  const tenantRef = db.collection('tenants').doc(tenantId);

  // schedule
  const scheduleSnap = await tenantRef.collection('settings').doc('schedule').get();
  const scheduleRaw = scheduleSnap.exists ? scheduleSnap.data() : null;
  const schedule = normalizeScheduleForRead(scheduleRaw || {});

  const anchorIso = normalizeIsoDate(isoDate) || toIsoDate(new Date());
  const weekStartIso = weekStartIsoFromIsoDate(anchorIso);

  const start = dateMidnightUtc(weekStartIso);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);

  const occQuerySnap = await tenantRef
    .collection('appointmentOccurrences')
    .where('date', '>=', start)
    .where('date', '<', end)
    .orderBy('date', 'asc')
    .limit(2000)
    .get();

  const occurrences = occQuerySnap.docs.map((doc) => {
    const d = doc.data() || {};
    const dt = safeToDate(d.date);
    return {
      id: doc.id,
      ...d,
      dateIso: dt ? toIsoDate(dt) : null,
    };
  });

  const occByDate = {};
  for (const o of occurrences) {
    const iso = normalizeIsoDate(o?.dateIso) || (o?.dateIso ? String(o.dateIso).slice(0, 10) : null);
    if (!iso) continue;
    (occByDate[iso] = occByDate[iso] || []).push(o);
  }

  // hydrate patients for names
  const patientIds = Array.from(new Set(occurrences.map((o) => o.patientId).filter(Boolean)));
  const patientRefs = patientIds.map((id) => tenantRef.collection('patients').doc(id));
  const patientSnaps = patientRefs.length ? await db.getAll(...patientRefs) : [];

  const patientsById = {};
  for (const s of patientSnaps) {
    if (!s.exists) continue;
    patientsById[s.id] = { id: s.id, ...(s.data() || {}) };
  }

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = dateMidnightUtc(weekStartIso);
    d.setUTCDate(d.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const weekdayKey = getWeekdayKeyFromIsoDate(iso);
    const dayBounds = deriveDayBounds(schedule, weekdayKey);

    const dayRangesRaw = schedule?.weekAvailability?.[weekdayKey];
    const dayRanges = Array.isArray(dayRangesRaw)
      ? dayRangesRaw
          .map((r) => ({ start: normalizeTimeHHMM(r?.start), end: normalizeTimeHHMM(r?.end) }))
          .filter((r) => r.start && r.end && timeToMinutes(r.end) > timeToMinutes(r.start))
      : [];

    const dayOcc = occByDate[iso] || [];

    days.push(
      plain({
        isoDate: iso,
        weekdayKey,
        dayBounds,
        dayRanges,
        occurrences: dayOcc,
      })
    );
  }


  // whatsapp templates
  const waSnap = await tenantRef.collection("whatsappTemplates").get();
  const whatsappTemplates = waSnap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
    .filter((t) => t && t.isActive !== false)
    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));

  return plain({
    tenantId,
    isoDate: anchorIso,
    view: 'week',
    weekStartIso,
    schedule,
    days,
    patientsById,
    whatsappTemplates,
  });
}

function monthStartIsoFromIsoDate(isoDate) {
  const iso = normalizeIsoDate(isoDate) || toIsoDate(new Date());
  const d = new Date(`${iso}T12:00:00.000Z`);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  return new Date(Date.UTC(y, m, 1, 12, 0, 0)).toISOString().slice(0, 10);
}

function monthEndIsoFromIsoDate(isoDate) {
  const iso = normalizeIsoDate(isoDate) || toIsoDate(new Date());
  const d = new Date(`${iso}T12:00:00.000Z`);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  return new Date(Date.UTC(y, m + 1, 0, 12, 0, 0)).toISOString().slice(0, 10);
}

function monthGridStartIsoFromIsoDate(isoDate) {
  return weekStartIsoFromIsoDate(monthStartIsoFromIsoDate(isoDate));
}

function monthGridEndIsoFromIsoDate(isoDate) {
  const lastIso = monthEndIsoFromIsoDate(isoDate);
  const weekStart = weekStartIsoFromIsoDate(lastIso);
  const d = dateMidnightUtc(weekStart);
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

export async function getProfessionalMonthData({ tenantId, isoDate }) {
  if (!tenantId) throw new Error("tenantId required");

  const db = admin.firestore();
  const tenantRef = db.collection("tenants").doc(tenantId);

  // schedule (to mark days as open/closed if needed)
  const scheduleSnap = await tenantRef.collection("settings").doc("schedule").get();
  const scheduleRaw = scheduleSnap.exists ? scheduleSnap.data() : null;
  const schedule = normalizeScheduleForRead(scheduleRaw || {});

  const anchorIso = normalizeIsoDate(isoDate) || toIsoDate(new Date());
  const monthStartIso = monthStartIsoFromIsoDate(anchorIso);
  const monthEndIso = monthEndIsoFromIsoDate(anchorIso);
  const gridStartIso = monthGridStartIsoFromIsoDate(anchorIso);
  const gridEndIso = monthGridEndIsoFromIsoDate(anchorIso);

  const start = dateMidnightUtc(gridStartIso);
  const end = dateMidnightUtc(gridEndIso);
  end.setUTCDate(end.getUTCDate() + 1);

  const occQuerySnap = await tenantRef
    .collection("appointmentOccurrences")
    .where("date", ">=", start)
    .where("date", "<", end)
    .orderBy("date", "asc")
    .limit(5000)
    .get();

  const occurrences = occQuerySnap.docs
    .map((doc) => {
      const d = doc.data() || {};
      const dt = safeToDate(d.date);
      return {
        id: doc.id,
        ...d,
        dateIso: dt ? toIsoDate(dt) : null,
      };
    })
    // month view only needs the first slot (avoid duplicated blocks)
    .filter((o) => o && o.isBlock !== true);

  const occByDate = {};
  for (const o of occurrences) {
    const iso = normalizeIsoDate(o?.dateIso) || (o?.dateIso ? String(o.dateIso).slice(0, 10) : null);
    if (!iso) continue;
    (occByDate[iso] = occByDate[iso] || []).push(o);
  }

  // hydrate patients for names
  const patientIds = Array.from(new Set(occurrences.map((o) => o.patientId).filter(Boolean)));
  const patientRefs = patientIds.map((id) => tenantRef.collection("patients").doc(id));
  const patientSnaps = patientRefs.length ? await db.getAll(...patientRefs) : [];

  const patientsById = {};
  for (const s of patientSnaps) {
    if (!s.exists) continue;
    patientsById[s.id] = { id: s.id, ...(s.data() || {}) };
  }

  const days = [];
  const totalDays = Math.max(1, Math.min(60, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))));
  for (let i = 0; i < totalDays; i++) {
    const d = dateMidnightUtc(gridStartIso);
    d.setUTCDate(d.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const weekdayKey = getWeekdayKeyFromIsoDate(iso);

    const inMonth = iso.slice(0, 7) === monthStartIso.slice(0, 7);
    const isOpenDay = Array.isArray(schedule?.weekAvailability?.[weekdayKey]) && schedule.weekAvailability[weekdayKey].length > 0;

    days.push(
      plain({
        isoDate: iso,
        weekdayKey,
        inMonth,
        isOpenDay,
        occurrences: occByDate[iso] || [],
      })
    );
  }


  // whatsapp templates
  const waSnap = await tenantRef.collection("whatsappTemplates").get();
  const whatsappTemplates = waSnap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
    .filter((t) => t && t.isActive !== false)
    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));

  return plain({
    tenantId,
    isoDate: anchorIso,
    view: "month",
    monthAnchorIso: anchorIso,
    monthStartIso,
    monthEndIso,
    gridStartIso,
    gridEndIso,
    schedule,
    days,
    patientsById,
  });
}

function clampInt(v, { min, max, fallback }) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
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

function computeWeekAvailability({ slotIntervalMin, week, lunch }) {
  const avail = {};
  for (const k of WEEKDAY_KEYS) {
    const d = week?.[k];
    if (!d?.enabled) {
      avail[k] = [];
      continue;
    }

    const start = normalizeTimeHHMM(d?.start);
    const end = normalizeTimeHHMM(d?.end);
    if (!start || !end) {
      avail[k] = [];
      continue;
    }

    const startMin = timeToMinutes(start);
    const endMin = timeToMinutes(end);
    if (!(endMin > startMin)) {
      avail[k] = [];
      continue;
    }

    const ranges = [{ start, end }];

    if (lunch?.enabled) {
      const ls = timeToMinutes(normalizeTimeHHMM(lunch.start));
      const le = timeToMinutes(normalizeTimeHHMM(lunch.end));
      const inside = Number.isFinite(ls) && Number.isFinite(le) && le > ls && ls > startMin && le < endMin;
      if (inside) {
        const aLen = ls - startMin;
        const bLen = endMin - le;

        const out = [];
        if (aLen >= slotIntervalMin) out.push({ start, end: normalizeTimeHHMM(lunch.start) });
        if (bLen >= slotIntervalMin) out.push({ start: normalizeTimeHHMM(lunch.end), end });
        avail[k] = out;
      } else {
        avail[k] = ranges;
      }
    } else {
      avail[k] = ranges;
    }
  }
  return avail;
}

function normalizeScheduleForRead(raw) {
  const out = buildDefaultSchedule();
  const src = raw || {};

  // slot interval
  const slot = clampInt(src?.slotIntervalMin, { min: 30, max: 60, fallback: out.slotIntervalMin });
  out.slotIntervalMin = [30, 45, 60].includes(slot) ? slot : out.slotIntervalMin;

  // default blocks (supports legacy field names)
  const legacyBlocks = src?.defaultDurationBlocks ?? src?.defaultBlocks;
  out.defaultBlocks = clampInt(legacyBlocks, { min: 1, max: 8, fallback: out.defaultBlocks });

  // buffer
  out.bufferMin = clampInt(src?.bufferMin, { min: 0, max: 120, fallback: out.bufferMin });

  // lunch (supports legacy fields)
  if (src?.lunch && typeof src.lunch === "object") {
    out.lunch = {
      enabled: Boolean(src.lunch.enabled),
      start: normalizeTimeHHMM(src.lunch.start) || out.lunch.start,
      end: normalizeTimeHHMM(src.lunch.end) || out.lunch.end,
    };
  } else {
    const enabled = Boolean(src?.lunchBreakEnabled);
    out.lunch = {
      enabled,
      start: normalizeTimeHHMM(src?.lunchStart) || out.lunch.start,
      end: normalizeTimeHHMM(src?.lunchEnd) || out.lunch.end,
    };
  }

  // week (supports legacy weekWorkingHours)
  if (src?.week && typeof src.week === "object") {
    const w = {};
    for (const k of WEEKDAY_KEYS) {
      const d = src.week?.[k] || {};
      w[k] = {
        enabled: Boolean(d?.enabled),
        start: normalizeTimeHHMM(d?.start) || out.week[k].start,
        end: normalizeTimeHHMM(d?.end) || out.week[k].end,
      };
    }
    out.week = w;
  } else if (src?.weekWorkingHours && typeof src.weekWorkingHours === "object") {
    const w = {};
    for (const k of WEEKDAY_KEYS) {
      const d = src.weekWorkingHours?.[k] || {};
      w[k] = {
        enabled: Boolean(d?.enabled),
        start: normalizeTimeHHMM(d?.start) || out.week[k].start,
        end: normalizeTimeHHMM(d?.end) || out.week[k].end,
      };
    }
    out.week = w;
  }

  // weekAvailability
  const wa = src?.weekAvailability;
  if (wa && typeof wa === "object") {
    const avail = {};
    for (const k of WEEKDAY_KEYS) {
      const arr = Array.isArray(wa?.[k]) ? wa[k] : [];
      avail[k] = arr
        .map((r) => ({ start: normalizeTimeHHMM(r?.start), end: normalizeTimeHHMM(r?.end) }))
        .filter((r) => r.start && r.end && timeToMinutes(r.end) > timeToMinutes(r.start));
    }
    out.weekAvailability = avail;
  } else {
    out.weekAvailability = computeWeekAvailability({
      slotIntervalMin: out.slotIntervalMin,
      week: out.week,
      lunch: out.lunch,
    });
  }

  return out;
}

/**
 * Compat helper usado por rotas antigas (/api/admin/schedule e /api/professional/schedule).
 * Mantemos para evitar quebra durante a transição para a config embutida no /admin.
 */
export async function getProfessionalSchedule({ tenantId }) {
  const db = admin.firestore();
  const ref = db.collection("tenants").doc(tenantId).collection("settings").doc("schedule");
  const snap = await ref.get();
  const raw = snap.exists ? snap.data() : {};
  return plain({
    tenantId,
    ...normalizeScheduleForRead(raw),
  });
}

function getWeekdayKeyFromIsoDate(isoDate) {
  const iso = normalizeIsoDate(isoDate) || String(isoDate || "").slice(0, 10);
  const d = new Date(`${iso}T12:00:00.000Z`);
  return WEEKDAY_KEYS[d.getUTCDay()] || "mon";
}

function buildSlotsFromRanges(ranges, stepMin) {
  const out = [];
  for (const r of ranges || []) {
    const s = normalizeTimeHHMM(r?.start);
    const e = normalizeTimeHHMM(r?.end);
    if (!s || !e) continue;
    const start = timeToMinutes(s);
    const end = timeToMinutes(e);
    if (!(end > start)) continue;
    for (let m = start; m < end; m += stepMin) out.push(minutesToTime(m));
  }
  return Array.from(new Set(out)).sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
}

async function fetchOccurrencesForDay(tenantRef, isoDate) {
  const iso = normalizeIsoDate(isoDate) || String(isoDate || "").slice(0, 10);
  const start = dateMidnightUtc(iso);
  const end = dateMidnightUtc(iso);
  end.setUTCDate(end.getUTCDate() + 1);

  const snap = await tenantRef
    .collection("appointmentOccurrences")
    .where("date", ">=", start)
    .where("date", "<", end)
    .orderBy("date", "asc")
    .limit(500)
    .get();

  return snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
}

function computeBlockedTimesForDay({ occurrences, slotIntervalMin, scheduleBufferMin }) {
  const blocked = new Set();
  for (const o of occurrences || []) {
    if (o?.startTime) blocked.add(String(o.startTime));
  }

  const main = (occurrences || []).filter((o) => o && o.isBlock !== true && o.startTime);
  for (const o of main) {
    const blocks = Number(o.durationBlocks) > 0 ? Number(o.durationBlocks) : 1;
    const slot = Number(o.slotIntervalMin) > 0 ? Number(o.slotIntervalMin) : slotIntervalMin;
    const bufferMin =
      Number(o.bufferMin) > 0
        ? Number(o.bufferMin)
        : Number(scheduleBufferMin) > 0
        ? Number(scheduleBufferMin)
        : 0;
    if (!bufferMin) continue;

    const endMin = timeToMinutes(o.startTime) + blocks * slot;
    if (!Number.isFinite(endMin)) continue;
    const bufferBlocks = Math.ceil(bufferMin / slotIntervalMin);
    for (let i = 0; i < bufferBlocks; i++) {
      const m = endMin + i * slotIntervalMin;
      if (m < 0 || m >= 24 * 60) continue;
      blocked.add(minutesToTime(m));
    }
  }

  return blocked;
}

function roundUpToSlot(timeHHMM, slotIntervalMin) {
  const t = normalizeTimeHHMM(timeHHMM);
  if (!t) return "00:00";
  const m = timeToMinutes(t);
  const rounded = Math.ceil(m / slotIntervalMin) * slotIntervalMin;
  if (!Number.isFinite(rounded) || rounded < 0) return "00:00";
  if (rounded >= 24 * 60) return "23:59";
  return minutesToTime(rounded);
}

export async function findNextAvailableSlots({
  tenantId,
  fromIsoDate,
  fromTime,
  durationBlocks,
  maxDays = 30,
  limit = 3,
}) {
  if (!tenantId) throw new Error("tenantId required");

  const schedule = await getProfessionalSchedule({ tenantId });
  const slotIntervalMin = getSlotIntervalMin(schedule);
  const blocks = normalizeBlocks(durationBlocks ?? schedule?.defaultBlocks, slotIntervalMin);
  const bufferMin = Number(schedule?.bufferMin) > 0 ? Number(schedule.bufferMin) : 0;

  const startIso = normalizeIsoDate(fromIsoDate) || toIsoDate(new Date());
  const startTime = normalizeTimeHHMM(fromTime) || "00:00";

  const maxN = Math.max(1, Math.min(10, parseInt(limit, 10) || 3));
  const out = [];

  const db = admin.firestore();
  const tenantRef = db.collection("tenants").doc(tenantId);

  for (let dayOffset = 0; dayOffset <= Math.max(0, Math.min(90, parseInt(maxDays, 10) || 30)); dayOffset++) {
    if (out.length >= maxN) break;

    const d = dateMidnightUtc(startIso);
    d.setUTCDate(d.getUTCDate() + dayOffset);
    const iso = d.toISOString().slice(0, 10);
    const weekdayKey = getWeekdayKeyFromIsoDate(iso);
    const ranges = Array.isArray(schedule?.weekAvailability?.[weekdayKey]) ? schedule.weekAvailability[weekdayKey] : [];
    if (!ranges.length) continue;

    const slots = buildSlotsFromRanges(ranges, slotIntervalMin);
    if (!slots.length) continue;
    const openSet = new Set(slots);

    const occurrences = await fetchOccurrencesForDay(tenantRef, iso);
    const blockedBase = computeBlockedTimesForDay({ occurrences, slotIntervalMin, scheduleBufferMin: bufferMin });
    const blocked = new Set(blockedBase);

    const threshold = dayOffset === 0 ? timeToMinutes(roundUpToSlot(startTime, slotIntervalMin)) : -1;

    for (const t of slots) {
      if (out.length >= maxN) break;
      if (dayOffset === 0 && timeToMinutes(t) < threshold) continue;

      let ok = true;

      // Must fit within open hours and not collide with occupied slots
      for (let b = 0; b < blocks; b++) {
        const tt = addMinutesToHHMM(t, b * slotIntervalMin);
        if (!tt || !openSet.has(tt) || blocked.has(tt)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      // Buffer after the candidate must not collide with existing events.
      const bufferBlocks = bufferMin ? Math.ceil(bufferMin / slotIntervalMin) : 0;
      if (bufferBlocks) {
        for (let i = 0; i < bufferBlocks; i++) {
          const tt = addMinutesToHHMM(t, (blocks + i) * slotIntervalMin);
          if (!tt) continue;
          if (blocked.has(tt)) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
      }

      out.push(plain({ isoDate: iso, startTime: t, durationBlocks: blocks }));

      // Avoid offering overlapping options: block the chosen interval + buffer for subsequent suggestions.
      for (let b = 0; b < blocks; b++) {
        const tt = addMinutesToHHMM(t, b * slotIntervalMin);
        if (tt) blocked.add(tt);
      }
      if (bufferBlocks) {
        for (let i = 0; i < bufferBlocks; i++) {
          const tt = addMinutesToHHMM(t, (blocks + i) * slotIntervalMin);
          if (tt) blocked.add(tt);
        }
      }
    }
  }

  return plain({ found: out.length > 0, slots: out, durationBlocks: blocks });
}

export async function findNextAvailableSlot({ tenantId, fromIsoDate, fromTime, durationBlocks, maxDays = 30 }) {
  const res = await findNextAvailableSlots({ tenantId, fromIsoDate, fromTime, durationBlocks, maxDays, limit: 1 });
  const first = res?.slots?.[0] || null;
  return plain({
    found: !!first,
    isoDate: first?.isoDate || null,
    startTime: first?.startTime || null,
    durationBlocks: res?.durationBlocks,
  });
}


const ALLOWED_STATUS = ["Agendado", "Confirmado", "Finalizado", "Não comparece", "Cancelado", "Reagendado"];

function normalizeCpf(cpf) {
  return String(cpf || "").replace(/\D+/g, "");
}

function normalizeMobile(m) {
  return String(m || "").replace(/\D+/g, "");
}

function onlyDigits(v) {
  return String(v || "").replace(/\D+/g, "").replace(/^0+/, "");
}

/**
 * Canonical phone (projeto): DDD + número (10/11 dígitos), SEM 55
 * - Aceita entradas com +55 / 55 / 0..., etc. (best-effort).
 */
function toPhoneCanonical(raw) {
  let d = onlyDigits(raw);
  if (!d) return "";
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length === 10 || d.length === 11) return d;
  if (d.length > 11) return d.slice(-11);
  return d;
}

function toPhoneE164(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (s.startsWith("+")) return s;
  const canon = toPhoneCanonical(s);
  if (!canon) return "";
  // MVP: assume BR (+55). Ajustável por tenant no futuro.
  return `+55${canon}`;
}

function isValidCpfDigits(cpfDigits) {
  const cpf = String(cpfDigits || "").replace(/\D+/g, "");
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  // calc check digits
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i], 10) * (10 - i);
  let d1 = 11 - (sum % 11);
  if (d1 >= 10) d1 = 0;
  if (d1 !== parseInt(cpf[9], 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i], 10) * (11 - i);
  let d2 = 11 - (sum % 11);
  if (d2 >= 10) d2 = 0;
  if (d2 !== parseInt(cpf[10], 10)) return false;

  return true;
}

function dateMidnightUtc(iso) {
  const i = normalizeIsoDate(iso) || String(iso || "").slice(0, 10);
  return new Date(`${i}T00:00:00.000Z`);
}

async function findOccurrenceAtSlot(tenantRef, { isoDate, startTime }) {
  const iso = normalizeIsoDate(isoDate);
  const st = normalizeTimeHHMM(startTime);
  if (iso && st) {
    const key = makeSlotKey(iso, st);
    const q1 = await tenantRef.collection("appointmentOccurrences").where("slotKey", "==", key).limit(1).get();
    if (!q1.empty) return q1.docs[0];
  }

  // Fallback: query by day range only (avoids composite index requirements) and filter in memory.
  const day = dateMidnightUtc(iso || String(isoDate || "").slice(0, 10));
  const next = dateMidnightUtc(iso || String(isoDate || "").slice(0, 10));
  next.setUTCDate(next.getUTCDate() + 1);

  const q = await tenantRef
    .collection("appointmentOccurrences")
    .where("date", ">=", day)
    .where("date", "<", next)
    .limit(100)
    .get();

  const target = st || String(startTime || "").trim();
  const found = q.docs.find((doc) => String((doc.data() || {}).startTime || "") === target);
  return found || null;
}


async function validateSeriesSlots({
  tenantRef,
  schedule,
  slotIntervalMin,
  blocks,
  isoDates,
  startTime,
  ignoreSeriesId = null,
  ignoreGroupIds = [],
}) {
  const ignoreGroups = new Set((ignoreGroupIds || []).map((x) => String(x || "")).filter(Boolean));

  for (const isoDate of isoDates) {
    const weekdayKey = getWeekdayKeyFromIsoDate(isoDate);
    const ranges = Array.isArray(schedule?.weekAvailability?.[weekdayKey]) ? schedule.weekAvailability[weekdayKey] : [];
    const openSlots = buildSlotsFromRanges(ranges, slotIntervalMin);
    const openSet = new Set(openSlots);
    if (!openSlots.length) throw new Error(`Dia sem horários abertos (${isoDate}).`);

    const occsRaw = await fetchOccurrencesForDay(tenantRef, isoDate);
    const occs = (occsRaw || []).filter((o) => {
      if (!o) return false;
      const sid = String(o.seriesId || "");
      const gid = String(o.groupId || "");
      if (ignoreSeriesId && sid && sid === ignoreSeriesId) return false;
      if (ignoreGroups.size && gid && ignoreGroups.has(gid)) return false;
      return true;
    });

    const blocked = computeBlockedTimesForDay({
      occurrences: occs,
      slotIntervalMin,
      scheduleBufferMin: schedule.bufferMin,
    });

    for (let b = 0; b < blocks; b++) {
      const slotTime = addMinutesToHHMM(startTime, b * slotIntervalMin);
      if (!slotTime) throw new Error("Horário inválido");
      if (!openSet.has(slotTime)) throw new Error(`Horário fora do período de atendimento (${isoDate} ${startTime}).`);
      if (blocked.has(slotTime)) throw new Error(`Conflito no horário (${isoDate} ${slotTime}).`);
    }

    if (schedule.bufferMin) {
      const bufferBlocks = Math.ceil(Number(schedule.bufferMin) / slotIntervalMin);
      for (let k = 0; k < bufferBlocks; k++) {
        const t2 = addMinutesToHHMM(startTime, (blocks + k) * slotIntervalMin);
        if (!t2) continue;
        if (blocked.has(t2)) throw new Error(`Conflito com buffer/intervalo (${isoDate} ${startTime}).`);
      }
    }
  }
}

function estimateOccurrenceWrites({ plannedTotalSessions, blocks, extraWrites = 1 }) {
  const n = normalizePlannedTotalSessions(plannedTotalSessions);
  const b = Math.max(1, Math.min(8, parseInt(blocks, 10) || 1));
  return n * b + (parseInt(extraWrites, 10) || 0);
}

async function createSeriesWithOccurrences({
  tenantRef,
  schedule,
  kind,
  startIsoDate,
  startTime,
  frequency,
  plannedTotalSessions,
  blocks,
  slotIntervalMin,
  durationMin,
  bufferMin,
  patientId = null,
  leadName = null,
  leadMobile = null,
}) {
  const n = normalizePlannedTotalSessions(plannedTotalSessions);
  const freq = normalizeRecurrenceFrequency(frequency) || "weekly";
  const isoDates = buildRecurrenceIsoDates({ startIsoDate, frequency: freq, count: n });

  const writes = estimateOccurrenceWrites({ plannedTotalSessions: n, blocks, extraWrites: 2 });
  if (writes > 450) throw new Error("Série muito grande para criar de uma vez. Reduza a quantidade de sessões.");

  await validateSeriesSlots({
    tenantRef,
    schedule,
    slotIntervalMin,
    blocks,
    isoDates,
    startTime,
  });

  const db = admin.firestore();

  await enforcePlanLimitMaxDocs({ tenantRef, tenantId: tenantRef.id, limitKey: "seriesMax", collectionName: "appointmentSeries", friendlyName: "séries" });

  const seriesRef = tenantRef.collection("appointmentSeries").doc();
  const seriesId = seriesRef.id;

  const startDate = dateMidnightUtc(isoDates[0]);
  const endDate = dateMidnightUtc(isoDates[isoDates.length - 1]);

  const batch = db.batch();
  batch.set(seriesRef, {
    kind,
    title: kind === "appointment" ? "Sessão" : "Reserva (hold)",
    startDate,
    endDate,
    startTime,
    frequency: freq,
    plannedTotalSessions: n,
    durationBlocks: blocks,
    slotIntervalMin,
    durationMin,
    bufferMin: Number(bufferMin) > 0 ? Number(bufferMin) : 0,
    patientId: patientId || null,
    leadName: kind === "hold" ? String(leadName || "").trim() : null,
    leadMobile: kind === "hold" ? String(leadMobile || "").trim() : null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const createdIds = [];

  for (let i = 0; i < isoDates.length; i++) {
    const dIso = isoDates[i];
    const d = dateMidnightUtc(dIso);

    const mainRef = tenantRef.collection("appointmentOccurrences").doc();
    const groupId = mainRef.id;
    createdIds.push(mainRef.id);

    batch.set(mainRef, {
      seriesId,
      patientId: patientId || null,
      groupId,
      parentOccurrenceId: null,
      isBlock: false,
      blockIndex: 1,
      durationBlocks: blocks,
      slotIntervalMin,
      slotKey: makeSlotKey(dIso, startTime),
      date: d,
      startTime,
      durationMin,
      bufferMin: Number(bufferMin) > 0 ? Number(bufferMin) : 0,
      sessionIndex: i + 1,
      plannedTotalSessions: isoDates.length,
      status: "Agendado",
      isHold: kind === "hold",
      leadName: kind === "hold" ? String(leadName || "").trim() : null,
      leadMobile: kind === "hold" ? String(leadMobile || "").trim() : null,
      occurrenceCodeId: null,
      observation: "",
      progressNote: "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    for (let b = 1; b < blocks; b++) {
      const slotTime = addMinutesToHHMM(startTime, b * slotIntervalMin);
      const blockRef = tenantRef.collection("appointmentOccurrences").doc();
      batch.set(blockRef, {
        seriesId,
        patientId: patientId || null,
        groupId,
        parentOccurrenceId: mainRef.id,
        isBlock: true,
        blockIndex: b + 1,
        durationBlocks: blocks,
        slotIntervalMin,
        slotKey: makeSlotKey(dIso, slotTime),
        date: d,
        startTime: slotTime,
        durationMin,
        bufferMin: Number(bufferMin) > 0 ? Number(bufferMin) : 0,
        sessionIndex: i + 1,
        plannedTotalSessions: isoDates.length,
        status: "Agendado",
        isHold: kind === "hold",
        leadName: kind === "hold" ? String(leadName || "").trim() : null,
        leadMobile: kind === "hold" ? String(leadMobile || "").trim() : null,
        occurrenceCodeId: null,
        observation: "",
        progressNote: "",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }

  await batch.commit();
  return { seriesId, createdIds };
}

async function pickAnchorOccurrenceFromSeriesMain({ mainOccurrences, todayIso }) {
  const sorted = (mainOccurrences || [])
    .slice()
    .sort((a, b) => {
      const ad = toIsoDate(safeToDate(a.date) || new Date(0));
      const bd = toIsoDate(safeToDate(b.date) || new Date(0));
      if (ad !== bd) return ad < bd ? -1 : 1;
      const at = String(a.startTime || "");
      const bt = String(b.startTime || "");
      return at < bt ? -1 : at > bt ? 1 : 0;
    });

  const candidate = sorted.find((o) => {
    const iso = toIsoDate(safeToDate(o.date) || new Date(0));
    return iso >= todayIso;
  });

  return candidate || sorted[0] || null;
}

async function convertHoldToAppointmentSeries({
  tenantRef,
  schedule,
  holdOccurrenceId,
  isoDate,
  startTime,
  blocks,
  slotIntervalMin,
  durationMin,
  bufferMin,
  patientId,
  plannedTotalSessions,
  frequency,
}) {
  const db = admin.firestore();
  const holdRef = holdOccurrenceId ? tenantRef.collection("appointmentOccurrences").doc(holdOccurrenceId) : null;
  const holdSnap = holdRef ? await holdRef.get() : null;

  let holdDoc = null;
  if (holdSnap && holdSnap.exists) {
    holdDoc = { id: holdSnap.id, ...(holdSnap.data() || {}) };
  } else {
    const existing = await findOccurrenceAtSlot(tenantRef, { isoDate, startTime });
    if (!existing) throw new Error("Reserva não encontrada neste horário.");
    holdDoc = { id: existing.id, ...(existing.data() || {}) };
  }

  if (holdDoc.isHold !== true) throw new Error("Este item não é uma reserva (hold).");

  const oldSeriesId = holdDoc.seriesId ? String(holdDoc.seriesId) : null;
  const oldGroupId = String(holdDoc.groupId || holdDoc.id);

  // Fetch existing series occurrences (if any)
  let seriesOccSnaps = null;
  if (oldSeriesId) {
    seriesOccSnaps = await tenantRef.collection("appointmentOccurrences").where("seriesId", "==", oldSeriesId).get();
  }

  const seriesOccs = seriesOccSnaps ? seriesOccSnaps.docs.map((d) => ({ id: d.id, ref: d.ref, ...(d.data() || {}) })) : [];
  const mainOccs = (oldSeriesId ? seriesOccs : [{ id: holdDoc.id, ref: holdRef, ...holdDoc }]).filter((o) => o && o.isBlock !== true);

  const todayIso = toIsoDate(new Date());
  const anchor = await pickAnchorOccurrenceFromSeriesMain({ mainOccurrences: mainOccs, todayIso });
  if (!anchor) throw new Error("Não foi possível determinar a primeira ocorrência da reserva.");

  const anchorIso = toIsoDate(safeToDate(anchor.date) || new Date(`${isoDate}T00:00:00.000Z`));
  const anchorStartTime = normalizeTimeHHMM(anchor.startTime) || normalizeTimeHHMM(startTime);
  if (!anchorStartTime) throw new Error("Horário inválido");

  const n = normalizePlannedTotalSessions(plannedTotalSessions);
  const freq = normalizeRecurrenceFrequency(frequency) || "weekly";
  const isoDates = buildRecurrenceIsoDates({ startIsoDate: anchorIso, frequency: freq, count: n });
  const desiredMainSlotKeys = isoDates.map((dIso) => makeSlotKey(dIso, anchorStartTime));
  const desiredSlotKeyToSessionIndex = new Map(desiredMainSlotKeys.map((k, idx) => [k, idx + 1]));

  // Validate duration match with hold
  const holdBlocks = Number(holdDoc.durationBlocks) > 0 ? Number(holdDoc.durationBlocks) : 1;
  if (holdBlocks !== blocks) {
    throw new Error("A reserva existe, mas a duração não coincide. Converta com a mesma duração (blocos).");
  }

  const estimatedWrites = estimateOccurrenceWrites({
    plannedTotalSessions: n,
    blocks,
    extraWrites: oldSeriesId ? 50 : 10, // headroom for deletes/updates
  });
  if (estimatedWrites > 450) throw new Error("Série muito grande para converter de uma vez. Reduza a quantidade de sessões.");

  await validateSeriesSlots({
    tenantRef,
    schedule,
    slotIntervalMin,
    blocks,
    isoDates,
    startTime: anchorStartTime,
    ignoreSeriesId: oldSeriesId,
    ignoreGroupIds: oldSeriesId ? [] : [oldGroupId],
  });

  // Build maps for existing holds in the series by main slotKey
  const existingMainBySlotKey = new Map();
  const groupDocsByGroupId = new Map();

  if (oldSeriesId) {
    for (const o of seriesOccs) {
      const gid = String(o.groupId || "");
      if (!gid) continue;
      if (!groupDocsByGroupId.has(gid)) groupDocsByGroupId.set(gid, []);
      groupDocsByGroupId.get(gid).push(o);

      if (o.isBlock !== true) {
        const key = String(o.slotKey || makeSlotKey(toIsoDate(safeToDate(o.date) || new Date(0)), o.startTime));
        existingMainBySlotKey.set(key, o);
      }
    }
  } else {
    // single hold group
    const q = await tenantRef.collection("appointmentOccurrences").where("groupId", "==", oldGroupId).limit(30).get();
    const groupDocs = q.empty ? [{ id: holdDoc.id, ref: holdRef, ...holdDoc }] : q.docs.map((d) => ({ id: d.id, ref: d.ref, ...(d.data() || {}) }));
    groupDocsByGroupId.set(oldGroupId, groupDocs);
    const key = String(holdDoc.slotKey || makeSlotKey(anchorIso, anchorStartTime));
    existingMainBySlotKey.set(key, { id: holdDoc.id, ref: holdRef, ...holdDoc });
  }

  // Prepare series doc (reuse old seriesId if exists; otherwise create new)
  if (!oldSeriesId) {
    await enforcePlanLimitMaxDocs({ tenantRef, tenantId: tenantRef.id, limitKey: "seriesMax", collectionName: "appointmentSeries", friendlyName: "séries" });
  }

  const seriesRef = oldSeriesId ? tenantRef.collection("appointmentSeries").doc(oldSeriesId) : tenantRef.collection("appointmentSeries").doc();
  const seriesId = seriesRef.id;

  const startDate = dateMidnightUtc(isoDates[0]);
  const endDate = dateMidnightUtc(isoDates[isoDates.length - 1]);

  const batch = db.batch();

  batch.set(
    seriesRef,
    {
      kind: "appointment",
      title: "Sessão",
      startDate,
      endDate,
      startTime: anchorStartTime,
      frequency: freq,
      plannedTotalSessions: n,
      durationBlocks: blocks,
      slotIntervalMin,
      durationMin,
      bufferMin: Number(bufferMin) > 0 ? Number(bufferMin) : 0,
      patientId,
      leadName: admin.firestore.FieldValue.delete(),
      leadMobile: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // Delete old hold groups not in desired schedule (only if oldSeriesId)
  if (oldSeriesId) {
    for (const [gid, docs] of groupDocsByGroupId.entries()) {
      const main = (docs || []).find((x) => x && x.isBlock !== true);
      if (!main) continue;
      const mainKey = String(main.slotKey || "");
      if (!desiredSlotKeyToSessionIndex.has(mainKey)) {
        // delete all docs of the group (still a hold series)
        for (const d of docs) {
          if (!d?.ref) continue;
          batch.delete(d.ref);
        }
      }
    }
  }

  // Update or create desired sessions
  let firstOccurrenceId = null;

  for (let i = 0; i < isoDates.length; i++) {
    const dIso = isoDates[i];
    const sessionIndex = i + 1;
    const mainKey = makeSlotKey(dIso, anchorStartTime);

    const existingMain = existingMainBySlotKey.get(mainKey);
    if (existingMain) {
      const gid = String(existingMain.groupId || existingMain.id);
      const docs = groupDocsByGroupId.get(gid) || [];
      for (const d of docs) {
        batch.set(
          d.ref,
          {
            seriesId,
            patientId,
            isHold: false,
            leadName: admin.firestore.FieldValue.delete(),
            leadMobile: admin.firestore.FieldValue.delete(),
            durationMin,
            durationBlocks: blocks,
            slotIntervalMin,
            sessionIndex,
            plannedTotalSessions: isoDates.length,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
      if (sessionIndex === 1) firstOccurrenceId = existingMain.id;
    } else {
      // create new occurrence group
      const d = dateMidnightUtc(dIso);

      const mainRef = tenantRef.collection("appointmentOccurrences").doc();
      const groupId = mainRef.id;
      if (sessionIndex === 1) firstOccurrenceId = mainRef.id;

      batch.set(mainRef, {
        seriesId,
        patientId,
        groupId,
        parentOccurrenceId: null,
        isBlock: false,
        blockIndex: 1,
        durationBlocks: blocks,
        slotIntervalMin,
        slotKey: makeSlotKey(dIso, anchorStartTime),
        date: d,
        startTime: anchorStartTime,
        durationMin,
        bufferMin: Number(bufferMin) > 0 ? Number(bufferMin) : 0,
        sessionIndex,
        plannedTotalSessions: isoDates.length,
        status: "Agendado",
        isHold: false,
        occurrenceCodeId: null,
        observation: "",
        progressNote: "",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      for (let b = 1; b < blocks; b++) {
        const slotTime = addMinutesToHHMM(anchorStartTime, b * slotIntervalMin);
        const blockRef = tenantRef.collection("appointmentOccurrences").doc();
        batch.set(blockRef, {
          seriesId,
          patientId,
          groupId,
          parentOccurrenceId: mainRef.id,
          isBlock: true,
          blockIndex: b + 1,
          durationBlocks: blocks,
          slotIntervalMin,
          slotKey: makeSlotKey(dIso, slotTime),
          date: d,
          startTime: slotTime,
          durationMin,
          bufferMin: Number(bufferMin) > 0 ? Number(bufferMin) : 0,
          sessionIndex,
          plannedTotalSessions: isoDates.length,
          status: "Agendado",
          isHold: false,
          occurrenceCodeId: null,
          observation: "",
          progressNote: "",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
  }

  await batch.commit();
  return { seriesId, firstOccurrenceId };
}


export async function createHoldOccurrence({
  tenantId,
  isoDate,
  startTime,
  leadName,
  leadMobile,
  durationBlocks,
  durationMin,
  replicateDays = 0,
  plannedTotalSessions,
  repeatFrequency,
}) {
  if (!tenantId) throw new Error("tenantId required");
  const iso = normalizeIsoDate(isoDate);
  const st = normalizeTimeHHMM(startTime);
  if (!iso) throw new Error("Data inválida");
  if (!st) throw new Error("Horário inválido");
  const name = String(leadName || "").trim();
  const mobile = normalizeMobile(leadMobile);
  if (!name) throw new Error("Nome obrigatório");
  if (!mobile) throw new Error("Celular obrigatório");

  const db = admin.firestore();
  const tenantRef = db.collection("tenants").doc(tenantId);

  const scheduleSnap = await tenantRef.collection("settings").doc("schedule").get();
  const scheduleRaw = scheduleSnap.exists ? scheduleSnap.data() : null;
  const schedule = normalizeScheduleForRead(scheduleRaw || {});

  const slotIntervalMin = getSlotIntervalMin(schedule);
  const blocks = normalizeBlocks(durationBlocks, slotIntervalMin, durationMin);
  const durMin = blocks * slotIntervalMin;

  
const freq = normalizeRecurrenceFrequency(repeatFrequency);
const count = normalizePlannedTotalSessions(plannedTotalSessions);

// Recorrência (série) — suporta diário/semanal/quinzenal/mensal e quantidade (01..30 + "mais")
// Se não for informado, mantém o comportamento antigo de replicar por dias (MVP legado).
if ((count && count > 1) || freq) {
  const n = normalizePlannedTotalSessions(plannedTotalSessions || 1);
  const f = freq || "weekly";
  return await createSeriesWithOccurrences({
    tenantRef,
    schedule,
    kind: "hold",
    startIsoDate: iso,
    startTime: st,
    frequency: f,
    plannedTotalSessions: n,
    blocks,
    slotIntervalMin,
    durationMin: durMin,
    bufferMin: Number(schedule?.bufferMin) > 0 ? Number(schedule.bufferMin) : 0,
    patientId: null,
    leadName: name,
    leadMobile: mobile,
  });
}

const rep = Math.max(0, Math.min(15, parseInt(replicateDays, 10) || 0));

  const createdIds = [];
  const skipped = [];

  for (let i = 0; i <= rep; i++) {
    const d = dateMidnightUtc(iso);
    d.setUTCDate(d.getUTCDate() + i);
    const dIso = d.toISOString().slice(0, 10);

    const weekdayKey = getWeekdayKeyFromIsoDate(dIso);
    const ranges = Array.isArray(schedule?.weekAvailability?.[weekdayKey]) ? schedule.weekAvailability[weekdayKey] : [];
    const openSlots = buildSlotsFromRanges(ranges, slotIntervalMin);
    const openSet = new Set(openSlots);

    const occs = await fetchOccurrencesForDay(tenantRef, dIso);
    const blocked = computeBlockedTimesForDay({
      occurrences: occs,
      slotIntervalMin,
      scheduleBufferMin: schedule.bufferMin,
    });

    // Validate contiguous availability + open hours + buffer
    let canCreate = true;
    for (let b = 0; b < blocks; b++) {
      const slotTime = addMinutesToHHMM(st, b * slotIntervalMin);
      if (!slotTime || !openSet.has(slotTime) || blocked.has(slotTime)) {
        canCreate = false;
        break;
      }
    }
    if (canCreate && schedule.bufferMin) {
      const bufferBlocks = Math.ceil(Number(schedule.bufferMin) / slotIntervalMin);
      for (let k = 0; k < bufferBlocks; k++) {
        const t2 = addMinutesToHHMM(st, (blocks + k) * slotIntervalMin);
        if (!t2) continue;
        if (blocked.has(t2)) {
          canCreate = false;
          break;
        }
      }
    }

    if (!canCreate) {
      if (i === 0) throw new Error("Horário indisponível (verifique o próximo bloco)");
      skipped.push(dIso);
      continue;
    }

    const mainRef = tenantRef.collection("appointmentOccurrences").doc();
    const groupId = mainRef.id;

    const batch = db.batch();

    batch.set(mainRef, {
      seriesId: null,
      patientId: null,
      groupId,
      parentOccurrenceId: null,
      isBlock: false,
      blockIndex: 1,
      durationBlocks: blocks,
      slotIntervalMin,
      slotKey: makeSlotKey(dIso, st),
      date: d,
      startTime: st,
      durationMin: durMin,
      bufferMin: Number(schedule?.bufferMin) > 0 ? Number(schedule.bufferMin) : 0,
      sessionIndex: null,
      plannedTotalSessions: null,
      status: "Agendado",
      isHold: true,
      leadName: name,
      leadMobile: mobile,
      occurrenceCodeId: null,
      observation: "",
      progressNote: "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Create block docs for the following slots
    for (let b = 1; b < blocks; b++) {
      const slotTime = addMinutesToHHMM(st, b * slotIntervalMin);
      const blockRef = tenantRef.collection("appointmentOccurrences").doc();
      batch.set(blockRef, {
        seriesId: null,
        patientId: null,
        groupId,
        parentOccurrenceId: mainRef.id,
        isBlock: true,
        blockIndex: b + 1,
        durationBlocks: blocks,
        slotIntervalMin,
        slotKey: makeSlotKey(dIso, slotTime),
        date: d,
        startTime: slotTime,
        durationMin: durMin,
        bufferMin: Number(schedule?.bufferMin) > 0 ? Number(schedule.bufferMin) : 0,
        sessionIndex: null,
        plannedTotalSessions: null,
        status: "Agendado",
        isHold: true,
        leadName: name,
        leadMobile: mobile,
        occurrenceCodeId: null,
        observation: "",
        progressNote: "",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
    createdIds.push(mainRef.id);
  }

  return { createdIds, skipped };
}


export async function createAppointmentAtSlot({
  tenantId,
  isoDate,
  startTime,
  fullName,
  cpf,
  mobile,
  durationBlocks,
  durationMin,
  plannedTotalSessions,
  repeatFrequency,
  fromHoldOccurrenceId,
}) {
  if (!tenantId) throw new Error("tenantId required");
  const iso = normalizeIsoDate(isoDate);
  const st = normalizeTimeHHMM(startTime);
  if (!iso) throw new Error("Data inválida");
  if (!st) throw new Error("Horário inválido");

  const name = String(fullName || "").trim();
  const cpfDigits = normalizeCpf(cpf);
  const mobRaw = normalizeMobile(mobile);
  const phoneCanonical = toPhoneCanonical(mobRaw);
  const phoneE164 = toPhoneE164(mobile || mobRaw);
  if (!name) throw new Error("Nome obrigatório");
  if (!phoneCanonical) throw new Error("Celular obrigatório");

  // CPF é opcional no MVP (pré-cadastro rápido). Se informado, validamos.
  if (cpfDigits && !isValidCpfDigits(cpfDigits)) throw new Error("CPF inválido");

  const mob = phoneCanonical; // compat (campo legado `mobile` e WhatsApp)

  const totalSessions = normalizePlannedTotalSessions(plannedTotalSessions);
  const freq = normalizeRecurrenceFrequency(repeatFrequency) || "weekly";
  const wantsSeries = totalSessions > 1;

  const db = admin.firestore();
  const tenantRef = db.collection("tenants").doc(tenantId);

  // schedule slot interval
  const scheduleSnap = await tenantRef.collection("settings").doc("schedule").get();
  const scheduleRaw = scheduleSnap.exists ? scheduleSnap.data() : null;
  const schedule = normalizeScheduleForRead(scheduleRaw || {});
  const slotIntervalMin = getSlotIntervalMin(schedule);
  const blocks = normalizeBlocks(durationBlocks, slotIntervalMin, durationMin);
  const durMin = blocks * slotIntervalMin;
  const bufferMin = Number(schedule?.bufferMin) > 0 ? Number(schedule.bufferMin) : 0;

  // Check if slot already has something
  const existing = await findOccurrenceAtSlot(tenantRef, { isoDate: iso, startTime: st });
  if (existing) {
    const d = existing.data() || {};
    // If it's a hold, we can convert
    if (d.isHold === true) {
      const holdBlocks = Number(d.durationBlocks) > 0 ? Number(d.durationBlocks) : 1;
      if (holdBlocks !== blocks) {
        throw new Error("A reserva existe, mas a duração não coincide (use a mesma duração em blocos).");
      }

      const pid = cpfDigits
        ? await ensurePatientByCpf({ tenantRef, cpfDigits, name, phoneCanonical: mob, phoneE164 })
        : await ensurePatientByPhone({ tenantRef, phoneCanonical: mob, name, phoneE164 });

      // Se pediu série (ex.: hold 2/2 -> agendamento 30 sessões), converte toda a série do hold e estende.
      if (wantsSeries) {
        const conv = await convertHoldToAppointmentSeries({
          tenantRef,
          schedule,
          holdOccurrenceId: fromHoldOccurrenceId || existing.id,
          isoDate: iso,
          startTime: st,
          blocks,
          slotIntervalMin,
          durationMin: durMin,
          bufferMin,
          patientId: pid,
          plannedTotalSessions: totalSessions,
          frequency: freq,
        });

        return { updated: true, occurrenceId: conv.firstOccurrenceId, patientId: pid, seriesId: conv.seriesId };
      }

      // Conversão simples (uma ocorrência) — mantém comportamento atual
      const groupId = String(d.groupId || existing.id);
      const snap = await tenantRef.collection("appointmentOccurrences").where("groupId", "==", groupId).limit(20).get();
      const docsToUpdate = snap.empty ? [existing] : snap.docs.map((d) => d);

      const batch = db.batch();
      for (const doc of docsToUpdate) {
        batch.set(
          doc.ref,
          {
            patientId: pid,
            isHold: false,
            leadName: admin.firestore.FieldValue.delete(),
            leadMobile: admin.firestore.FieldValue.delete(),
            durationMin: durMin,
            durationBlocks: blocks,
            slotIntervalMin,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
      await batch.commit();
      return { updated: true, occurrenceId: existing.id, patientId: pid };
    }

    throw Object.assign(new Error("slot already occupied"), { code: "SLOT_OCCUPIED" });
  }

  // Se for série (recorrência), cria a série inteira a partir do primeiro horário
  if (wantsSeries) {
    const patientId = cpfDigits
    ? await ensurePatientByCpf({ tenantRef, cpfDigits, name, phoneCanonical: mob, phoneE164 })
    : await ensurePatientByPhone({ tenantRef, phoneCanonical: mob, name, phoneE164 });
    const created = await createSeriesWithOccurrences({
      tenantRef,
      schedule,
      kind: "appointment",
      startIsoDate: iso,
      startTime: st,
      frequency: freq,
      plannedTotalSessions: totalSessions,
      blocks,
      slotIntervalMin,
      durationMin: durMin,
      bufferMin,
      patientId,
      leadName: null,
      leadMobile: null,
    });
    return { created: true, seriesId: created.seriesId, occurrenceId: created.createdIds?.[0] || null, patientId };
  }

  // Validate contiguous availability (caso simples)
  const weekdayKey = getWeekdayKeyFromIsoDate(iso);
  const ranges = Array.isArray(schedule?.weekAvailability?.[weekdayKey]) ? schedule.weekAvailability[weekdayKey] : [];
  const openSlots = buildSlotsFromRanges(ranges, slotIntervalMin);
  const openSet = new Set(openSlots);
  if (!openSlots.length) throw new Error("Dia sem horários abertos (verifique a configuração da agenda).");

  const occs = await fetchOccurrencesForDay(tenantRef, iso);
  const blocked = computeBlockedTimesForDay({
    occurrences: occs,
    slotIntervalMin,
    scheduleBufferMin: schedule.bufferMin,
  });

  for (let b = 0; b < blocks; b++) {
    const slotTime = addMinutesToHHMM(st, b * slotIntervalMin);
    if (!slotTime) throw new Error("Horário inválido");
    if (!openSet.has(slotTime)) throw new Error("Horário fora do período de atendimento.");
    if (blocked.has(slotTime)) throw new Error("Horário indisponível (ocupado ou em intervalo/buffer).");
  }

  if (schedule.bufferMin) {
    const bufferBlocks = Math.ceil(Number(schedule.bufferMin) / slotIntervalMin);
    for (let k = 0; k < bufferBlocks; k++) {
      const t2 = addMinutesToHHMM(st, (blocks + k) * slotIntervalMin);
      if (!t2) continue;
      if (blocked.has(t2)) throw new Error("Horário indisponível (conflito com o intervalo/buffer).");
    }
  }

  const patientId = cpfDigits
    ? await ensurePatientByCpf({ tenantRef, cpfDigits, name, phoneCanonical: mob, phoneE164 })
    : await ensurePatientByPhone({ tenantRef, phoneCanonical: mob, name, phoneE164 });

  const mainRef = tenantRef.collection("appointmentOccurrences").doc();
  const groupId = mainRef.id;

  const d = dateMidnightUtc(iso);
  const batch = db.batch();

  batch.set(mainRef, {
    seriesId: null,
    patientId,
    groupId,
    parentOccurrenceId: null,
    isBlock: false,
    blockIndex: 1,
    durationBlocks: blocks,
    slotIntervalMin,
    slotKey: makeSlotKey(iso, st),
    date: d,
    startTime: st,
    durationMin: durMin,
    bufferMin,
    sessionIndex: null,
    plannedTotalSessions: null,
    status: "Agendado",
    isHold: false,
    occurrenceCodeId: null,
    observation: "",
    progressNote: "",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  for (let b = 1; b < blocks; b++) {
    const slotTime = addMinutesToHHMM(st, b * slotIntervalMin);
    const blockRef = tenantRef.collection("appointmentOccurrences").doc();
    batch.set(blockRef, {
      seriesId: null,
      patientId,
      groupId,
      parentOccurrenceId: mainRef.id,
      isBlock: true,
      blockIndex: b + 1,
      durationBlocks: blocks,
      slotIntervalMin,
      slotKey: makeSlotKey(iso, slotTime),
      date: d,
      startTime: slotTime,
      durationMin: durMin,
      bufferMin,
      sessionIndex: null,
      plannedTotalSessions: null,
      status: "Agendado",
      isHold: false,
      occurrenceCodeId: null,
      observation: "",
      progressNote: "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  return { created: true, occurrenceId: mainRef.id, patientId };
}

async function ensurePatientByPhone({ tenantRef, phoneCanonical, name, phoneE164 }) {
  const canon = toPhoneCanonical(phoneCanonical);
  if (!canon) throw new Error("Celular obrigatório");

  const indexRef = tenantRef.collection("patientPhoneIndex").doc(canon);
  const indexSnap = await indexRef.get();
  if (indexSnap.exists && indexSnap.data()?.patientId) {
    return String(indexSnap.data().patientId);
  }

  // Fallback (legado): procurar por `mobile` (seed antigo) antes de criar duplicado
  try {
    const q = await tenantRef.collection("patients").where("mobile", "==", canon).limit(1).get();
    if (!q.empty) {
      const pid = q.docs[0].id;

      // Best-effort: cria índice para acelerar próximos acessos
      try {
        const now = admin.firestore.FieldValue.serverTimestamp();
        await indexRef.set({ phoneCanonical: canon, patientId: pid, createdAt: now, updatedAt: now }, { merge: true });
        await tenantRef
          .collection("patients")
          .doc(pid)
          .set(
            {
              phoneCanonical: canon,
              phoneE164: toPhoneE164(phoneE164 || canon) || null,
              mobile: canon,
              updatedAt: now,
            },
            { merge: true }
          );
      } catch {
        // ignore
      }

      return pid;
    }
  } catch {
    // ignore
  }

  // create patient
  await enforcePlanLimitMaxDocs({
    tenantRef,
    tenantId: tenantRef.id,
    limitKey: "patientsMax",
    collectionName: "patients",
    friendlyName: "pacientes",
  });

  const patientRef = tenantRef.collection("patients").doc();
  const now = admin.firestore.FieldValue.serverTimestamp();

  const e164 = toPhoneE164(phoneE164 || canon) || null;

  await patientRef.set(
    {
      fullName: String(name || "").trim(),
      mobile: canon,
      phoneCanonical: canon,
      phoneE164: e164,
      createdAt: now,
      updatedAt: now,
      profileStatus: "incomplete",
      profileCompleted: false,
      generalNotes: "",
      notes: "",
    },
    { merge: true }
  );

  await indexRef.set(
    {
      phoneCanonical: canon,
      patientId: patientRef.id,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  return patientRef.id;
}

async function ensurePatientByCpf({ tenantRef, cpfDigits, name, phoneCanonical, phoneE164 }) {
  const cpf = normalizeCpf(cpfDigits);
  if (!cpf) throw new Error("CPF inválido");
  if (!isValidCpfDigits(cpf)) throw new Error("CPF inválido");

  const indexRef = tenantRef.collection("patientCpfIndex").doc(cpf);
  const indexSnap = await indexRef.get();
  if (indexSnap.exists && indexSnap.data()?.patientId) {
    const pid = String(indexSnap.data().patientId);

    // Best-effort: atualizar telefone/índices para evitar duplicidade futura
    const canon = toPhoneCanonical(phoneCanonical);
    if (canon) {
      const now = admin.firestore.FieldValue.serverTimestamp();
      try {
        await tenantRef
          .collection("patients")
          .doc(pid)
          .set(
            {
              mobile: canon,
              phoneCanonical: canon,
              phoneE164: toPhoneE164(phoneE164 || canon) || null,
              updatedAt: now,
            },
            { merge: true }
          );

        await tenantRef
          .collection("patientPhoneIndex")
          .doc(canon)
          .set({ phoneCanonical: canon, patientId: pid, createdAt: now, updatedAt: now }, { merge: true });
      } catch {
        // ignore
      }
    }

    return pid;
  }

  // create patient
  await enforcePlanLimitMaxDocs({
    tenantRef,
    tenantId: tenantRef.id,
    limitKey: "patientsMax",
    collectionName: "patients",
    friendlyName: "pacientes",
  });

  const patientRef = tenantRef.collection("patients").doc();
  const now = admin.firestore.FieldValue.serverTimestamp();
  const canon = toPhoneCanonical(phoneCanonical);
  const e164 = toPhoneE164(phoneE164 || canon || "") || null;

  await patientRef.set(
    {
      fullName: String(name || "").trim(),
      cpf,
      mobile: canon || null,
      phoneCanonical: canon || null,
      phoneE164: e164,
      createdAt: now,
      updatedAt: now,
      profileStatus: "incomplete",
      profileCompleted: false,
      generalNotes: "",
      notes: "",
    },
    { merge: true }
  );

  await indexRef.set(
    {
      cpf,
      patientId: patientRef.id,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  if (canon) {
    try {
      await tenantRef
        .collection("patientPhoneIndex")
        .doc(canon)
        .set({ phoneCanonical: canon, patientId: patientRef.id, createdAt: now, updatedAt: now }, { merge: true });
    } catch {
      // ignore
    }
  }

  return patientRef.id;
}


export async function getPatientProfile({ tenantId, patientId }) {
  if (!tenantId) throw new Error("tenantId required");
  if (!patientId) throw new Error("patientId required");

  const db = admin.firestore();
  const tenantRef = db.collection("tenants").doc(tenantId);
  const ref = tenantRef.collection("patients").doc(patientId);
  const snap = await ref.get();
  if (!snap.exists) {
    const err = new Error("Paciente não encontrado.");
    err.code = "NOT_FOUND";
    throw err;
  }

  return { id: snap.id, ...plain(snap.data() || {}) };
}

export async function updatePatientProfile({ tenantId, patientId, patch = {}, updatedByUid }) {
  if (!tenantId) throw new Error("tenantId required");
  if (!patientId) throw new Error("patientId required");

  const db = admin.firestore();
  const tenantRef = db.collection("tenants").doc(tenantId);
  const ref = tenantRef.collection("patients").doc(patientId);

  const snap = await ref.get();
  if (!snap.exists) {
    const err = new Error("Paciente não encontrado.");
    err.code = "NOT_FOUND";
    throw err;
  }

  const prev = snap.data() || {};

  const fullName = String(patch?.fullName ?? prev?.fullName ?? "").trim();
  if (!fullName) throw new Error("Nome obrigatório");

  const cpfDigits = normalizeCpf(patch?.cpf ?? prev?.cpf ?? "");
  const cpf = cpfDigits ? String(cpfDigits) : "";
  if (cpf && !isValidCpfDigits(cpf)) throw new Error("CPF inválido");

  const phoneRaw = String(patch?.phoneE164 || patch?.mobile || patch?.phone || patch?.phoneCanonical || prev?.phoneE164 || prev?.mobile || prev?.phoneCanonical || "").trim();
  const phoneCanonical = toPhoneCanonical(phoneRaw);
  const phoneE164 = toPhoneE164(patch?.phoneE164 || phoneRaw || "") || null;

  const generalNotes = String(patch?.generalNotes ?? prev?.generalNotes ?? "").trim();
  const preferredName = String(patch?.preferredName ?? prev?.preferredName ?? "").trim();
  const email = String(patch?.email ?? prev?.email ?? "").trim().toLowerCase();
  const gender = String(patch?.gender ?? prev?.gender ?? "").trim();
  const birthDate = String(patch?.birthDate ?? prev?.birthDate ?? "").trim();

  // birthDate validation (best-effort)
  if (birthDate) {
    const d = new Date(`${birthDate}T00:00:00.000Z`);
    if (!Number.isFinite(d.getTime())) throw new Error("birthDate inválida");
    const now = new Date();
    if (d.getTime() > now.getTime()) throw new Error("birthDate não pode ser futura");
  }

  const address = typeof patch?.address === "object" && patch.address ? patch.address : prev?.address || null;
  const legalGuardian = typeof patch?.legalGuardian === "object" && patch.legalGuardian ? patch.legalGuardian : prev?.legalGuardian || null;

  const now = admin.firestore.FieldValue.serverTimestamp();

  const data = {
    fullName,
    preferredName: preferredName || null,
    cpf: cpf || null,
    birthDate: birthDate || null,
    gender: gender || null,
    phoneCanonical: phoneCanonical || null,
    phoneE164: phoneE164 || null,
    mobile: phoneCanonical || null, // compat
    email: email || null,
    address: address || null,
    legalGuardian: legalGuardian || null,
    generalNotes,
    // compat: overlay antigo lê `notes`
    notes: generalNotes || String(prev?.notes || ""),
    profileStatus: "complete",
    profileCompleted: true,
    updatedAt: now,
    updatedByUid: updatedByUid || null,
  };

  await ref.set(data, { merge: true });

  // índices (best-effort)
  try {
    if (phoneCanonical) {
      await tenantRef.collection("patientPhoneIndex").doc(phoneCanonical).set(
        {
          phoneCanonical,
          patientId,
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
    }
  } catch {
    // ignore
  }

  try {
    if (cpf) {
      await tenantRef.collection("patientCpfIndex").doc(cpf).set(
        {
          cpf,
          patientId,
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
    }
  } catch {
    // ignore
  }

  const after = await ref.get();
  return { id: after.id, ...plain(after.data() || {}) };
}

export async function updateOccurrenceStatus({ tenantId, occurrenceId, status }) {
  if (!tenantId) throw new Error("tenantId required");
  if (!occurrenceId) throw new Error("occurrenceId required");
  const s = String(status || "").trim();
  if (!ALLOWED_STATUS.includes(s)) throw new Error("invalid status");

  const db = admin.firestore();
  const tenantRef = db.collection("tenants").doc(tenantId);
  const ref = tenantRef.collection("appointmentOccurrences").doc(occurrenceId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("not found");

  const d = snap.data() || {};
  if (d.isHold === true) throw new Error("reserva: status travado até converter em agendamento");
  const groupId = String(d.groupId || occurrenceId);

  const q = await tenantRef.collection("appointmentOccurrences").where("groupId", "==", groupId).limit(30).get();
  const targets = q.empty ? [ref] : q.docs.map((d) => d.ref);
  const batch = db.batch();
  for (const r of targets) {
    batch.set(
      r,
      {
        status: s,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
  await batch.commit();
  return { ok: true, groupUpdated: targets.length };
}

export async function rescheduleOccurrence({
  tenantId,
  occurrenceId,
  newIsoDate,
  newStartTime,
  scope = "single", // 'single' | 'future'
}) {
  if (!tenantId) throw new Error("tenantId required");
  if (!occurrenceId) throw new Error("occurrenceId required");

  const iso = normalizeIsoDate(newIsoDate);
  const st = normalizeTimeHHMM(newStartTime);
  if (!iso) throw new Error("Data inválida");
  if (!st) throw new Error("Horário inválido");

  const db = admin.firestore();
  const tenantRef = db.collection("tenants").doc(tenantId);

  const scheduleSnap = await tenantRef.collection("settings").doc("schedule").get();
  const scheduleRaw = scheduleSnap.exists ? scheduleSnap.data() : null;
  const schedule = normalizeScheduleForRead(scheduleRaw || {});
  const slotIntervalMin = getSlotIntervalMin(schedule);

  // Resolve main occurrence (avoid passing a block doc id)
  let mainId = String(occurrenceId);
  let mainSnap = await tenantRef.collection("appointmentOccurrences").doc(mainId).get();
  if (!mainSnap.exists) throw new Error("not found");
  let main = { id: mainSnap.id, ...(mainSnap.data() || {}) };
  if (main.isBlock === true && main.parentOccurrenceId) {
    mainId = String(main.parentOccurrenceId);
    mainSnap = await tenantRef.collection("appointmentOccurrences").doc(mainId).get();
    if (!mainSnap.exists) throw new Error("not found");
    main = { id: mainSnap.id, ...(mainSnap.data() || {}) };
  }
  if (main.isBlock === true) throw new Error("occurrenceId must be a main occurrence");

  const groupId = String(main.groupId || main.id);
  const blocks = normalizeBlocks(main.durationBlocks, slotIntervalMin, main.durationMin);

  const wantsFuture = String(scope || "").toLowerCase() === "future";
  const isRecurring =
    Boolean(main.seriesId) &&
    Number.isFinite(Number(main.sessionIndex)) &&
    Number.isFinite(Number(main.plannedTotalSessions)) &&
    Number(main.plannedTotalSessions) > 1;

  // SINGLE: move only this occurrence group
  if (!wantsFuture || !isRecurring) {
    await validateSeriesSlots({
      tenantRef,
      schedule,
      slotIntervalMin,
      blocks,
      isoDates: [iso],
      startTime: st,
      ignoreGroupIds: [groupId],
    });

    const q = await tenantRef.collection("appointmentOccurrences").where("groupId", "==", groupId).limit(30).get();
    const docs = q.empty
      ? [{ ref: tenantRef.collection("appointmentOccurrences").doc(main.id), ...(main || {}) }]
      : q.docs.map((d) => ({ ref: d.ref, ...(d.data() || {}) }));

    const d = dateMidnightUtc(iso);
    const batch = db.batch();
    for (const doc of docs) {
      const blockIndex = Number(doc.blockIndex) > 0 ? Number(doc.blockIndex) : 1;
      const t = addMinutesToHHMM(st, (blockIndex - 1) * slotIntervalMin);
      if (!t) throw new Error("Horário inválido");
      batch.set(
        doc.ref,
        {
          date: d,
          startTime: t,
          slotKey: makeSlotKey(iso, t),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
    await batch.commit();

    return {
      ok: true,
      occurrenceId: main.id,
      movedToIsoDate: iso,
      movedToStartTime: st,
      scopeApplied: "single",
    };
  }

  // FUTURE: move this and future occurrences by splitting the series
  const oldSeriesId = String(main.seriesId);
  const seriesRef = tenantRef.collection("appointmentSeries").doc(oldSeriesId);
  const seriesSnap = await seriesRef.get();
  if (!seriesSnap.exists) {
    // Fallback to single-move if series doc was deleted
    return await rescheduleOccurrence({ tenantId, occurrenceId: main.id, newIsoDate: iso, newStartTime: st, scope: "single" });
  }
  const series = seriesSnap.data() || {};

  const currentIso = toIsoDate(safeToDate(main.date) || dateMidnightUtc(toIsoDate(new Date())));
  if (iso < currentIso) {
    throw new Error('Para aplicar "esta e futuras", escolha uma data igual ou posterior à data atual desta ocorrência.');
  }

  const total = normalizePlannedTotalSessions(main.plannedTotalSessions || series.plannedTotalSessions || 1);
  const currentIndex = Math.max(1, parseInt(String(main.sessionIndex || 1), 10) || 1);
  const remaining = total - currentIndex + 1;
  if (remaining <= 0) throw new Error("Nada para reagendar.");

  const freq = normalizeRecurrenceFrequency(series.frequency) || "weekly";

  // If applying from session 1, just move the entire series without splitting.
  if (currentIndex <= 1) {
    const isoDatesAll = buildRecurrenceIsoDates({ startIsoDate: iso, frequency: freq, count: total });
    const writes = estimateOccurrenceWrites({ plannedTotalSessions: total, blocks, extraWrites: 10 });
    if (writes > 450) throw new Error("Série muito grande para reagendar de uma vez. Reduza a quantidade de sessões.");

    await validateSeriesSlots({ tenantRef, schedule, slotIntervalMin, blocks, isoDates: isoDatesAll, startTime: st, ignoreSeriesId: oldSeriesId });

    const occSnap = await tenantRef
      .collection("appointmentOccurrences")
      .where("seriesId", "==", oldSeriesId)
      .limit(2000)
      .get();
    const occDocs = occSnap.docs.map((d) => ({ id: d.id, ref: d.ref, ...(d.data() || {}) }));

    const batch = db.batch();
    batch.set(
      seriesRef,
      {
        startDate: dateMidnightUtc(isoDatesAll[0]),
        endDate: dateMidnightUtc(isoDatesAll[isoDatesAll.length - 1]),
        startTime: st,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    for (const o of occDocs) {
      const si = Number(o.sessionIndex);
      if (!Number.isFinite(si) || si < 1) continue;
      const idx = si - 1;
      const targetIso = isoDatesAll[idx];
      if (!targetIso) continue;
      const blockIndex = Number(o.blockIndex) > 0 ? Number(o.blockIndex) : 1;
      const t = addMinutesToHHMM(st, (blockIndex - 1) * slotIntervalMin);
      if (!t) throw new Error("Horário inválido");

      batch.set(
        o.ref,
        {
          date: dateMidnightUtc(targetIso),
          startTime: t,
          slotKey: makeSlotKey(targetIso, t),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    await batch.commit();
    return {
      ok: true,
      occurrenceId: main.id,
      movedToIsoDate: iso,
      movedToStartTime: st,
      scopeApplied: "future",
      mode: "series_move",
      seriesId: oldSeriesId,
    };
  }

  const isoDates = buildRecurrenceIsoDates({ startIsoDate: iso, frequency: freq, count: remaining });

  const writes = estimateOccurrenceWrites({ plannedTotalSessions: remaining, blocks, extraWrites: 10 });
  if (writes > 450) throw new Error("Série muito grande para reagendar de uma vez. Reduza a quantidade de sessões.");

  await validateSeriesSlots({
    tenantRef,
    schedule,
    slotIntervalMin,
    blocks,
    isoDates,
    startTime: st,
    ignoreSeriesId: oldSeriesId,
  });

  const occSnap = await tenantRef
    .collection("appointmentOccurrences")
    .where("seriesId", "==", oldSeriesId)
    .limit(2000)
    .get();
  const occDocs = occSnap.docs.map((d) => ({ id: d.id, ref: d.ref, ...(d.data() || {}) }));

  const futureDocs = occDocs.filter((o) => {
    const si = Number(o.sessionIndex);
    return Number.isFinite(si) && si >= currentIndex;
  });
  if (!futureDocs.length) throw new Error("Não encontrei ocorrências futuras desta série.");

  const pastMain = occDocs
    .filter((o) => o && o.isBlock !== true)
    .filter((o) => {
      const si = Number(o.sessionIndex);
      return Number.isFinite(si) && si < currentIndex;
    })
    .sort((a, b) => Number(a.sessionIndex) - Number(b.sessionIndex));

  const lastPast = pastMain.length ? pastMain[pastMain.length - 1] : null;
  const lastPastIso = lastPast?.date ? toIsoDate(safeToDate(lastPast.date) || dateMidnightUtc(currentIso)) : null;

  await enforcePlanLimitMaxDocs({ tenantRef, tenantId: tenantRef.id, limitKey: "seriesMax", collectionName: "appointmentSeries", friendlyName: "séries" });

  const newSeriesRef = tenantRef.collection("appointmentSeries").doc();
  const newSeriesId = newSeriesRef.id;

  const kind = String(series.kind || (main.isHold === true ? "hold" : "appointment"));
  const title = String(series.title || (kind === "appointment" ? "Sessão" : "Reserva (hold)"));

  const startDate = dateMidnightUtc(isoDates[0]);
  const endDate = dateMidnightUtc(isoDates[isoDates.length - 1]);

  const batch = db.batch();
  batch.set(
    newSeriesRef,
    {
      kind,
      title,
      startDate,
      endDate,
      startTime: st,
      frequency: freq,
      plannedTotalSessions: total,
      durationBlocks: blocks,
      slotIntervalMin,
      durationMin: Number(series.durationMin) > 0 ? Number(series.durationMin) : blocks * slotIntervalMin,
      bufferMin:
        Number(series.bufferMin) > 0
          ? Number(series.bufferMin)
          : Number(schedule.bufferMin) > 0
          ? Number(schedule.bufferMin)
          : 0,
      patientId: series.patientId || main.patientId || null,
      leadName: kind === "hold" ? series.leadName || main.leadName || null : null,
      leadMobile: kind === "hold" ? series.leadMobile || main.leadMobile || null : null,
      sessionIndexStart: currentIndex,
      sessionCount: remaining,
      splitFromSeriesId: oldSeriesId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  batch.set(
    seriesRef,
    {
      // Keep the past occurrences in the old series. Best-effort update of endDate for reporting.
      endDate: lastPastIso ? dateMidnightUtc(lastPastIso) : series.endDate || series.startDate || null,
      splitAtSessionIndex: currentIndex,
      splitNewSeriesId: newSeriesId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  for (const o of futureDocs) {
    const si = Number(o.sessionIndex);
    const idx = si - currentIndex;
    const targetIso = isoDates[idx];
    if (!targetIso) continue;

    const blockIndex = Number(o.blockIndex) > 0 ? Number(o.blockIndex) : 1;
    const t = addMinutesToHHMM(st, (blockIndex - 1) * slotIntervalMin);
    if (!t) throw new Error("Horário inválido");

    batch.set(
      o.ref,
      {
        seriesId: newSeriesId,
        date: dateMidnightUtc(targetIso),
        startTime: t,
        slotKey: makeSlotKey(targetIso, t),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  await batch.commit();

  return {
    ok: true,
    occurrenceId: main.id,
    movedToIsoDate: iso,
    movedToStartTime: st,
    scopeApplied: "future",
    oldSeriesId,
    newSeriesId,
    mode: "series_split",
  };
}



export async function deleteOccurrence({
  tenantId,
  occurrenceId,
  scope = "single", // 'single' | 'future'
}) {
  if (!tenantId) throw new Error("tenantId required");
  if (!occurrenceId) throw new Error("occurrenceId required");

  const db = admin.firestore();
  const tenantRef = db.collection("tenants").doc(tenantId);

  // Resolve main occurrence (avoid passing a block doc id)
  let mainId = String(occurrenceId);
  let mainSnap = await tenantRef.collection("appointmentOccurrences").doc(mainId).get();
  if (!mainSnap.exists) throw new Error("not found");
  let main = { id: mainSnap.id, ...(mainSnap.data() || {}) };
  if (main.isBlock === true && main.parentOccurrenceId) {
    mainId = String(main.parentOccurrenceId);
    mainSnap = await tenantRef.collection("appointmentOccurrences").doc(mainId).get();
    if (!mainSnap.exists) throw new Error("not found");
    main = { id: mainSnap.id, ...(mainSnap.data() || {}) };
  }
  if (main.isBlock === true) throw new Error("occurrenceId must be a main occurrence");

  const groupId = String(main.groupId || main.id);

  const wantsFuture = String(scope || "").toLowerCase() === "future";
  const isRecurring =
    Boolean(main.seriesId) &&
    Number.isFinite(Number(main.sessionIndex)) &&
    Number.isFinite(Number(main.plannedTotalSessions)) &&
    Number(main.plannedTotalSessions) > 1;

  // SINGLE: delete only this occurrence group (main + blocks)
  if (!wantsFuture || !isRecurring) {
    const q = await tenantRef.collection("appointmentOccurrences").where("groupId", "==", groupId).limit(80).get();
    const refs = q.empty ? [tenantRef.collection("appointmentOccurrences").doc(main.id)] : q.docs.map((d) => d.ref);

    const batch = db.batch();
    for (const ref of refs) batch.delete(ref);
    await batch.commit();

    return { ok: true, scopeApplied: "single", deletedCount: refs.length };
  }

  // FUTURE: delete this and future occurrences by truncating the series
  const oldSeriesId = String(main.seriesId);
  const seriesRef = tenantRef.collection("appointmentSeries").doc(oldSeriesId);
  const seriesSnap = await seriesRef.get();
  if (!seriesSnap.exists) {
    // Fallback to single-delete if series doc was deleted
    return await deleteOccurrence({ tenantId, occurrenceId: main.id, scope: "single" });
  }
  const series = seriesSnap.data() || {};

  const total = normalizePlannedTotalSessions(main.plannedTotalSessions || series.plannedTotalSessions || 1);
  const currentIndex = Math.max(1, parseInt(String(main.sessionIndex || 1), 10) || 1);
  const newTotal = Math.max(0, currentIndex - 1);

  const occSnap = await tenantRef
    .collection("appointmentOccurrences")
    .where("seriesId", "==", oldSeriesId)
    .limit(2000)
    .get();
  const occDocs = occSnap.docs.map((d) => ({ id: d.id, ref: d.ref, ...(d.data() || {}) }));

  const toDelete = occDocs.filter((o) => {
    const si = Number(o.sessionIndex);
    return Number.isFinite(si) && si >= currentIndex;
  });
  if (!toDelete.length) throw new Error("Não encontrei ocorrências desta série para excluir.");

  const toKeep = occDocs.filter((o) => {
    const si = Number(o.sessionIndex);
    return Number.isFinite(si) && si < currentIndex;
  });

  const pastMain = toKeep
    .filter((o) => o && o.isBlock !== true)
    .sort((a, b) => Number(a.sessionIndex) - Number(b.sessionIndex));
  const lastPast = pastMain.length ? pastMain[pastMain.length - 1] : null;
  const lastPastIso = lastPast?.date ? toIsoDate(safeToDate(lastPast.date) || new Date()) : null;

  const batch = db.batch();

  // Delete all docs for this and future sessions (includes blocks)
  for (const o of toDelete) batch.delete(o.ref);

  if (newTotal <= 0) {
    // If deleting from session 1, remove the series doc too
    batch.delete(seriesRef);
  } else {
    // Truncate series metadata and keep past occurrences consistent
    batch.set(
      seriesRef,
      {
        plannedTotalSessions: newTotal,
        endDate: lastPastIso ? dateMidnightUtc(lastPastIso) : series.endDate || series.startDate || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    for (const o of toKeep) {
      batch.set(
        o.ref,
        {
          plannedTotalSessions: newTotal,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  }

  await batch.commit();

  return {
    ok: true,
    scopeApplied: "future",
    oldSeriesId,
    deletedCount: toDelete.length,
    previousPlannedTotalSessions: total,
    newPlannedTotalSessions: newTotal,
  };
}

// =========================
// Occurrence Codes (AgendaPsi)
// =========================

export async function listOccurrenceCodes({ tenantId, activeOnly = true } = {}) {
  const tid = String(tenantId || "").trim();
  if (!tid) throw new Error("tenantId obrigatório");

  const db = admin.firestore();
  const ref = db.collection(`tenants/${tid}/occurrenceCodes`);

  const snap = await ref.orderBy("code", "asc").get();
  const items = snap.docs.map((d) => ({ id: d.id, ...plain(d.data() || {}) }));

  if (!activeOnly) return items;

  return items.filter((c) => c?.isActive !== false);
}

export async function upsertOccurrenceCode({
  tenantId,
  codeId = "",
  code,
  description = "",
  isActive = true,
} = {}) {
  const tid = String(tenantId || "").trim();
  if (!tid) throw new Error("tenantId obrigatório");

  const c = String(code || "").trim();
  if (!c) throw new Error("code obrigatório");

  const desc = String(description || "").trim();

  const db = admin.firestore();
  const col = db.collection(`tenants/${tid}/occurrenceCodes`);
  const normalizedCode = c.toUpperCase();

  // Best-effort uniqueness check
  const dupSnap = await col.where("code", "==", normalizedCode).limit(5).get();
  const dup = dupSnap.docs.find((d) => d.id !== String(codeId || "").trim());
  if (dup) throw new Error("Já existe um código com este valor.");

  const ref = String(codeId || "").trim() ? col.doc(String(codeId || "").trim()) : col.doc();

  const payload = {
    code: normalizedCode,
    description: desc,
    isActive: Boolean(isActive),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const snap = await ref.get();
  if (!snap.exists) payload.createdAt = admin.firestore.FieldValue.serverTimestamp();

  await ref.set(payload, { merge: true });

  return { ok: true, codeId: ref.id };
}

export async function deactivateOccurrenceCode({ tenantId, codeId } = {}) {
  const tid = String(tenantId || "").trim();
  const id = String(codeId || "").trim();
  if (!tid) throw new Error("tenantId obrigatório");
  if (!id) throw new Error("codeId obrigatório");

  const db = admin.firestore();
  const ref = db.doc(`tenants/${tid}/occurrenceCodes/${id}`);
  await ref.set(
    { isActive: false, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
  return { ok: true, codeId: id };
}

// =========================
// Session Evolution (Prontuário por sessão)
// Stored under patient subcollection to survive appointment deletion.
// Path: tenants/{tenantId}/patients/{patientId}/sessionEvolutions/{occurrenceId}
// =========================

function makeEvolutionSortKey(isoDate, startTime) {
  const iso = normalizeIsoDate(isoDate) || String(isoDate || "").trim();
  const st = normalizeTimeHHMM(startTime) || String(startTime || "").trim();
  return `${iso}#${st}`;
}

export async function getSessionEvolutionForOccurrence({ tenantId, occurrenceId } = {}) {
  const tid = String(tenantId || "").trim();
  const oid = String(occurrenceId || "").trim();
  if (!tid) throw new Error("tenantId obrigatório");
  if (!oid) throw new Error("occurrenceId obrigatório");

  const db = admin.firestore();

  const occRef = db.doc(`tenants/${tid}/appointmentOccurrences/${oid}`);
  const occSnap = await occRef.get();
  if (!occSnap.exists) throw new Error("Ocorrência não encontrada.");

  const occ = plain(occSnap.data() || {});
  if (occ?.isBlock === true) throw new Error("Ocorrência de bloco não suporta prontuário.");

  const patientId = String(occ?.patientId || "").trim();
  if (!patientId) {
    return { ok: true, patientId: null, evolution: null };
  }

  const evoRef = db.doc(`tenants/${tid}/patients/${patientId}/sessionEvolutions/${oid}`);
  const evoSnap = await evoRef.get();
  if (!evoSnap.exists) return { ok: true, patientId, evolution: null };

  const raw = plain(evoSnap.data() || {});
  const isoDate = normalizeIsoDate(raw?.isoDate || occ?.isoDate) || null;
  const startTime = normalizeTimeHHMM(raw?.startTime || occ?.startTime) || null;

  const evolution = {
    id: evoSnap.id,
    occurrenceId: oid,
    seriesId: raw?.seriesId ?? occ?.seriesId ?? null,
    isoDate,
    startTime,
    sortKey: String(raw?.sortKey || makeEvolutionSortKey(isoDate || "", startTime || "") || ""),
    sessionIndex: Number.isFinite(Number(raw?.sessionIndex))
      ? Number(raw.sessionIndex)
      : Number.isFinite(Number(occ?.sessionIndex))
      ? Number(occ.sessionIndex)
      : null,
    plannedTotalSessions: Number.isFinite(Number(raw?.plannedTotalSessions))
      ? Number(raw.plannedTotalSessions)
      : Number.isFinite(Number(occ?.plannedTotalSessions))
      ? Number(occ.plannedTotalSessions)
      : null,
    text: String(raw?.text ?? raw?.evolutionText ?? ""),
    createdAt: raw?.createdAt ?? null,
    createdBy: raw?.createdBy ?? null,
    updatedAt: raw?.updatedAt ?? null,
    updatedBy: raw?.updatedBy ?? null,
  };

  return { ok: true, patientId, evolution };
}

export async function upsertSessionEvolutionForOccurrence({
  tenantId,
  occurrenceId,
  text = "",
  actorUid = "",
} = {}) {
  const tid = String(tenantId || "").trim();
  const oid = String(occurrenceId || "").trim();
  if (!tid) throw new Error("tenantId obrigatório");
  if (!oid) throw new Error("occurrenceId obrigatório");

  const body = String(text ?? "").trim();

  const db = admin.firestore();
  const occRef = db.doc(`tenants/${tid}/appointmentOccurrences/${oid}`);

  const occSnap = await occRef.get();
  if (!occSnap.exists) throw new Error("Ocorrência não encontrada.");

  const occ = plain(occSnap.data() || {});
  if (occ?.isBlock === true) throw new Error("Ocorrência de bloco não suporta prontuário.");

  const patientId = String(occ?.patientId || "").trim();
  if (!patientId) throw new Error("Este item não possui paciente (lead/hold).");

  const isoDate = normalizeIsoDate(occ?.isoDate) || toIsoDate(safeToDate(occ?.date) || new Date());
  const startTime = normalizeTimeHHMM(occ?.startTime) || "00:00";
  const sortKey = makeEvolutionSortKey(isoDate, startTime);

  const evoRef = db.doc(`tenants/${tid}/patients/${patientId}/sessionEvolutions/${oid}`);

  await db.runTransaction(async (tx) => {
    const current = await tx.get(evoRef);

    const payload = {
      occurrenceId: oid,
      seriesId: occ?.seriesId || null,
      isoDate,
      startTime,
      sortKey,
      sessionIndex: Number.isFinite(Number(occ?.sessionIndex)) ? Number(occ.sessionIndex) : null,
      plannedTotalSessions: Number.isFinite(Number(occ?.plannedTotalSessions)) ? Number(occ.plannedTotalSessions) : null,
      text: body,
      // limpeza de campos legados (se existirem)
      occurrenceCodeId: admin.firestore.FieldValue.delete(),
      occurrenceCode: admin.firestore.FieldValue.delete(),
      evolutionText: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: String(actorUid || "").trim() || null,
    };

    if (!current.exists) {
      payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
      payload.createdBy = String(actorUid || "").trim() || null;
    }

    tx.set(evoRef, payload, { merge: true });
  });

  return { ok: true, patientId, occurrenceId: oid };
}

export async function listOccurrenceLogsForOccurrence({ tenantId, occurrenceId, limit = 20 } = {}) {
  const tid = String(tenantId || "").trim();
  const oid = String(occurrenceId || "").trim();
  if (!tid) throw new Error("tenantId obrigatório");
  if (!oid) throw new Error("occurrenceId obrigatório");

  const n = Math.max(1, Math.min(50, parseInt(limit, 10) || 20));

  const db = admin.firestore();

  // ✅ Nova estrutura (sem índice composto): logs como subcoleção da ocorrência
  const col = db.collection(`tenants/${tid}/appointmentOccurrences/${oid}/occurrenceLogs`);
  const snap = await col.orderBy("createdAt", "desc").limit(n).get();

  if (!snap.empty) {
    return snap.docs.map((d) => {
      const raw = plain(d.data() || {});
      return { id: d.id, ...raw };
    });
  }

  // ♻️ Fallback best-effort (legado): tenants/{tenantId}/occurrenceLogs
  // Não usa orderBy para evitar exigir índice composto em projetos já em andamento.
  const legacyCol = db.collection(`tenants/${tid}/occurrenceLogs`);
  const legacySnap = await legacyCol.where("occurrenceId", "==", oid).limit(n).get();

  const docs = legacySnap.docs
    .map((d) => {
      const raw = plain(d.data() || {});
      return { id: d.id, ...raw };
    })
    .sort((a, b) => {
      const da = safeToDate(a?.createdAt)?.getTime() || 0;
      const dbt = safeToDate(b?.createdAt)?.getTime() || 0;
      return dbt - da;
    });

  return docs;
}

export async function createOccurrenceLogForOccurrence({
  tenantId,
  occurrenceId,
  codeId,
  description = "",
  actorUid = "",
} = {}) {
  const tid = String(tenantId || "").trim();
  const oid = String(occurrenceId || "").trim();
  const cid = String(codeId || "").trim();
  if (!tid) throw new Error("tenantId obrigatório");
  if (!oid) throw new Error("occurrenceId obrigatório");
  if (!cid) throw new Error("codeId obrigatório");

  const desc = String(description || "").trim();

  const db = admin.firestore();
  const occRef = db.doc(`tenants/${tid}/appointmentOccurrences/${oid}`);
  const occSnap = await occRef.get();
  if (!occSnap.exists) throw new Error("Ocorrência não encontrada.");

  const occ = plain(occSnap.data() || {});
  if (occ?.isBlock === true) throw new Error("Ocorrência de bloco não suporta ocorrências.");

  const patientId = String(occ?.patientId || "").trim();
  if (!patientId) throw new Error("Este item não possui paciente (lead/hold).");

  const codeRef = db.doc(`tenants/${tid}/occurrenceCodes/${cid}`);
  const codeSnap = await codeRef.get();
  if (!codeSnap.exists) throw new Error("Código de ocorrência inválido.");

  const codeData = plain(codeSnap.data() || {});
  if (codeData?.isActive === false) throw new Error("Código de ocorrência inativo.");

  const isoDate = normalizeIsoDate(occ?.isoDate) || toIsoDate(safeToDate(occ?.date) || new Date());
  const startTime = normalizeTimeHHMM(occ?.startTime) || "00:00";

  // ✅ Nova estrutura (sem índice composto):
  // - Subcoleção da ocorrência (para listar no detalhe do agendamento)
  // - Subcoleção do paciente (para histórico/relatórios futuros sem collectionGroup)
  const occLogRef = db.collection(`tenants/${tid}/appointmentOccurrences/${oid}/occurrenceLogs`).doc();
  const patientLogRef = db.doc(`tenants/${tid}/patients/${patientId}/occurrenceLogs/${occLogRef.id}`);

  await db.runTransaction(async (tx) => {
    const payload = {
      patientId,
      occurrenceId: oid,
      seriesId: occ?.seriesId || null,
      isoDate,
      startTime,
      sessionIndex: Number.isFinite(Number(occ?.sessionIndex)) ? Number(occ.sessionIndex) : null,
      codeId: cid,
      code: String(codeData?.code || "").trim() || null,
      codeDescription: String(codeData?.description || "").trim() || null,
      description: desc,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: String(actorUid || "").trim() || null,
    };

    tx.set(occLogRef, payload, { merge: false });
    tx.set(patientLogRef, payload, { merge: false });
  });

  return { ok: true, logId: occLogRef.id, patientId, occurrenceId: oid };
}

export async function listPatientEvolutions({ tenantId, patientId, limit = 10 } = {}) {
  const tid = String(tenantId || "").trim();
  const pid = String(patientId || "").trim();
  if (!tid) throw new Error("tenantId obrigatório");
  if (!pid) throw new Error("patientId obrigatório");

  const n = Math.max(1, Math.min(50, parseInt(limit, 10) || 10));

  const db = admin.firestore();
  const col = db.collection(`tenants/${tid}/patients/${pid}/sessionEvolutions`);

  const snap = await col.orderBy("sortKey", "desc").limit(n).get();
  return snap.docs.map((d) => {
    const raw = plain(d.data() || {});
    return { id: d.id, ...raw, text: String(raw?.text ?? raw?.evolutionText ?? "") };
  });
}


export async function listPatientOccurrenceLogs({ tenantId, patientId, limit = 12 } = {}) {
  const tid = String(tenantId || "").trim();
  const pid = String(patientId || "").trim();
  if (!tid) throw new Error("tenantId obrigatório");
  if (!pid) throw new Error("patientId obrigatório");

  const n = Math.max(1, Math.min(50, parseInt(limit, 10) || 12));

  const db = admin.firestore();
  const col = db.collection(`tenants/${tid}/patients/${pid}/occurrenceLogs`);

  const snap = await col.orderBy("createdAt", "desc").limit(n).get();
  return snap.docs.map((d) => {
    const raw = plain(d.data() || {});
    return { id: d.id, ...raw };
  });
}



export { ALLOWED_STATUS };

