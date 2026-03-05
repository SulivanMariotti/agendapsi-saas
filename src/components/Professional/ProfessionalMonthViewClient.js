"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  useRouter } from "next/navigation";
import { BadgeCheck,
  CalendarDays,
  Layers,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  XCircle,
  Lock,
  Trash2,
  X,
  KeyRound,
  Copy,
Settings,
  Loader2,} from "lucide-react";

import { Button } from "@/components/DesignSystem";
import WhatsAppIcon from "@/components/Icons/WhatsAppIcon";
import ProfessionalAgendaHeader from "@/components/Professional/ProfessionalAgendaHeader";
import SessionEvolutionPanel from "./SessionEvolutionPanel";
import OccurrenceLogPanel from "./OccurrenceLogPanel";


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


function toDateFromIso(iso) {
  const d = new Date(`${iso}T12:00:00.000Z`);
  return Number.isFinite(d.getTime()) ? d : new Date();
}

function addDaysIso(iso, deltaDays) {
  const d = toDateFromIso(iso);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function addMonthsIso(iso, deltaMonths) {
  const d = toDateFromIso(iso);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const next = new Date(Date.UTC(y, m + deltaMonths, 1, 12, 0, 0));
  return next.toISOString().slice(0, 10);
}

function fmtMonthPt(iso) {
  const d = toDateFromIso(iso);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(d);
}

function fmtIsoDayNumber(iso) {
  const d = toDateFromIso(iso);
  return String(d.getUTCDate());
}

function todayIsoSP() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return y && m && d ? `${y}-${m}-${d}` : new Date().toISOString().slice(0, 10);
}

const STATUSES = ["Agendado", "Confirmado", "Finalizado", "Não comparece", "Cancelado", "Reagendado"];

function statusDotClass(status) {
  switch (status) {
    case "Agendado":
      return "bg-violet-500";
    case "Confirmado":
      return "bg-emerald-500";
    case "Finalizado":
      return "bg-slate-500";
    case "Não comparece":
      return "bg-amber-500";
    case "Cancelado":
      return "bg-red-500";
    case "Reagendado":
      return "bg-blue-500";
    default:
      return "bg-slate-400";
  }
}

function statusItemBgClass({ status, isHold, inMonth }) {
  // Month view: color the whole chip background based on status.
  // Holds should be visually "muted" (gray ~50%).
  if (isHold) return `${inMonth ? "" : "opacity-70 "}bg-slate-100/60 border border-slate-200 text-slate-700`;
  const base =
    status === "Agendado"
      ? "bg-violet-100/80 border border-violet-200 text-violet-900"
      : status === "Confirmado"
      ? "bg-emerald-100/80 border border-emerald-200 text-emerald-900"
      : status === "Finalizado"
      ? "bg-slate-100/80 border border-slate-200 text-slate-700"
      : status === "Não comparece"
      ? "bg-amber-100/80 border border-amber-200 text-amber-900"
      : status === "Cancelado"
      ? "bg-red-100/80 border border-red-200 text-red-900"
      : status === "Reagendado"
      ? "bg-blue-100/80 border border-blue-200 text-blue-900"
      : "bg-slate-50 border border-slate-200 text-slate-800";
  return `${inMonth ? "" : "opacity-70 "}${base}`;
}


function ModalShell({ title, children, onClose, footer = null, maxWidthClass = "max-w-md", bodyClass = "p-5" }) {
  return (
    <div
      className="fixed inset-0 z-[999] flex items-end sm:items-center justify-center bg-black/30 p-3"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className={`w-full ${maxWidthClass} max-h-[92dvh] rounded-2xl border border-slate-200 bg-white shadow-xl flex flex-col overflow-hidden`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <p className="text-sm font-semibold text-slate-900 truncate">{title}</p>
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
            onClick={onClose}
            aria-label="Fechar"
            title="Fechar"
          >
            <X size={16} />
          </button>
        </div>
        <div className={`${bodyClass} overflow-y-auto min-h-0`}>{children}</div>
        {footer ? (
          <div className="border-t border-slate-100 px-5 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function timeToMinutes(t) {
  const [h, m] = String(t || "0:0")
    .split(":")
    .map((x) => parseInt(x, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
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

export default function ProfessionalMonthViewClient({initialData, canTenantAdmin = false}) {
  const router = useRouter();


  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    } finally {
      window.location.href = "/login";
    }
  }

  const [data, setData] = useState(initialData);
  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  const [detail, setDetail] = useState(null); // { isoDate, occId }
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [deleteOcc, setDeleteOcc] = useState(null); // occurrence object for delete confirmation

  useEffect(() => {
    if (detail?.occId) setSelectedTemplateId("");
  }, [detail?.occId]);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const evolutionRef = useRef(null);
  const logsRef = useRef(null);
  const [isEvoDirty, setIsEvoDirty] = useState(false);
  const [isLogDraftDirty, setIsLogDraftDirty] = useState(false);
const [clinicalTab, setClinicalTab] = useState("evolution"); // "evolution" | "logs"

useEffect(() => {
  if (detail?.occId) {
    setClinicalTab("evolution");
    setIsEvoDirty(false);
    setIsLogDraftDirty(false);
  }
}, [detail?.occId]);


  const monthAnchorIso = data?.monthAnchorIso || data?.isoDate;
  const monthLabel = useMemo(() => (monthAnchorIso ? fmtMonthPt(monthAnchorIso) : ""), [monthAnchorIso]);
  const todayIso = useMemo(() => todayIsoSP(), []);

  const days = Array.isArray(data?.days) ? data.days : [];
  const patientsById = data?.patientsById || {};

  const weeks = useMemo(() => {
    const out = [];
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
    return out;
  }, [days]);

  const patientSearchItems = useMemo(() => {
    const items = [];
    for (const week of Array.isArray(weeks) ? weeks : []) {
      for (const day of Array.isArray(week) ? week : []) {
        const iso = day?.isoDate;
        const occs = Array.isArray(day?.occurrences) ? day.occurrences : [];
        for (const o of occs) {
          if (!o?.id || o?.isBlock) continue;
          const pid = o?.patientId;
          const label = pid ? String(patientsById?.[pid]?.fullName || "") : String(o?.leadName || "");
          if (!label) continue;
          items.push({ key: String(o.id), label, isoDate: iso });
        }
      }
    }
    const seen = new Set();
    const out = [];
    for (const it of items) {
      const k = it.label.trim().toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(it);
    }
    out.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    return out;
  }, [weeks, patientsById]);

  const patientSearchResults = useMemo(() => {
    const q = patientSearch.trim().toLowerCase();
    if (q.length < 2) return [];
    return patientSearchItems.filter((it) => it.label.toLowerCase().includes(q)).slice(0, 8);
  }, [patientSearch, patientSearchItems]);

  
  function matchesStatusFilter(o, filter) {
    if (!o) return true;
    const f = String(filter || "all");
    if (f === "all") return true;
    if (f === "holds") return Boolean(o.isHold);
    if (Boolean(o.isHold)) return false;
    const st = o.status || "Agendado";
    if (f === "confirmed") return st === "Confirmado";
    if (f === "scheduled") return st !== "Confirmado";
    return true;
  }

const monthStats = useMemo(() => {
    let scheduled = 0;
    let confirmed = 0;
    let holds = 0;
    for (const week of Array.isArray(weeks) ? weeks : []) {
      for (const day of Array.isArray(week) ? week : []) {
        const occs = Array.isArray(day?.occurrences) ? day.occurrences : [];
        for (const o of occs) {
          if (!o || o.isBlock) continue;
          if (o.isHold) {
            holds += 1;
            continue;
          }
          const st = o.status || "Agendado";
          if (st === "Confirmado") confirmed += 1;
          else scheduled += 1;
        }
      }
    }
    return { scheduled, confirmed, holds };
  }, [weeks]);


  const occIndex = useMemo(() => {
    const idx = new Map();
    for (const day of days) {
      const iso = day?.isoDate;
      const occs = Array.isArray(day?.occurrences) ? day.occurrences : [];
      for (const o of occs) idx.set(`${iso}#${o.id}`, o);
    }
    return idx;
  }, [days]);

  const currentOcc = useMemo(() => {
    if (!detail?.isoDate || !detail?.occId) return null;
    return occIndex.get(`${detail.isoDate}#${detail.occId}`) || null;
  }, [detail, occIndex]);

  const currentPatient = useMemo(() => {
    const pid = currentOcc?.patientId;
    return pid ? patientsById?.[pid] || null : null;
  }, [currentOcc?.patientId, patientsById]);

  const currentTitle = useMemo(() => {
    if (!currentOcc) return "";
    return currentPatient?.fullName || currentOcc?.leadName || "(sem nome)";
  }, [currentOcc, currentPatient?.fullName]);

  const [status, setStatus] = useState("Agendado");
  useEffect(() => {
    setStatus(currentOcc?.status || "Agendado");
  }, [currentOcc?.status]);

// Paciente (MVP): gerar código de acesso (one-time) para o portal /paciente
const [patientAccessCode, setPatientAccessCode] = useState(null); // { code, expiresAt, ttlMin }
const [patientCodeBusy, setPatientCodeBusy] = useState(false);
const [patientCodeErr, setPatientCodeErr] = useState("");

useEffect(() => {
  setPatientAccessCode(null);
  setPatientCodeErr("");
}, [detail?.occId]);

const handleGeneratePatientAccessCode = async () => {
  const pid = currentOcc?.patientId;
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


  const statusOriginal = currentOcc?.status || "Agendado";
  const isStatusDirty = Boolean(detail) && Boolean(currentOcc) && !currentOcc?.isHold && status !== statusOriginal;
  const hasAnyDirty = Boolean(isStatusDirty || isEvoDirty || isLogDraftDirty);

  function requestCloseDetail() {
    if (hasAnyDirty) {
      const ok = window.confirm("Você tem alterações não salvas neste agendamento. Deseja descartar e fechar?");
      if (!ok) return;
    }
    setDetail(null);
    setSelectedTemplateId("");
    setErrorMsg("");
  }

  const detailDisplayName = currentPatient?.fullName || currentOcc?.leadName || "";
  const detailPhone = currentPatient?.mobile || currentOcc?.leadMobile || "";
  const detailStartTime = String(currentOcc?.startTime || "").slice(0, 5);

  const detailSessionIndex = Number(currentOcc?.sessionIndex);
  const detailPlannedTotal = Number(currentOcc?.plannedTotalSessions);
  const detailProgress =
    Number.isFinite(detailSessionIndex) && Number.isFinite(detailPlannedTotal) && detailPlannedTotal > 0 ? `${detailSessionIndex}/${detailPlannedTotal}` : null;

  const templates = data?.whatsappTemplates || [];
  const effectiveTemplateId = selectedTemplateId || templates?.[0]?.id || "";
  const effectiveTemplate = templates.find((t) => t.id === effectiveTemplateId) || templates?.[0] || null;

  const detailWhatsappMsg = (() => {
    const nome = detailDisplayName || "tudo bem?";
    const dataStr = fmtDateShortPt(detail?.isoDate);
    const hora = detailStartTime || "";
    if (effectiveTemplate?.body) return applyTemplate(effectiveTemplate.body, { nome, data: dataStr, hora });
    return detail?.isHold
      ? `Olá, ${nome}! Segurei um horário em ${dataStr} às ${hora}.`
      : detailDisplayName
        ? `Olá, ${nome}! Confirmando sua sessão em ${dataStr} às ${hora}. Conto com sua presença.`
        : `Confirmando sua sessão em ${dataStr} às ${hora}. Conto com sua presença.`;
  })();
  const detailWhatsappUrl = buildWhatsappUrl(detailPhone, detailWhatsappMsg);

  function openDetailWhatsapp() {
    if (!detailWhatsappUrl) return;
    window.open(detailWhatsappUrl, "_blank", "noopener,noreferrer");
  }

  function goMonth(delta) {
    const next = addMonthsIso(monthAnchorIso || todayIso, delta);
    router.push(`/profissional?view=month&date=${encodeURIComponent(next)}`);
    router.refresh();
  }

  function goToday() {
    router.push(`/profissional?view=month&date=${encodeURIComponent(todayIso)}`);
    router.refresh();
  }

  function goDay(iso) {
    router.push(`/profissional?date=${encodeURIComponent(iso)}`);
  }

  function goWeek(iso) {
    router.push(`/profissional?view=week&date=${encodeURIComponent(iso)}`);
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
    setDetail(null);
    router.refresh();
  } catch (e) {
    setErrorMsg(e?.message || "Erro ao excluir");
  } finally {
    setBusy(false);
  }
}

async function patchStatus(occurrenceId, nextStatus) {
    if (!occurrenceId || !nextStatus) return false;
    try {
      const res = await fetch("/api/professional/occurrence/status", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ occurrenceId, status: nextStatus }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.message || "Falha ao salvar status");
      return true;
    } catch (e) {
      setErrorMsg(e?.message || "Erro ao salvar status");
      return false;
    }
  }

  async function saveAll() {
    if (!currentOcc?.id || currentOcc?.isHold) return;
    setBusy(true);
    setErrorMsg("");
    try {
      const evoOk = await evolutionRef.current?.saveIfDirty?.();
      if (evoOk === false) throw new Error("Falha ao salvar evolução.");

      const logOk = await logsRef.current?.saveDraft?.();
      if (logOk === false) throw new Error("Falha ao registrar ocorrência.");

      if (isStatusDirty) {
        const ok = await patchStatus(currentOcc.id, status);
        if (!ok) throw new Error("Falha ao salvar status.");
        router.refresh();
      }
    } catch (e) {
      setErrorMsg(e?.message || "Erro ao salvar alterações");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-6 pb-6 pt-0 text-sm">
      <ProfessionalAgendaHeader
        view="month"
        periodLabel={monthLabel}
        isoDate={monthAnchorIso || todayIso}
        tenantId={data?.tenantId || ""}
        onChangeView={(v) => {
          if (v === "month") return;
          if (v === "day") return goDay(monthAnchorIso || todayIso);
          if (v === "week") return goWeek(monthAnchorIso || todayIso);
        }}
        onPrev={() => goMonth(-1)}
        onNext={() => goMonth(1)}
        onToday={goToday}
        onGoToDate={(d) => router.push(`/profissional?view=month&date=${encodeURIComponent(String(d || monthAnchorIso || todayIso))}`)}
        onLogout={logout}
        searchValue={patientSearch}
        onSearchChange={setPatientSearch}
        searchResults={patientSearchResults}
        onSelectSearchItem={(it) => {
          if (it?.isoDate) goDay(it.isoDate);
          setPatientSearch("");
        }}
        stats={monthStats}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
      />


      {errorMsg ? (
        <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-800">
          {errorMsg}
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <div className="min-w-[980px]">
          <div className="grid grid-cols-7 border-b border-slate-100">
            {[
              "Seg",
              "Ter",
              "Qua",
              "Qui",
              "Sex",
              "Sáb",
              "Dom",
            ].map((h) => (
              <div key={h} className="px-3 py-2 text-[11px] font-semibold text-slate-600">
                {h}
              </div>
            ))}
          </div>

          {weeks.map((w, wi) => (
            <div key={wi} className="grid grid-cols-7 border-b border-slate-100 last:border-b-0">
              {w.map((day) => {
                const iso = day?.isoDate;
                const inMonth = day?.inMonth !== false;
                const isToday = iso === todayIso;
                const occs = Array.isArray(day?.occurrences) ? day.occurrences : [];
                const occList = occs
                  .filter((o) => o && o.isBlock !== true)
                  .slice()
                  .sort((a, b) => timeToMinutes(a?.startTime) - timeToMinutes(b?.startTime));

                return (
                  <div
                    key={iso}
                    className={`min-h-[120px] border-r border-slate-100 last:border-r-0 p-2 cursor-pointer hover:bg-slate-50 transition ${
                      inMonth ? "bg-white" : "bg-slate-50"
                    }`}
                    onClick={() => goDay(iso)}
                    title="Abrir dia"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[11px] ${inMonth ? "text-slate-700" : "text-slate-400"} ${
                          isToday ? "font-semibold text-violet-700" : ""
                        }`}
                      >
                        {fmtIsoDayNumber(iso)}
                      </span>
                      {isToday ? <span className="text-[10px] text-violet-600">Hoje</span> : null}
                    </div>

                    <div className="mt-1 flex flex-col gap-1">
                      {occList.slice(0, 4).map((o) => {
                        const p = o?.patientId ? patientsById?.[o.patientId] : null;
                        const title = p?.fullName || o?.leadName || (o?.isHold ? "Reserva" : "(sem nome)");
                        const line = `${String(o?.startTime || "").slice(0, 5)} · ${title}`;
                        const matchesFilter = matchesStatusFilter({ status: o?.status, isHold: o?.isHold }, statusFilter);
                        const keepStrong = detail?.occId === o.id && detail?.isoDate === iso;
                        const dimOcc = statusFilter !== "all" && !matchesFilter && !keepStrong;
                        return (
                          <button
                            key={o.id}
                            type="button"
                            className={`w-full rounded-lg px-2 py-1 text-left ${statusItemBgClass({ status: o?.status, isHold: o?.isHold, inMonth })} hover:brightness-[0.99] ${dimOcc ? "opacity-25" : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetail({ isoDate: iso, occId: o.id });
                            }}
                            title="Abrir detalhes"
                          >
                            <div className="flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full ${o?.isHold ? "bg-slate-400" : statusDotClass(o?.status)}`} />
                              <span className={`truncate text-[11px] ${inMonth ? "text-slate-700" : "text-slate-400"}`}>
                                {line}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                      {occList.length > 4 ? (
                        <div className="px-2 text-[10px] text-slate-400">+{occList.length - 4} itens</div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {detail && currentOcc ? (
        <ModalShell
          title={currentOcc?.isHold ? "Reserva" : "Agendamento"}
          onClose={requestCloseDetail}
          footer={
            currentOcc?.isBlock === true ? null : (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Button
                    variant="danger"
                    icon={Trash2}
                    disabled={busy}
                    onClick={() => {
                      setDetail(null);
                      setDeleteOcc(currentOcc);
                    }}
                    title="Excluir"
                    aria-label="Excluir"
                    className="px-3"
                  >
                    <span className="sr-only">Excluir</span>
                  </Button>

                  <button
                    type="button"
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    onClick={() => {
                      setDetail(null);
                      goDay(detail.isoDate);
                    }}
                    disabled={busy}
                  >
                    Abrir no Dia
                  </button>
                </div>

                {currentOcc?.isHold ? (
                  <p className="text-[11px] text-slate-500 font-semibold">Reserva</p>
                ) : (
                  <div className="flex items-center gap-3">
                    <p className="text-[11px] text-slate-500 font-semibold">
                      {hasAnyDirty ? "Alterações pendentes" : "Nenhuma alteração pendente"}
                    </p>
                    <Button variant="primary" icon={CheckCircle} disabled={busy || !hasAnyDirty} onClick={() => void saveAll()}>
                      Salvar alterações
                    </Button>
                  </div>
                )}
              </div>
            )
          }
          maxWidthClass="max-w-4xl"
        >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex-1 min-w-0 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-base font-extrabold text-slate-900 truncate">
                  {fmtDateShortPt(detail.isoDate)} — {String(currentOcc?.startTime || "").slice(0, 5)}
                </p>
                <p className="mt-0.5 text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                  {currentOcc?.isHold ? "Reserva" : "Agendamento"}
                </p>
              </div>
            </div>

            <div className="flex items-start justify-between gap-2">
              <p className="text-xs uppercase tracking-wider text-slate-400 font-bold">Paciente</p>
              <div className="flex flex-wrap items-center justify-end gap-1">
                {detailProgress ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-extrabold text-slate-700">
                    Plano: {detailProgress}
                  </span>
                ) : null}

                {currentOcc?.isHold ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-[11px] font-extrabold text-slate-700">
                    <Lock size={14} /> Reserva
                  </span>
                ) : (
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-extrabold ${statusPillClass(status)}`}>
                    <BadgeCheck size={14} /> {status}
                  </span>
                )}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-900 truncate">{currentTitle}</p>

{currentOcc?.patientId ? (
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
              <p className="text-xs text-slate-500 font-semibold">Status</p>
              {currentOcc?.isHold ? (
                <div className="mt-2">
                  <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border bg-slate-100 text-slate-700 border-slate-200 text-xs font-extrabold">
                    Reserva
                  </span>
                  <p className="mt-2 text-[11px] font-semibold text-slate-500">Reserva: status travado até converter em agendamento.</p>
                </div>
              ) : (
                <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-2">
                  <select
                    className="h-8 w-[132px] rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    disabled={busy}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              )}
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
  <SessionEvolutionPanel ref={evolutionRef} externalSave occurrence={currentOcc} patientId={currentOcc?.patientId || ""} disabled={busy} onDirtyChange={setIsEvoDirty} />
</div>
<div className={clinicalTab === "logs" ? "" : "hidden"}>
  <OccurrenceLogPanel ref={logsRef} externalSave occurrence={currentOcc} patientId={currentOcc?.patientId || ""} disabled={busy} onDirtyChange={setIsLogDraftDirty} />
</div>
</div>

            <div className="w-full sm:w-80 shrink-0">
              <div className="rounded-2xl border border-slate-100 bg-white p-2">
                <p className="text-xs text-slate-500 font-semibold">Resumo do paciente</p>
                <p className="mt-1 text-sm font-extrabold text-slate-900 truncate">{detailDisplayName || "(sem paciente)"}</p>

                {detailProgress ? (
                  <div className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <p className="text-[11px] font-semibold text-slate-500">Plano</p>
                    <p className="text-xs font-extrabold text-slate-800">{detailProgress}</p>
                  </div>
                ) : null}
      {deleteOcc ? (
        <ModalShell title={`Excluir ${deleteOcc?.isHold ? "reserva" : "agendamento"}?`} onClose={() => setDeleteOcc(null)} maxWidthClass="max-w-md">
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



                <div className="mt-3">
                  <p className="text-[11px] font-semibold text-slate-500">WhatsApp</p>
                  <p className="text-xs font-semibold text-slate-800 break-all">{detailPhone || "—"}</p>
                  
                  <div className="mt-2">
                    <label className="text-xs text-slate-500 font-semibold">Template</label>
                    <select
                      className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs"
                      value={effectiveTemplateId}
                      onChange={(e) => setSelectedTemplateId(e.target.value)}
                      disabled={!templates.length}
                    >
                      {templates.length ? (
                        templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title}
                          </option>
                        ))
                      ) : (
                        <option value="">Nenhum template</option>
                      )}
                    </select>
                  </div>

                  <div className="mt-2">
                    <p className="text-xs text-slate-500 font-semibold">Prévia</p>
                    <div className="mt-1 rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700 whitespace-pre-wrap max-h-24 overflow-y-auto">
                      {detailWhatsappMsg || "—"}
                    </div>
                  </div>
<div className="mt-2">
                    <Button variant="primary" icon={WhatsAppIcon} onClick={openDetailWhatsapp} disabled={!detailWhatsappUrl} className="w-full">
                      Abrir WhatsApp
                    </Button>
                  </div>
                </div>

                {currentPatient?.notes ? (
                  <div className="mt-3">
                    <p className="text-[11px] font-semibold text-slate-500">Observações</p>
                    <p className="mt-1 text-xs text-slate-700 whitespace-pre-line">{currentPatient.notes}</p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}