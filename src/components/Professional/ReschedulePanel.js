"use client";

import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCcw } from "lucide-react";
import { Button } from "@/components/DesignSystem";

function normalizeIsoDateClient(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  const s10 = s.includes("T") ? s.slice(0, 10) : s;
  return /^\d{4}-\d{2}-\d{2}$/.test(s10) ? s10 : "";
}

function normalizeTimeClient(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  const parts = s.split(":");
  if (parts.length < 2) return "";
  const hh = parseInt(parts[0], 10);
  const mm = parseInt(parts[1], 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return "";
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return "";
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function toIsoDateTodayClient() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0)).toISOString().slice(0, 10);
}

function addDaysIsoClient(iso, deltaDays) {
  const s = normalizeIsoDateClient(iso);
  if (!s) return "";
  const d = new Date(`${s}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + (parseInt(deltaDays, 10) || 0));
  return d.toISOString().slice(0, 10);
}

function weekStartIsoFromIsoDateClient(iso) {
  const s = normalizeIsoDateClient(iso);
  if (!s) return "";
  const d = new Date(`${s}T12:00:00.000Z`);
  // Monday as week start
  const day = d.getUTCDay();
  const delta = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function timeToMinutesClient(t) {
  const s = normalizeTimeClient(t);
  if (!s) return 0;
  const [hh, mm] = s.split(":").map((x) => parseInt(x, 10));
  return (hh || 0) * 60 + (mm || 0);
}

function minutesToTimeClient(m) {
  const mm = Math.max(0, Math.min(24 * 60 - 1, parseInt(m, 10) || 0));
  const hh = Math.floor(mm / 60);
  const min = mm % 60;
  return `${String(hh).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function addMinutesToHHMMClient(t, deltaMin) {
  const base = timeToMinutesClient(t);
  const d = parseInt(deltaMin, 10) || 0;
  const next = base + d;
  if (next < 0 || next >= 24 * 60) return "";
  return minutesToTimeClient(next);
}

function buildSlotsFromRangesClient(ranges, stepMin) {
  const out = [];
  for (const r of ranges || []) {
    const s = normalizeTimeClient(r?.start);
    const e = normalizeTimeClient(r?.end);
    if (!s || !e) continue;
    const start = timeToMinutesClient(s);
    const end = timeToMinutesClient(e);
    if (!(end > start)) continue;
    for (let m = start; m < end; m += stepMin) out.push(minutesToTimeClient(m));
  }
  return Array.from(new Set(out)).sort((a, b) => timeToMinutesClient(a) - timeToMinutesClient(b));
}

function computeBlockedTimesForDayClient({ occurrences, slotIntervalMin, scheduleBufferMin }) {
  const blocked = new Set();

  // Block every occupied slot for each occurrence, respecting durationBlocks.
  for (const o of occurrences || []) {
    const st = normalizeTimeClient(o?.startTime);
    if (!st) continue;
    const slot = Number(o?.slotIntervalMin) > 0 ? Number(o.slotIntervalMin) : slotIntervalMin;
    const blocks = o?.isBlock === true ? 1 : Number(o?.durationBlocks) > 0 ? Number(o.durationBlocks) : 1;
    for (let b = 0; b < blocks; b++) {
      const tt = addMinutesToHHMMClient(st, b * slot);
      if (tt) blocked.add(tt);
    }
  }

  // Buffer after each main item (not isBlock)
  const main = (occurrences || []).filter((o) => o && o.isBlock !== true && o.startTime);
  for (const o of main) {
    const st = normalizeTimeClient(o?.startTime);
    if (!st) continue;
    const blocks = Number(o.durationBlocks) > 0 ? Number(o.durationBlocks) : 1;
    const slot = Number(o.slotIntervalMin) > 0 ? Number(o.slotIntervalMin) : slotIntervalMin;
    const bufferMin =
      Number(o.bufferMin) > 0 ? Number(o.bufferMin) : Number(scheduleBufferMin) > 0 ? Number(scheduleBufferMin) : 0;
    if (!bufferMin) continue;

    const endMin = timeToMinutesClient(st) + blocks * slot;
    if (!Number.isFinite(endMin)) continue;
    const bufferBlocks = Math.ceil(bufferMin / slotIntervalMin);
    for (let i = 0; i < bufferBlocks; i++) {
      const m = endMin + i * slotIntervalMin;
      if (m < 0 || m >= 24 * 60) continue;
      blocked.add(minutesToTimeClient(m));
    }
  }
  return blocked;
}

function fmtWeekRangePtClient(weekStartIso) {
  const s = normalizeIsoDateClient(weekStartIso);
  if (!s) return "";
  const start = new Date(`${s}T12:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (d) =>
    new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(d).replace(".", "");
  return `${fmt(start)} — ${fmt(end)}`;
}

function fmtDayHeaderPtClient(iso) {
  const s = normalizeIsoDateClient(iso);
  if (!s) return "";
  const d = new Date(`${s}T12:00:00.000Z`);
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(d).replace(".", "");
  const day = new Intl.DateTimeFormat("pt-BR", { day: "2-digit" }).format(d);
  return `${weekday} ${day}`;
}

function weekdayKeyFromIsoDateClient(iso) {
  const s = normalizeIsoDateClient(iso);
  if (!s) return "mon";
  const d = new Date(`${s}T12:00:00.000Z`);
  // getUTCDay(): 0=Sun,1=Mon,...6=Sat
  const day = d.getUTCDay();
  if (day === 0) return "sun";
  if (day === 1) return "mon";
  if (day === 2) return "tue";
  if (day === 3) return "wed";
  if (day === 4) return "thu";
  if (day === 5) return "fri";
  return "sat";
}

function normalizeDayRangesFromScheduleClient(schedule, weekdayKey) {
  const raw = schedule?.weekAvailability?.[weekdayKey];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => ({ start: normalizeTimeClient(r?.start), end: normalizeTimeClient(r?.end) }))
    .filter((r) => r.start && r.end && timeToMinutesClient(r.end) > timeToMinutesClient(r.start));
}


function computeWeekBoundsClient(days, slotIntervalMin) {
  let startMin = 8 * 60;
  let endMin = 18 * 60;
  let found = false;
  for (const d of days || []) {
    for (const r of d?.dayRanges || []) {
      const s = normalizeTimeClient(r?.start);
      const e = normalizeTimeClient(r?.end);
      if (!s || !e) continue;
      const sm = timeToMinutesClient(s);
      const em = timeToMinutesClient(e);
      if (!(em > sm)) continue;
      if (!found) {
        startMin = sm;
        endMin = em;
        found = true;
      } else {
        startMin = Math.min(startMin, sm);
        endMin = Math.max(endMin, em);
      }
    }
  }
  const step = Math.max(5, parseInt(slotIntervalMin, 10) || 30);
  startMin = Math.floor(startMin / step) * step;
  endMin = Math.ceil(endMin / step) * step;
  return { startMin, endMin };
}

function buildTimeRowsClient({ startMin, endMin, slotIntervalMin }) {
  const out = [];
  const step = Math.max(5, parseInt(slotIntervalMin, 10) || 30);
  for (let m = startMin; m <= endMin; m += step) out.push(m);
  return out;
}

function WeekSlotPicker({ occurrence, slotIntervalMin, scope, isRecurring, onPick, onClose }) {
  const [anchorIso, setAnchorIso] = useState(() => {
    const base = normalizeIsoDateClient(occurrence?.dateIso) || toIsoDateTodayClient();
    return weekStartIsoFromIsoDateClient(base);
  });
  const [weekData, setWeekData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Derived from loaded week data (can be undefined until fetch completes)
  const schedule = weekData?.schedule;

  const durationBlocks = useMemo(() => {
    const b = Number(occurrence?.durationBlocks);
    return Number.isFinite(b) && b > 0 ? b : 1;
  }, [occurrence?.durationBlocks]);

  const bufferMin = useMemo(() => {
    const b = Number(occurrence?.bufferMin);
    if (Number.isFinite(b) && b > 0) return b;
    const sb = Number(schedule?.bufferMin);
    return Number.isFinite(sb) && sb > 0 ? sb : 0;
  }, [occurrence?.bufferMin, schedule?.bufferMin]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setBusy(true);
      setErr("");
      try {
        const res = await fetch(`/api/professional/week?date=${encodeURIComponent(anchorIso)}`);
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.message || j?.error || "Falha ao carregar semana");
        if (!cancelled) setWeekData(j);
      } catch (e) {
        if (!cancelled) setErr(e?.message || "Erro ao carregar semana");
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [anchorIso]);

  const daysRaw = weekData?.days || [];
  const weekStartIso = weekData?.weekStartIso || weekStartIsoFromIsoDateClient(anchorIso);

  // Defensive: always render 7 columns (Mon..Sun), even if backend returns fewer days.
  const days = useMemo(() => {
    const byIso = new Map();
    for (const d of daysRaw || []) {
      const iso = normalizeIsoDateClient(d?.isoDate);
      if (!iso) continue;
      byIso.set(iso, d);
    }

    const out = [];
    for (let i = 0; i < 7; i++) {
      const isoDate = addDaysIsoClient(weekStartIso, i);
      const existing = byIso.get(isoDate);
      const weekdayKey = existing?.weekdayKey || weekdayKeyFromIsoDateClient(isoDate);
      const dayRanges = Array.isArray(existing?.dayRanges)
        ? existing.dayRanges
        : normalizeDayRangesFromScheduleClient(schedule, weekdayKey);
      const occurrences = Array.isArray(existing?.occurrences) ? existing.occurrences : [];
      out.push({ isoDate, weekdayKey, dayRanges, occurrences });
    }
    return out;
  }, [daysRaw, schedule, weekStartIso]);

  const filteredDays = useMemo(() => {
    const occId = occurrence?.id;
    const seriesId = occurrence?.seriesId;
    const currentIdx = Number(occurrence?.sessionIndex);

    return (days || []).map((d) => {
      const occ = Array.isArray(d?.occurrences) ? d.occurrences : [];
      let next = occ;
      if (occId) next = next.filter((o) => o?.id !== occId);

      // If scope is "future", allow picking a slot that is currently occupied by future occurrences of the same series,
      // because they will be moved together.
      if (isRecurring && scope === "future" && seriesId) {
        next = next.filter((o) => {
          if (o?.seriesId !== seriesId) return true;
          const idx = Number(o?.sessionIndex);
          if (!Number.isFinite(currentIdx) || !Number.isFinite(idx)) return false;
          return idx < currentIdx;
        });
      }

      return { ...d, occurrences: next };
    });
  }, [days, occurrence?.id, occurrence?.seriesId, occurrence?.sessionIndex, isRecurring, scope]);

  const dayState = useMemo(() => {
    const slot = Math.max(5, parseInt(slotIntervalMin, 10) || 30);
    const scheduleBufferMin = Number(schedule?.bufferMin) > 0 ? Number(schedule.bufferMin) : 0;

    return (filteredDays || []).map((d) => {
      const ranges = Array.isArray(d?.dayRanges) ? d.dayRanges : [];
      const openSlots = buildSlotsFromRangesClient(ranges, slot);
      const openSet = new Set(openSlots);
      const occ = Array.isArray(d?.occurrences) ? d.occurrences : [];
      const occByStart = new Map();
      const holdSet = new Set();
      for (const o of occ) {
        const st = normalizeTimeClient(o?.startTime);
        if (!st) continue;
        if (!occByStart.has(st)) occByStart.set(st, o);

        if (o?.isHold) {
          const blocks = o?.isBlock === true ? 1 : Number(o?.durationBlocks) > 0 ? Number(o.durationBlocks) : 1;
          const step = Number(o?.slotIntervalMin) > 0 ? Number(o.slotIntervalMin) : slot;
          for (let b = 0; b < blocks; b++) {
            const tt = addMinutesToHHMMClient(st, b * step);
            if (tt) holdSet.add(tt);
          }
        }
      }
      const blocked = computeBlockedTimesForDayClient({ occurrences: occ, slotIntervalMin: slot, scheduleBufferMin });
      return { isoDate: d.isoDate, openSet, blocked, occByStart, holdSet };
    });
  }, [filteredDays, slotIntervalMin, schedule?.bufferMin]);

  const { startMin, endMin } = useMemo(() => computeWeekBoundsClient(filteredDays, slotIntervalMin), [filteredDays, slotIntervalMin]);
  const rows = useMemo(
    () => buildTimeRowsClient({ startMin, endMin, slotIntervalMin }),
    [startMin, endMin, slotIntervalMin]
  );


  function canPick(isoDate, startTime) {
    const slot = Math.max(5, parseInt(slotIntervalMin, 10) || 30);
    const d = dayState.find((x) => x.isoDate === isoDate);
    if (!d) return false;

    for (let b = 0; b < durationBlocks; b++) {
      const tt = addMinutesToHHMMClient(startTime, b * slot);
      if (!tt || !d.openSet.has(tt) || d.blocked.has(tt)) return false;
    }

    const bufferBlocks = bufferMin ? Math.ceil(bufferMin / slot) : 0;
    if (bufferBlocks) {
      for (let i = 0; i < bufferBlocks; i++) {
        const tt = addMinutesToHHMMClient(startTime, (durationBlocks + i) * slot);
        if (!tt) continue;
        if (d.blocked.has(tt)) return false;
      }
    }
    return true;
  }

  function goWeek(deltaWeeks) {
    setAnchorIso((prev) => addDaysIsoClient(prev, (parseInt(deltaWeeks, 10) || 0) * 7));
  }

  return (
    <div className="flex flex-col gap-3 h-full max-h-[78vh] overflow-y-auto pr-1 overflow-x-hidden">
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-100 pb-2">
        <div className="flex items-center justify-between gap-2 pt-1">
          <div>
            <p className="text-xs font-extrabold text-slate-900">Escolher horário na semana</p>
            <p className="text-[11px] text-slate-500">
              {isRecurring && scope === "future"
                ? "Escolha uma vaga para reagendar esta e futuras."
                : "Escolha uma vaga para reagendar só esta ocorrência."}
            </p>
          </div>
          <Button variant="secondary" onClick={onClose} disabled={busy} className="px-4 py-2 text-xs rounded-xl">
            Voltar
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => goWeek(-1)}
              disabled={busy}
              className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              aria-label="Semana anterior"
              type="button"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => goWeek(1)}
              disabled={busy}
              className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              aria-label="Próxima semana"
              type="button"
            >
              <ChevronRight size={16} />
            </button>
            <p className="text-xs font-extrabold text-slate-900">{fmtWeekRangePtClient(anchorIso)}</p>
          </div>
          <p className="text-[11px] text-slate-500">
            Duração: {durationBlocks * (parseInt(slotIntervalMin, 10) || 30)} min
          </p>
        </div>

        {err ? (
          <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-800">{err}</div>
        ) : null}

        <div className="mt-3 overflow-x-hidden">
          <div className="w-full">
            <div className="grid" style={{ gridTemplateColumns: `44px repeat(7, minmax(44px, 1fr))` }}>
              <div className="sticky left-0 z-10 bg-white" />
              {dayState.map((d) => {
                const isEnabled = d?.openSet && typeof d.openSet.size === "number" ? d.openSet.size > 0 : false;
                return (
                  <div
                    key={d.isoDate}
                    className={`px-1 py-1 text-center border-b border-slate-100 ${isEnabled ? "text-slate-700" : "text-slate-300"}`}
                  >
                    <div className="text-[10px] font-extrabold leading-4">{fmtDayHeaderPtClient(d.isoDate)}</div>
                    {!isEnabled ? <div className="text-[9px] font-semibold text-slate-300">Fechado</div> : null}
                  </div>
                );
              })}

              {rows.map((m) => {
                const t = minutesToTimeClient(m);
                return (
                  <React.Fragment key={`row_${t}`}>
                    <div className="sticky left-0 z-10 bg-white border-b border-slate-100 px-1 py-1">
                      <p className="text-[10px] font-bold text-slate-500">{t}</p>
                    </div>
                    {dayState.map((d) => {
                      const isOpen = d.openSet.has(t);
                      if (!isOpen) return <div key={`${d.isoDate}_${t}`} className="border-b border-slate-100" />;

                      const ok = canPick(d.isoDate, t);
                      const isBlocked = d.blocked.has(t);
                      const isHoldAt = Boolean(d.holdSet?.has(t) || d.occByStart?.get(t)?.isHold);
                      const isBusyAppt = Boolean(!ok && !isHoldAt && (d.occByStart?.has(t) || isBlocked));

                      const cellStyle = ok
                        ? "border-emerald-300 bg-emerald-500 text-white hover:bg-emerald-600"
                        : isHoldAt
                        ? "border-slate-700 bg-slate-700 text-white"
                        : isBusyAppt
                        ? "border-slate-100 bg-slate-50 text-slate-400"
                        : "border-slate-100 bg-slate-100/60 text-slate-400";

                      const cellLabel = ok ? "L" : isHoldAt ? "R" : "—";

                      return (
                        <div key={`${d.isoDate}_${t}`} className="border-b border-slate-100 px-0.5 py-0.5">
                          <button
                            type="button"
                            onClick={() => ok && onPick?.({ isoDate: d.isoDate, startTime: t })}
                            disabled={busy || !ok}
                            className={`w-full rounded-lg border p-1 text-center text-[11px] font-extrabold transition ${cellStyle}`}
                          >
                            {cellLabel}
                          </button>
                        </div>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          <span>Toque em:</span>
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700 font-extrabold">L</span>
          <span>(Livre)</span>
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-600 bg-slate-700 px-2 py-0.5 text-white font-extrabold">R</span>
          <span>(Reserva)</span>
        </div>
      </div>
    </div>
  );
}

export default function ReschedulePanel({ occurrence, slotIntervalMin = 30, onDone, onCancel }) {
  const isRecurring = useMemo(() => {
    const total = Number(occurrence?.plannedTotalSessions);
    const idx = Number(occurrence?.sessionIndex);
    return Boolean(occurrence?.seriesId) && Number.isFinite(total) && total > 1 && Number.isFinite(idx) && idx >= 1;
  }, [occurrence?.seriesId, occurrence?.plannedTotalSessions, occurrence?.sessionIndex]);

  const [newIsoDate, setNewIsoDate] = useState("");
  const [newStartTime, setNewStartTime] = useState("");
  const [scope, setScope] = useState("single");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setNewIsoDate(normalizeIsoDateClient(occurrence?.dateIso));
    setNewStartTime(normalizeTimeClient(occurrence?.startTime));
    setScope("single");
    setPickerOpen(false);
    setErr("");
  }, [occurrence?.id, occurrence?.dateIso, occurrence?.startTime]);

  if (pickerOpen) {
    return (
      <WeekSlotPicker
        occurrence={occurrence}
        slotIntervalMin={slotIntervalMin}
        scope={isRecurring ? scope : "single"}
        isRecurring={isRecurring}
        onPick={({ isoDate, startTime }) => {
          if (isoDate) setNewIsoDate(isoDate);
          if (startTime) setNewStartTime(startTime);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    );
  }

  async function submit() {
    if (!occurrence?.id) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/professional/occurrence/reschedule", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          occurrenceId: occurrence.id,
          newIsoDate,
          newStartTime,
          scope: isRecurring ? scope : "single",
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.message || "Falha ao reagendar");
      onDone?.(j);
    } catch (e) {
      setErr(e?.message || "Erro ao reagendar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-slate-100 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-slate-400 font-bold">Novo horário</p>
          <button
            type="button"
            onClick={() => {
              setErr("");
              setPickerOpen(true);
            }}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-extrabold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            aria-label="Escolher horário na semana"
          >
            <CalendarDays size={14} />
            Ver semana
          </button>
        </div>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-semibold text-slate-600">Data</label>
            <input
              type="date"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
              value={newIsoDate}
              onChange={(e) => setNewIsoDate(e.target.value)}
              disabled={busy}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Horário</label>
            <input
              type="time"
              step={Math.max(60, parseInt(slotIntervalMin, 10) * 60) || 1800}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
              value={newStartTime}
              onChange={(e) => setNewStartTime(e.target.value)}
              disabled={busy}
            />
            <p className="mt-1 text-[11px] text-slate-400">Dica: respeite o intervalo da agenda (ex.: {slotIntervalMin} min).</p>
          </div>
        </div>
      </div>

      {isRecurring ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-3">
          <p className="text-xs text-slate-400 font-bold">Aplicar</p>
          <div className="mt-2 flex flex-col gap-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input
                type="radio"
                name="scope"
                value="single"
                checked={scope === "single"}
                onChange={() => setScope("single")}
                disabled={busy}
              />
              Só esta ocorrência
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input
                type="radio"
                name="scope"
                value="future"
                checked={scope === "future"}
                onChange={() => setScope("future")}
                disabled={busy}
              />
              Esta e futuras
            </label>
            <p className="text-[11px] text-slate-500">
              Regra (MVP): se houver conflito em qualquer sessão futura, o sistema bloqueia e não altera parcialmente.
            </p>
          </div>
        </div>
      ) : null}

      {err ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-800">{err}</div>
      ) : null}

      <div className="flex gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy} className="flex-1">
          Cancelar
        </Button>
        <Button variant="primary" icon={RefreshCcw} onClick={submit} disabled={busy || !newIsoDate || !newStartTime} className="flex-1">
          Reagendar
        </Button>
      </div>
    </div>
  );
}
