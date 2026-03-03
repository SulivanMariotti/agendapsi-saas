"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  useRouter } from "next/navigation";
import {
  CalendarDays,
  Layers,
  ChevronLeft,
  ChevronRight,
  BadgeCheck,
  Plus,
  Search,
  CheckCircle,
  XCircle,
  UserX,
  RefreshCcw,
  Lock,
  Trash2,
  X,
  KeyRound,
  Copy,
  Loader2,
} from "lucide-react";

import { Button, Card } from "@/components/DesignSystem";
import ReschedulePanel from "@/components/Professional/ReschedulePanel";
import SessionEvolutionPanel from "@/components/Professional/SessionEvolutionPanel";
import OccurrenceLogPanel from "@/components/Professional/OccurrenceLogPanel";
import WhatsAppIcon from "@/components/Icons/WhatsAppIcon";

function toDateFromIso(iso) {
  const d = new Date(`${iso}T12:00:00.000Z`);
  return Number.isFinite(d.getTime()) ? d : new Date();
}

function addDaysIso(iso, deltaDays) {
  const d = toDateFromIso(iso);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function fmtDatePt(iso) {
  const d = toDateFromIso(iso);
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(d);
}

function fmtDateShortPt(iso) {
  const d = toDateFromIso(iso);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(d);
}

function fmtWeekdayShortPt(iso) {
  const d = toDateFromIso(iso);
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "America/Sao_Paulo" }).format(d);
}

function isoTodaySaoPaulo() {
  // Avoid UTC date shifting near midnight and keep "today" consistent for Brazil/São Paulo.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  if (y && m && d) return `${y}-${m}-${d}`;
  return new Date().toISOString().slice(0, 10);
}

function timeNowSaoPauloHHMM() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const hh = parts.find((p) => p.type === "hour")?.value;
  const mm = parts.find((p) => p.type === "minute")?.value;
  if (hh && mm) return `${hh}:${mm}`;
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}


function timeToMinutes(t) {
  const [h, m] = String(t || "0:0").split(":").map((x) => parseInt(x, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function minutesToTime(m) {
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function buildSlots(startTime, endTime, stepMin = 30) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  const out = [];
  // end is treated as exclusive (so "12:00" with 30min step ends at 11:30)
  for (let m = start; m < end; m += stepMin) out.push(minutesToTime(m));
  return out;
}

function buildSlotsFromRanges(ranges, stepMin = 30) {
  const out = [];
  for (const r of ranges || []) {
    const s = r?.start;
    const e = r?.end;
    if (!s || !e) continue;
    out.push(...buildSlots(s, e, stepMin));
  }
  // unique + sorted
  return Array.from(new Set(out)).sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
}

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D+/g, "");
  return digits;
}

function applyTemplate(body, vars) {
  let out = String(body || "");
  for (const [k, v] of Object.entries(vars || {})) {
    out = out.replaceAll(`{${k}}`, String(v ?? ""));
  }
  return out;
}

function buildWhatsappUrl(phone, text) {
  const p = normalizePhone(phone);
  if (!p) return null;
  const q = encodeURIComponent(String(text || "").trim());
  return `https://wa.me/${p}?text=${q}`;
}

const STATUSES = ["Agendado", "Confirmado", "Finalizado", "Não comparece", "Cancelado", "Reagendado"];

function statusPillClass(status) {
  switch (status) {
    case "Agendado":
      return "bg-violet-50 text-violet-800 border-violet-200";
    case "Confirmado":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "Finalizado":
      return "bg-slate-100 text-slate-700 border-slate-200";
    case "Não comparece":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "Cancelado":
      return "bg-red-50 text-red-800 border-red-200";
    case "Reagendado":
      return "bg-blue-50 text-blue-800 border-blue-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

function StatusIcon({ status, size = 12, className = "" }) {
  const Icon =
    status === "Agendado"
      ? CalendarDays
      : status === "Confirmado"
      ? BadgeCheck
      : status === "Finalizado"
      ? CheckCircle
      : status === "Não comparece"
      ? UserX
      : status === "Cancelado"
      ? XCircle
      : status === "Reagendado"
      ? RefreshCcw
      : BadgeCheck;

  return <Icon size={size} className={className} />;
}

function statusBarClass(status) {
  switch (status) {
    case "Agendado":
      return "bg-violet-500";
    case "Confirmado":
      return "bg-emerald-500";
    case "Finalizado":
      return "bg-slate-400";
    case "Não comparece":
      return "bg-amber-500";
    case "Cancelado":
      return "bg-red-500";
    case "Reagendado":
      return "bg-blue-500";
    default:
      return "bg-slate-300";
  }
}

function statusCardSoftClass(status) {
  // Softer background for Day view blocks (status color but subtle).
  switch (status) {
    case "Agendado":
      return "bg-violet-50 border-violet-100";
    case "Confirmado":
      return "bg-emerald-50 border-emerald-100";
    case "Finalizado":
      return "bg-slate-50 border-slate-200";
    case "Não comparece":
      return "bg-amber-50 border-amber-100";
    case "Cancelado":
      return "bg-red-50 border-red-100";
    case "Reagendado":
      return "bg-blue-50 border-blue-100";
    default:
      return "bg-white border-slate-100";
  }
}

function statusAccentBorderClass(status) {
  // Left accent border to keep scanning quick even with soft backgrounds.
  switch (status) {
    case "Agendado":
      return "border-l-violet-500";
    case "Confirmado":
      return "border-l-emerald-500";
    case "Finalizado":
      return "border-l-slate-400";
    case "Não comparece":
      return "border-l-amber-500";
    case "Cancelado":
      return "border-l-red-500";
    case "Reagendado":
      return "border-l-blue-500";
    default:
      return "border-l-slate-300";
  }
}

function statusIconColorClass(status) {
  // Icon-only status indicator (no border/pill). Keep a subtle color cue.
  switch (status) {
    case "Agendado":
      return "text-violet-700";
    case "Confirmado":
      return "text-emerald-700";
    case "Finalizado":
      return "text-slate-600";
    case "Não comparece":
      return "text-amber-700";
    case "Cancelado":
      return "text-red-700";
    case "Reagendado":
      return "text-blue-700";
    default:
      return "text-slate-600";
  }
}

function occCardSoftClass(occ) {
  if (occ?.isHold) return "bg-slate-100/60 border-slate-200";
  return statusCardSoftClass(occ?.status);
}

function occAccentBorderClass(occ) {
  if (occ?.isHold) return "border-l-slate-300";
  return statusAccentBorderClass(occ?.status);
}

function occIconColorClass(occ) {
  if (occ?.isHold) return "text-slate-500";
  return statusIconColorClass(occ?.status);
}



function ModalShell({
  title,
  onClose,
  children,
  footer = null,
  headerRight = null,
  maxWidthClass = "max-w-lg",
  containerClass = "",
  bodyClass = "p-4",
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-3"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className={`w-full ${maxWidthClass} max-h-[92dvh] rounded-2xl bg-white border border-slate-200 shadow-xl overflow-hidden flex flex-col ${containerClass}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
          <p className="text-xs font-extrabold text-slate-900 truncate">{title}</p>
          <div className="flex items-center gap-2 min-w-0">
            {headerRight ? (
              <div className="min-w-0 max-w-[65vw] overflow-x-auto whitespace-nowrap">
                <div className="inline-flex items-center gap-1">{headerRight}</div>
              </div>
            ) : null}
            <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            title="Fechar"
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
          >
            <X size={16} />
          </button>
          </div>
        </div>
        <div className={`${bodyClass} overflow-y-auto min-h-0`}>{children}</div>
        {footer ? (
          <div className="border-t border-slate-100 px-4 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function ProfessionalDayViewClient({ initialData }) {
  const router = useRouter();

  const [data, setData] = useState(initialData);
  const [selectedOccId, setSelectedOccId] = useState(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const evolutionRef = useRef(null);
  const logsRef = useRef(null);
  const [isEvoDirty, setIsEvoDirty] = useState(false);
  const [isLogDraftDirty, setIsLogDraftDirty] = useState(false);
  const [clinicalTab, setClinicalTab] = useState("evolution"); // "evolution" | "logs"

  const [modal, setModal] = useState(null); // { type: 'hold'|'appointment', startTime }
  const [nextPick, setNextPick] = useState(null); // { slots: [{isoDate,startTime}], type }
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [deleteOcc, setDeleteOcc] = useState(null); // occurrence object for delete confirmation
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [editStatus, setEditStatus] = useState("Agendado");

// Paciente (MVP): gerar código de acesso (one-time) para o portal /paciente
const [patientAccessCode, setPatientAccessCode] = useState(null); // { code, expiresAt, ttlMin }
const [patientCodeBusy, setPatientCodeBusy] = useState(false);
const [patientCodeErr, setPatientCodeErr] = useState("");

useEffect(() => {
  setPatientAccessCode(null);
  setPatientCodeErr("");
}, [selectedOccId]);

const handleGeneratePatientAccessCode = async () => {
  const pid = selectedOcc?.patientId;
  if (!pid) return;

  setPatientCodeBusy(true);
  setPatientCodeErr("");
  try {
    const res = await fetch("/api/profissional/pacientes/access-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId: pid }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok || !data?.code) {
      throw new Error(data?.error || "Falha ao gerar código.");
    }

    setPatientAccessCode({ code: data.code, expiresAt: data.expiresAt, ttlMin: data.ttlMin });

    // Melhor esforço: copia automaticamente para o clipboard
    try {
      await navigator.clipboard.writeText(String(data.code));
    } catch {
      // ignore
    }
  } catch (e) {
    setPatientCodeErr(e?.message || "Falha ao gerar código.");
  } finally {
    setPatientCodeBusy(false);
  }
};

const handleCopyPatientAccessCode = async () => {
  if (!patientAccessCode?.code) return;
  try {
    await navigator.clipboard.writeText(String(patientAccessCode.code));
  } catch {
    // ignore
  }
};


useEffect(() => {
  if (selectedOccId) setClinicalTab("evolution");
}, [selectedOccId]);

  const tenantId = data?.tenantId;
  const isoDate = data?.isoDate;

  const slotIntervalMin = useMemo(() => {
    const v = Number(data?.schedule?.slotIntervalMin);
    if (Number.isFinite(v) && v > 0) return v;
    return 30;
  }, [data?.schedule?.slotIntervalMin]);

  const defaultDurationBlocks = useMemo(() => {
    const v = Number(data?.schedule?.defaultDurationBlocks ?? data?.schedule?.defaultBlocks);
    if (Number.isFinite(v) && v > 0) return Math.max(1, Math.min(8, v));
    return 2;
  }, [data?.schedule?.defaultDurationBlocks, data?.schedule?.defaultBlocks]);

  const dayLabel = useMemo(() => fmtDatePt(isoDate), [isoDate]);

  const weekdayShort = useMemo(() => {
    const d = toDateFromIso(isoDate);
    return new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "America/Sao_Paulo" }).format(d);
  }, [isoDate]);

  const slots = useMemo(() => {
    const ranges = Array.isArray(data?.dayRanges)
      ? data.dayRanges
      : [{ start: data?.dayBounds?.start || "07:00", end: data?.dayBounds?.end || "20:00" }];
    return buildSlotsFromRanges(ranges, slotIntervalMin);
  }, [data?.dayRanges, data?.dayBounds?.start, data?.dayBounds?.end, slotIntervalMin]);

  const occByStart = useMemo(() => {
    const map = new Map();
    for (const o of data?.occurrences || []) {
      if (!o?.startTime) continue;
      map.set(o.startTime, o);
    }
    return map;
  }, [data?.occurrences]);

  const selectedOcc = useMemo(() => {
    const occs = data?.occurrences || [];
    return occs.find((o) => o.id === selectedOccId) || null;
  }, [data?.occurrences, selectedOccId]);

  useEffect(() => {
    if (!selectedOcc?.id) return;
    setEditStatus(selectedOcc?.status || "Agendado");
  }, [selectedOcc?.id]);

  useEffect(() => {
    if (!selectedOcc?.id) return;
    setIsEvoDirty(false);
    setIsLogDraftDirty(false);
  }, [selectedOcc?.id]);

  const statusOriginal = selectedOcc?.status || "Agendado";
  const isStatusDirty = Boolean(selectedOcc) && !selectedOcc?.isHold && (editStatus || "Agendado") !== statusOriginal;
  const hasAnyDirty = Boolean(isStatusDirty || isEvoDirty || isLogDraftDirty);

  const selectedPatient = useMemo(() => {
    const pid = selectedOcc?.patientId;
    return pid ? data?.patientsById?.[pid] || null : null;
  }, [data?.patientsById, selectedOcc?.patientId]);

  const selectedSeries = useMemo(() => {
    const sid = selectedOcc?.seriesId;
    return sid ? data?.seriesById?.[sid] || null : null;
  }, [data?.seriesById, selectedOcc?.seriesId]);

  const templates = data?.whatsappTemplates || [];
  const effectiveTemplateId = selectedTemplateId || templates?.[0]?.id || "";
  const effectiveTemplate = templates.find((t) => t.id === effectiveTemplateId) || templates?.[0] || null;

  const messagePreview = useMemo(() => {
    if (!effectiveTemplate) return "";
    const nome = selectedPatient?.fullName || selectedOcc?.leadName || "";
    const dataStr = fmtDateShortPt(isoDate);
    const hora = selectedOcc?.startTime || "";
    return applyTemplate(effectiveTemplate.body, { nome, data: dataStr, hora });
  }, [effectiveTemplate, selectedPatient?.fullName, selectedOcc?.leadName, isoDate, selectedOcc?.startTime]);

  const hasWhatsappPhone = Boolean(selectedPatient?.mobile || selectedOcc?.leadMobile);

  function pushWith(params) {
    const url = new URL(window.location.href);
    for (const [k, v] of Object.entries(params || {})) {
      if (v == null || v === "") url.searchParams.delete(k);
      else url.searchParams.set(k, String(v));
    }
    router.push(url.pathname + "?" + url.searchParams.toString());
  }

  async function refreshDay(nextIsoDate = isoDate) {
    const res = await fetch(`/api/professional/day?date=${encodeURIComponent(nextIsoDate)}`, { cache: "no-store" });
    if (!res.ok) throw new Error("Falha ao atualizar agenda");
    const json = await res.json();
    setData(json);
    return json;
  }

  function goToday() {
    const todayIso = isoTodaySaoPaulo();
    pushWith({ date: todayIso });
    setSelectedOccId(null);
    refreshDay(todayIso).catch(() => {});
  }

  function goDelta(delta) {
    const nextIso = addDaysIso(isoDate, delta);
    pushWith({ date: nextIso });
    setSelectedOccId(null);
    refreshDay(nextIso).catch(() => {});
  }

  function openWhatsapp() {
    const phone = selectedPatient?.mobile || selectedOcc?.leadMobile || "";
    const url = buildWhatsappUrl(phone, messagePreview);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    } finally {
      window.location.href = "/login";
    }
  }


  async function patchStatus(nextStatus) {
    if (!selectedOcc?.id) return false;
    try {
      const res = await fetch("/api/professional/occurrence/status", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ occurrenceId: selectedOcc.id, status: nextStatus }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.message || "Falha ao salvar status");
      }
      return true;
    } catch (e) {
      setErrorMsg(e?.message || "Erro ao salvar status");
      return false;
    }
  }

  async function saveAll() {
    if (!selectedOcc?.id || selectedOcc?.isHold) return;
    setBusy(true);
    setErrorMsg("");
    try {
      const evoOk = await evolutionRef.current?.saveIfDirty?.();
      if (evoOk === false) throw new Error("Falha ao salvar evolução.");

      const logOk = await logsRef.current?.saveDraft?.();
      if (logOk === false) throw new Error("Falha ao registrar ocorrência.");

      const original = selectedOcc?.status || "Agendado";
      const current = editStatus || "Agendado";

      if (current !== original) {
        const ok = await patchStatus(current);
        if (!ok) throw new Error("Falha ao salvar status.");
        await refreshDay(isoDate);
      }
    } catch (e) {
      setErrorMsg(e?.message || "Erro ao salvar alterações");
    } finally {
      setBusy(false);
    }
  }


  function closeDetails() {
    const original = selectedOcc?.status || "Agendado";
    const current = editStatus || "Agendado";
    const hasUnsaved = Boolean(selectedOcc) && !selectedOcc?.isHold && (current !== original || isEvoDirty || isLogDraftDirty);
    if (hasUnsaved) {
      const ok = window.confirm("Você tem alterações não salvas neste agendamento. Deseja descartar e fechar?");
      if (!ok) return;
    }
    setSelectedOccId(null);
    setSelectedTemplateId(null);
    setErrorMsg("");
  }

  async function findNextAvailableAndOpen(type = "appointment") {
    setBusy(true);
    setErrorMsg("");
    try {
      const todayIso = isoTodaySaoPaulo();
      const fromTime = isoDate === todayIso ? timeNowSaoPauloHHMM() : "00:00";
      const res = await fetch(
        `/api/professional/next-available?fromDate=${encodeURIComponent(isoDate)}&fromTime=${encodeURIComponent(fromTime)}&blocks=${encodeURIComponent(
          defaultDurationBlocks
        )}&limit=3`,
        { cache: "no-store" }
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) throw new Error(j?.message || "Falha ao buscar próximo horário");
      const slots = Array.isArray(j?.slots) ? j.slots : j?.found ? [{ isoDate: j?.isoDate, startTime: j?.startTime }] : [];
      if (!slots.length) throw new Error("Não encontrei horário disponível nos próximos 30 dias.");
      setNextPick({ type, slots });
    } catch (e) {
      setErrorMsg(e?.message || "Erro ao buscar próximo horário");
    } finally {
      setBusy(false);
    }
  }

  async function pickNextSlot(slot) {
    if (!slot?.isoDate || !slot?.startTime) return;
    setBusy(true);
    setErrorMsg("");
    try {
      const nextIso = slot.isoDate;
      const nextTime = slot.startTime;

      pushWith({ date: nextIso });
      setSelectedOccId(null);
      await refreshDay(nextIso);
      setNextPick(null);
      setModal({ type: nextPick?.type || "appointment", startTime: nextTime });
    } catch (e) {
      setErrorMsg(e?.message || "Erro ao abrir horário");
    } finally {
      setBusy(false);
    }
  }
  async function runDelete(occurrenceId, scope) {
    if (!occurrenceId) return;
    setBusy(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/professional/occurrence/delete", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ occurrenceId, scope }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.message || "Falha ao excluir");
      setDeleteOcc(null);
      setSelectedOccId(null);
      router.refresh();
    } catch (e) {
      setErrorMsg(e?.message || "Erro ao excluir");
    } finally {
      setBusy(false);
    }
  }



  return (
    <div className="mx-auto max-w-7xl p-3 sm:p-6 text-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-3">
            <CalendarDays className="text-violet-700" size={22} />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900">Agenda (Profissional)</h1>
            <p className="text-xs text-slate-400">
              Tenant: <span className="font-mono">{tenantId}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
            <button
              type="button"
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-600 text-white"
              onClick={() => {
                // already on day
              }}
            >
              Dia
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-700 hover:bg-slate-50"
              onClick={() => {
                router.push(`/profissional?view=week&date=${encodeURIComponent(isoDate)}`);
              }}
            >
              Semana
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-700 hover:bg-slate-50"
              onClick={() => {
                router.push(`/profissional?view=month&date=${encodeURIComponent(isoDate)}`);
              }}
            >
              Mês
            </button>
          </div>

          <Button variant="secondary" icon={ChevronLeft} onClick={() => goDelta(-1)} />
          <Button variant="secondary" onClick={goToday}>
            Hoje
          </Button>
          <Button variant="secondary" icon={ChevronRight} onClick={() => goDelta(1)} />

          <Button variant="secondary" icon={Search} onClick={() => findNextAvailableAndOpen("appointment")} disabled={busy}>
            Próximo horário
          </Button>

          <Button variant="secondary" onClick={logout}>
            Sair
          </Button>
        </div>
      </div>

      {errorMsg ? (
        <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-800">
          {errorMsg}
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-4">
  <Card title="Horários do dia" className="min-h-[60vh]">
          <div className="mb-2 text-[11px] text-slate-600 capitalize">{dayLabel}</div>
          {!slots.length ? (
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs font-semibold text-slate-500">
              Sem horários abertos neste dia (verifique a configuração da agenda).
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-100 overflow-hidden">
              {slots.map((t) => {
                const occ = occByStart.get(t) || null;
                const patient = occ?.patientId ? data?.patientsById?.[occ.patientId] : null;
                const series = occ?.seriesId ? data?.seriesById?.[occ.seriesId] : null;
                const isSelected = !!occ && occ.id === selectedOccId;

                return (
                  <div
                    key={t}
                    className="grid grid-cols-[50px_1fr] sm:grid-cols-[54px_1fr] gap-1 items-stretch px-2 py-0.5 bg-white border-b border-slate-100 last:border-b-0"
                  >
                    <div className="flex items-center justify-center text-slate-500">
                      <span className="font-mono text-[10px]">{t}</span>
                    </div>

                    {occ ? (
                      occ.isBlock ? (
                        <div
                          className={`text-left rounded-xl border border-l-4 overflow-hidden ${occCardSoftClass(occ)} ${occAccentBorderClass(occ)} ${
                            selectedOccId && (selectedOccId === occ.parentOccurrenceId || selectedOccId === occ.id)
                              ? "ring-2 ring-violet-100"
                              : ""
                          }`}
                          title="Continuação (ocupado)"
                        >
                          <div className="px-2 py-1 leading-tight">
                            <p className="text-xs font-semibold text-slate-800 truncate">
                              {patient?.fullName || occ?.leadName || "(sem paciente)"}
                            </p>
                            <p className="text-[11px] text-slate-600">Continuação (ocupado)</p>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() =>
                            setSelectedOccId(occ.isBlock && occ.parentOccurrenceId ? occ.parentOccurrenceId : occ.id)
                          }
                          className={`w-full text-left rounded-xl border border-l-4 overflow-hidden hover:brightness-[0.99] transition ${occCardSoftClass(occ)} ${occAccentBorderClass(occ)} ${
                            isSelected ? "ring-2 ring-violet-100" : ""
                          }`}
                          title="Abrir detalhes"
                        >
                          <div className="px-2 py-1 flex items-start justify-between gap-2 leading-tight">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-900 truncate">
                                {patient?.fullName || occ?.leadName || "(sem paciente)"}
                              </p>
                              <p className="text-[11px] text-slate-600 truncate">
                                {occ.isHold ? "Reserva (hold)" : series?.title || "Sessão"}
                              </p>
                            </div>
                            <div className="shrink-0 flex flex-col items-end text-right">
                              
<div className="flex items-center justify-end gap-1">
                                <p className="text-[11px] text-slate-500">{occ.durationMin || 0}m</p>

                                {Number.isFinite(occ.sessionIndex) && Number.isFinite(occ.plannedTotalSessions) ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-slate-200 bg-white/70 text-[10px] font-semibold text-slate-700">
                                    {occ.sessionIndex}/{occ.plannedTotalSessions}
                                  </span>
                                ) : null}

                                <span
                                  title={occ.isHold ? "Reserva" : occ.status || ""}
                                  aria-label={occ.isHold ? "Reserva" : occ.status || ""}
                                  className={`inline-flex items-center justify-center ${occIconColorClass(occ)}`}
                                >
                                  {occ.isHold ? <Lock size={14} /> : <StatusIcon status={occ.status} size={14} />}
                                  <span className="sr-only">{occ.isHold ? "Reserva" : occ.status || "—"}</span>
                                </span>
                              </div>
                              {occ.durationBlocks && occ.durationBlocks > 1 ? (
                                <p className="text-[10px] text-slate-400">{occ.durationBlocks} blocos</p>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      )
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 px-2 py-1 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-500">Livre</p>
                          <p className="text-[11px] text-slate-400">Clique para reservar/agenda</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setModal({ type: "hold", startTime: t })}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <Plus size={14} /> Reserva
                          </button>
                          <button
                            onClick={() => setModal({ type: "appointment", startTime: t })}
                            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
                          >
                            <Plus size={14} /> Agendar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
  <div className="text-xs text-slate-400 px-1">
            <p>
              Nota (MVP): criação de reserva e agendamento rápido já disponível. “Próximo horário” respeita configuração de agenda + almoço + buffer.
              Próximos passos: séries/recorrência e edição por ocorrência/série.
            </p>
          </div>
</div>


{selectedOcc ? (
  <ModalShell
    title={selectedOcc?.isHold ? "Reserva" : "Agendamento"}
    headerRight={
      <>
        <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-extrabold text-slate-700">
          <CalendarDays size={14} /> Atendimento: {selectedSeries?.title || "Sessão"}
        </span>

        {Number.isFinite(selectedOcc?.sessionIndex) && Number.isFinite(selectedOcc?.plannedTotalSessions) ? (
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-extrabold text-slate-700">
            <Layers size={14} /> Plano: {selectedOcc.sessionIndex}/{selectedOcc.plannedTotalSessions}
          </span>
        ) : null}

        {selectedOcc?.isHold ? (
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-[11px] font-extrabold text-slate-700">
            <Lock size={14} /> Reserva
          </span>
        ) : (editStatus || statusOriginal) === "Cancelado" ? (
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-extrabold text-red-700">
            <XCircle size={14} /> Cancelado
          </span>
        ) : (
          <span className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-extrabold ${statusPillClass(
            editStatus || statusOriginal
          )}`}
          >
            <BadgeCheck size={14} /> {editStatus || statusOriginal}
          </span>
        )}
      </>
    }
    onClose={closeDetails}
    maxWidthClass="max-w-4xl"
    containerClass="h-[92dvh] sm:h-auto"
    bodyClass="p-3 sm:p-4"
    footer={
      selectedOcc?.isBlock === true ? null : (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="secondary" icon={RefreshCcw} onClick={() => setRescheduleOpen(true)} disabled={busy}>
              Reagendar
            </Button>
            <Button
              variant="danger"
              icon={Trash2}
              onClick={() => setDeleteOcc(selectedOcc)}
              disabled={busy}
              title="Excluir"
              aria-label="Excluir"
              className="px-3"
            >
              <span className="sr-only">Excluir</span>
            </Button>
          </div>

          {selectedOcc?.isHold ? (
            <p className="text-[11px] text-slate-500 font-semibold">Reserva</p>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-[11px] text-slate-500 font-semibold">
                {hasAnyDirty ? "Alterações pendentes" : "Nenhuma alteração pendente"}
              </p>
              <Button variant="primary" icon={CheckCircle} onClick={() => void saveAll()} disabled={busy || !hasAnyDirty}>
                Salvar alterações
              </Button>
            </div>
          )}
        </div>
      )
    }
  >
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0">
          <p className="text-base font-extrabold text-slate-900 truncate">
            {fmtDateShortPt(isoDate)} — {String(selectedOcc?.startTime || "").slice(0, 5)}
          </p>
        </div>
      </div>

      <div>
        <p className="text-base font-extrabold text-slate-900">
          {selectedPatient?.fullName || selectedOcc?.leadName || "(sem paciente)"}
        </p>
        {selectedPatient?.notes ? <p className="mt-1 text-xs text-slate-600">{selectedPatient.notes}</p> : null}

{selectedOcc?.patientId ? (
  <div className="mt-3 rounded-2xl border border-slate-100 bg-white p-3">
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] text-slate-400 font-bold">Código de acesso do paciente</p>

        {patientAccessCode?.code ? (
          <div className="mt-1 flex items-center gap-2">
            <span className="text-sm font-extrabold tracking-widest text-slate-900">
              {patientAccessCode.code}
            </span>

            <button
              type="button"
              onClick={handleCopyPatientAccessCode}
              className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700"
              title="Copiar"
            >
              <Copy size={16} />
            </button>

            <span className="text-[11px] text-slate-500">
              expira em {patientAccessCode.ttlMin || 15} min
            </span>
          </div>
        ) : (
          <p className="mt-1 text-xs text-slate-600">Gere um código para o paciente acessar o painel.</p>
        )}

        {patientCodeErr ? <p className="mt-1 text-xs text-rose-600">{patientCodeErr}</p> : null}
      </div>

      <button
        type="button"
        onClick={handleGeneratePatientAccessCode}
        disabled={patientCodeBusy}
        className={`shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border ${
          patientCodeBusy
            ? "bg-slate-100 text-slate-400 border-slate-200"
            : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
        }`}
      >
        {patientCodeBusy ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
        {patientAccessCode?.code ? "Gerar outro" : "Gerar"}
      </button>
    </div>
  </div>
) : null}


      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-2">
        <div className="flex items-center gap-2">
          <p className="text-[11px] text-slate-400 font-bold">Status</p>
          {selectedOcc?.isHold ? (
            <span className="text-[11px] font-semibold text-slate-500">Travado</span>
          ) : (
            <select
              className="h-8 w-[116px] rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold"
              value={editStatus || statusOriginal}
              onChange={(e) => setEditStatus(e.target.value)}
              disabled={busy}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </div>

        {selectedOcc?.isHold ? (
          <p className="mt-2 text-[11px] font-semibold text-slate-500">Reserva: status travado até converter em agendamento.</p>
        ) : null}
      </div>

      {selectedOcc?.isHold && selectedOcc?.isBlock !== true ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-3">
          <p className="text-[11px] text-slate-400 font-bold">Ações da reserva</p>
          <div className="mt-2">
            <Button
              variant="primary"
              icon={Plus}
              onClick={() =>
                setModal({
                  type: "appointment",
                  startTime: String(selectedOcc?.startTime || ""),
                  fromHoldOccurrenceId: selectedOcc?.id,
                  prefillFullName: selectedOcc?.leadName || "",
                  prefillMobile: selectedOcc?.leadMobile || "",
                })
              }
              disabled={busy}
            >
              Agendar a partir desta reserva
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Dica: se a reserva era só para segurar o horário (ex.: 2 sessões) e agora fechou o plano (ex.: 30), escolha 30 sessões na recorrência.
          </p>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-100 bg-white p-3">
        <p className="text-[11px] text-slate-400 font-bold">WhatsApp</p>

        <div className="mt-2 flex flex-col gap-2">
          <div className="flex flex-col sm:flex-row sm:items-end gap-2">
            <div className="flex-1">
              <label className="text-xs text-slate-500 font-semibold">Template</label>
              <select
                className="mt-1 h-9 w-full sm:w-[240px] rounded-xl border border-slate-200 bg-white px-3 text-xs"
                value={effectiveTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={openWhatsapp}
              disabled={!hasWhatsappPhone}
              title={hasWhatsappPhone ? "Abrir conversa no WhatsApp" : "Sem celular cadastrado"}
              aria-label="Abrir WhatsApp"
              className={`mt-1 sm:mt-0 inline-flex h-9 w-10 items-center justify-center rounded-xl px-0 ${
                hasWhatsappPhone
                  ? "bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-200"
                  : "bg-slate-100 text-slate-400 cursor-not-allowed"
              }`}
            >
              <WhatsAppIcon size={20} />
              
            </button>
          </div>

          <div className="mt-1">
            <p className="text-xs text-slate-500 font-semibold">Prévia</p>
            <div className="mt-1 rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700 whitespace-pre-wrap max-h-24 overflow-y-auto">
              {messagePreview || "—"}
            </div>
          </div>

          {!hasWhatsappPhone ? <p className="text-xs text-amber-600 font-semibold">Sem celular cadastrado.</p> : null}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
          <button
            type="button"
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
              clinicalTab === "evolution" ? "bg-violet-600 text-white" : "text-slate-700 hover:bg-slate-50"
            }`}
            onClick={() => setClinicalTab("evolution")}
          >
            Evolução
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
              clinicalTab === "logs" ? "bg-violet-600 text-white" : "text-slate-700 hover:bg-slate-50"
            }`}
            onClick={() => setClinicalTab("logs")}
          >
            Ocorrências (extra)
          </button>
        </div>
        <p className="text-[11px] text-slate-400 font-semibold">Registros clínicos</p>
      </div>

      <div className={clinicalTab === "evolution" ? "" : "hidden"}>
        <SessionEvolutionPanel ref={evolutionRef} externalSave occurrence={selectedOcc} patientId={selectedOcc?.patientId || ""} disabled={busy} onDirtyChange={setIsEvoDirty} />
      </div>
      <div className={clinicalTab === "logs" ? "" : "hidden"}>
        <OccurrenceLogPanel ref={logsRef} externalSave occurrence={selectedOcc} patientId={selectedOcc?.patientId || ""} disabled={busy} onDirtyChange={setIsLogDraftDirty} />
      </div>
    </div>
  </ModalShell>
) : null}


      {nextPick ? (
        <ModalShell
          title={`Próximos horários livres (${defaultDurationBlocks} blocos)`}
          onClose={() => {
            setNextPick(null);
            setErrorMsg("");
          }}
        >
          <div className="flex flex-col gap-3">
            <p className="text-xs text-slate-600">
              Selecione uma opção para abrir o cadastro. (Você está em <span className="font-bold capitalize">{weekdayShort}</span> — {fmtDateShortPt(isoDate)})
            </p>
            <div className="space-y-2">
              {nextPick.slots.map((s, idx) => (
                <button
                  key={`${s.isoDate}_${s.startTime}_${idx}`}
                  onClick={() => pickNextSlot(s)}
                  disabled={busy}
                  className="w-full text-left rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-extrabold text-slate-900 capitalize">{fmtWeekdayShortPt(s.isoDate)} {fmtDateShortPt(s.isoDate)} — {s.startTime}</p>
                      <p className="text-xs text-slate-500">Clique para agendar neste horário</p>
                    </div>
                    <span className="text-xs font-extrabold text-violet-700">Selecionar</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </ModalShell>
      ) : null}

      
      {deleteOcc ? (
        <ModalShell title={`Excluir ${deleteOcc?.isHold ? "reserva" : "agendamento"}?`} onClose={() => setDeleteOcc(null)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-700">
              Isso remove o horário da agenda (libera o slot). O prontuário/histórico do paciente não é apagado.
            </p>

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <Button variant="danger" icon={Trash2} disabled={busy} onClick={() => runDelete(deleteOcc.id, "single")}>
                Excluir só esta ocorrência
              </Button>

              {Boolean(deleteOcc?.seriesId) &&
              Number(deleteOcc?.plannedTotalSessions) > 1 &&
              Number(deleteOcc?.sessionIndex) < Number(deleteOcc?.plannedTotalSessions) ? (
                <Button variant="danger" icon={Trash2} disabled={busy} onClick={() => runDelete(deleteOcc.id, "future")}>
                  Excluir esta e futuras
                </Button>
              ) : null}

              <Button variant="secondary" disabled={busy} onClick={() => setDeleteOcc(null)}>
                Cancelar
              </Button>
            </div>

            {errorMsg ? <p className="text-xs text-red-600">{errorMsg}</p> : null}
          </div>
        </ModalShell>
      ) : null}

{rescheduleOpen && selectedOcc ? (
        <ModalShell
          title="Reagendar"
          onClose={() => {
            setRescheduleOpen(false);
            setErrorMsg("");
          }}
        >
          <ReschedulePanel
            occurrence={selectedOcc}
            slotIntervalMin={slotIntervalMin}
            onCancel={() => {
              setRescheduleOpen(false);
              setErrorMsg("");
            }}
            onDone={async (result) => {
              const nextIso = result?.movedToIsoDate || isoDate;
              const occId = result?.occurrenceId || selectedOcc?.id;
              setRescheduleOpen(false);
              setErrorMsg("");
              pushWith({ date: nextIso });
              await refreshDay(nextIso);
              if (occId) setSelectedOccId(occId);
            }}
          />
        </ModalShell>
      ) : null}

      {modal ? (
        <CreateModal
          modal={modal}
          isoDate={isoDate}
          slotIntervalMin={slotIntervalMin}
          defaultDurationBlocks={defaultDurationBlocks}
          onClose={() => {
            setModal(null);
            setErrorMsg("");
          }}
          onCreated={async ({ selectOccurrenceId } = {}) => {
            await refreshDay(isoDate);
            if (selectOccurrenceId) setSelectedOccId(selectOccurrenceId);
            setModal(null);
          }}
          busy={busy}
          setBusy={setBusy}
          setErrorMsg={setErrorMsg}
        />
      ) : null}
    </div>
  );
}

function CreateModal({ modal, isoDate, slotIntervalMin, defaultDurationBlocks = 2, onClose, onCreated, busy, setBusy, setErrorMsg }) {
  const startTime = modal?.startTime || "00:00";
  const type = modal?.type; // "hold" | "appointment"
  const fromHoldOccurrenceId = modal?.fromHoldOccurrenceId || null;
  const intervalMin = slotIntervalMin || 30;

  const [leadName, setLeadName] = useState("");
  const [leadMobile, setLeadMobile] = useState("");

  const [fullName, setFullName] = useState("");
  const [cpf, setCpf] = useState("");
  const [mobile, setMobile] = useState("");

  const [useRecurrence, setUseRecurrence] = useState(false);
  const [sessionsOption, setSessionsOption] = useState("1"); // "1".."30" | "more"
  const [sessionsCustom, setSessionsCustom] = useState(30);
  const [repeatFrequency, setRepeatFrequency] = useState("weekly"); // daily|weekly|biweekly|monthly

  const [durationBlocks, setDurationBlocks] = useState(() => {
    const mv = parseInt(modal?.durationBlocks, 10);
    if (Number.isFinite(mv) && mv > 0) return Math.max(1, Math.min(8, mv));
    const v = parseInt(defaultDurationBlocks, 10);
    if (Number.isFinite(v) && v > 0) return Math.max(1, Math.min(8, v));
    return 2;
  });

  useEffect(() => {
    if (type === "appointment") {
      setFullName(String(modal?.prefillFullName || ""));
      setMobile(String(modal?.prefillMobile || ""));
      setCpf("");
    } else {
      setLeadName("");
      setLeadMobile("");
      setFullName("");
      setCpf("");
      setMobile("");
    }

    setUseRecurrence(false);
    setSessionsOption("1");
    setSessionsCustom(30);
    setRepeatFrequency("weekly");

    const mv = parseInt(modal?.durationBlocks, 10);
    if (Number.isFinite(mv) && mv > 0) setDurationBlocks(Math.max(1, Math.min(8, mv)));
  }, [type, modal?.prefillFullName, modal?.prefillMobile, modal?.durationBlocks, modal?.startTime]);

  const plannedTotalSessions = useRecurrence
    ? sessionsOption === "more"
      ? Math.max(1, parseInt(String(sessionsCustom || "1"), 10) || 1)
      : Math.max(1, parseInt(String(sessionsOption || "1"), 10) || 1)
    : 1;

  const repeatFrequencyToSend = useRecurrence ? repeatFrequency : null;

  async function submitHold() {
    setBusy(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/professional/hold", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          isoDate,
          startTime,
          leadName,
          leadMobile,
          durationBlocks,
          plannedTotalSessions,
          repeatFrequency: repeatFrequencyToSend,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.message || "Falha ao criar reserva");
      await onCreated?.({});
    } catch (e) {
      setErrorMsg(e?.message || "Erro ao criar reserva");
    } finally {
      setBusy(false);
    }
  }

  async function submitAppointment() {
    setBusy(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/professional/appointment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          isoDate,
          startTime,
          fullName,
          cpf,
          mobile,
          durationBlocks,
          plannedTotalSessions,
          repeatFrequency: repeatFrequencyToSend,
          fromHoldOccurrenceId,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.message || "Falha ao agendar");
      await onCreated?.({ selectOccurrenceId: j?.occurrenceId });
    } catch (e) {
      setErrorMsg(e?.message || "Erro ao agendar");
    } finally {
      setBusy(false);
    }
  }

  if (!type || !isoDate) return null;

  const RecurrenceCard = (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold text-slate-700">Recorrência (opcional)</p>
          <p className="text-[11px] text-slate-500">Defina o total de sessões e a frequência (diária, semanal, quinzenal ou mensal).</p>
        </div>
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
          <input type="checkbox" checked={useRecurrence} onChange={(e) => setUseRecurrence(e.target.checked)} />
          Ativar
        </label>
      </div>

      {useRecurrence ? (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-600">Sessões</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
              value={sessionsOption}
              onChange={(e) => setSessionsOption(e.target.value)}
            >
              {Array.from({ length: 30 }).map((_, i) => {
                const v = String(i + 1).padStart(2, "0");
                return (
                  <option key={v} value={String(i + 1)}>
                    {v}
                  </option>
                );
              })}
              <option value="more">Mais...</option>
            </select>
            {sessionsOption === "more" ? (
              <input
                type="number"
                min={1}
                max={200}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                value={sessionsCustom}
                onChange={(e) => setSessionsCustom(parseInt(e.target.value, 10) || 1)}
                placeholder="Ex.: 30"
              />
            ) : null}
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600">Frequência</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
              value={repeatFrequency}
              onChange={(e) => setRepeatFrequency(e.target.value)}
            >
              <option value="daily">Diário</option>
              <option value="weekly">Semanal</option>
              <option value="biweekly">Quinzenal</option>
              <option value="monthly">Mensal</option>
            </select>
          </div>
        </div>
      ) : null}
    </div>
  );

  const DurationField = (
    <div>
      <label className="text-xs font-bold text-slate-600">Duração (blocos)</label>
      <select
        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
        value={durationBlocks}
        onChange={(e) => setDurationBlocks(parseInt(e.target.value, 10) || 1)}
      >
        {Array.from({ length: 8 }).map((_, i) => {
          const b = i + 1;
          return (
            <option key={b} value={b}>
              {b} bloco{b > 1 ? "s" : ""} ({b * intervalMin} min)
            </option>
          );
        })}
      </select>
      <p className="mt-1 text-[11px] text-slate-400">
        Ocupa {durationBlocks} bloco{durationBlocks > 1 ? "s" : ""} consecutivo{durationBlocks > 1 ? "s" : ""}. O próximo horário precisa estar livre.
      </p>
    </div>
  );

  if (type === "hold") {
    return (
      <ModalShell title={`Criar reserva (hold) — ${fmtDateShortPt(isoDate)} às ${startTime}`} onClose={onClose}>
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-bold text-slate-600">Nome (lead)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
              value={leadName}
              onChange={(e) => setLeadName(e.target.value)}
              placeholder="Ex.: Maria Silva"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600">Celular/WhatsApp</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
              value={leadMobile}
              onChange={(e) => setLeadMobile(e.target.value)}
              placeholder="Ex.: (11) 9xxxx-xxxx"
            />
          </div>

          {RecurrenceCard}
          {DurationField}

          <div className="flex gap-2 pt-1">
            <Button variant="secondary" onClick={onClose} className="flex-1" disabled={busy}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={submitHold} disabled={busy} className="flex-1">
              Criar reserva
            </Button>
          </div>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell title={`Agendar (pré-cadastro rápido) — ${fmtDateShortPt(isoDate)} às ${startTime}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div>
          <label className="text-xs font-bold text-slate-600">Nome completo</label>
          <input
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Ex.: Maria Silva"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-600">CPF</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              placeholder="Somente números"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600">Celular/WhatsApp</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="(11) 9xxxx-xxxx"
            />
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-extrabold text-amber-800">Pré-cadastro</p>
          <p className="text-xs text-amber-800">
            O cadastro completo do paciente é feito depois. Aqui salvamos o mínimo para garantir o horário.
          </p>
        </div>

        {RecurrenceCard}
        {DurationField}

        <div className="flex gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} className="flex-1" disabled={busy}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submitAppointment} disabled={busy || !fullName || !cpf} className="flex-1">
            Agendar
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
