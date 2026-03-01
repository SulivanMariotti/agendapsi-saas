import admin from "@/lib/firebaseAdmin";

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

  return plain({
    tenantId,
    isoDate: anchorIso,
    view: 'week',
    weekStartIso,
    schedule,
    days,
    patientsById,
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

export async function createHoldOccurrence({
  tenantId,
  isoDate,
  startTime,
  leadName,
  leadMobile,
  durationBlocks,
  durationMin,
  replicateDays = 0,
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
}) {
  if (!tenantId) throw new Error("tenantId required");
  const iso = normalizeIsoDate(isoDate);
  const st = normalizeTimeHHMM(startTime);
  if (!iso) throw new Error("Data inválida");
  if (!st) throw new Error("Horário inválido");

  const name = String(fullName || "").trim();
  const cpfDigits = normalizeCpf(cpf);
  const mob = normalizeMobile(mobile);
  if (!name) throw new Error("Nome obrigatório");
  if (!cpfDigits) throw new Error("CPF obrigatório");
  if (!mob) throw new Error("Celular obrigatório");

  const db = admin.firestore();
  const tenantRef = db.collection("tenants").doc(tenantId);

  // schedule slot interval
  const scheduleSnap = await tenantRef.collection("settings").doc("schedule").get();
  const scheduleRaw = scheduleSnap.exists ? scheduleSnap.data() : null;
  const schedule = normalizeScheduleForRead(scheduleRaw || {});
  const slotIntervalMin = getSlotIntervalMin(schedule);
  const blocks = normalizeBlocks(durationBlocks, slotIntervalMin, durationMin);
  const durMin = blocks * slotIntervalMin;

  // Check if slot already has something
  const existing = await findOccurrenceAtSlot(tenantRef, { isoDate: iso, startTime: st });
  if (existing) {
    const d = existing.data() || {};
    // if it's a hold, we convert it to an appointment (requires contiguous duration match)
    if (d.isHold === true) {
      const groupId = String(d.groupId || existing.id);
      const holdBlocks = Number(d.durationBlocks) > 0 ? Number(d.durationBlocks) : 1;
      if (holdBlocks !== blocks) {
        throw new Error("A reserva existe, mas a duração não coincide (refaça a reserva com a mesma duração).");
      }

      const pid = await ensurePatientByCpf({ tenantRef, cpfDigits, name, mob });

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

  // Validate contiguous availability
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

  const patientId = await ensurePatientByCpf({ tenantRef, cpfDigits, name, mob });

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
    bufferMin: Number(schedule?.bufferMin) > 0 ? Number(schedule.bufferMin) : 0,
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
      bufferMin: Number(schedule?.bufferMin) > 0 ? Number(schedule.bufferMin) : 0,
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


async function ensurePatientByCpf({ tenantRef, cpfDigits, name, mob }) {
  const db = admin.firestore();
  const indexRef = tenantRef.collection("patientCpfIndex").doc(cpfDigits);
  const indexSnap = await indexRef.get();
  if (indexSnap.exists && indexSnap.data()?.patientId) {
    return String(indexSnap.data().patientId);
  }

  // create patient
  const patientRef = tenantRef.collection("patients").doc();
  const now = admin.firestore.FieldValue.serverTimestamp();
  await patientRef.set(
    {
      fullName: name,
      cpf: cpfDigits,
      mobile: mob,
      createdAt: now,
      updatedAt: now,
      profileCompleted: false,
      notes: "",
    },
    { merge: true }
  );

  await indexRef.set(
    {
      cpf: cpfDigits,
      patientId: patientRef.id,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  return patientRef.id;
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

export { ALLOWED_STATUS };

