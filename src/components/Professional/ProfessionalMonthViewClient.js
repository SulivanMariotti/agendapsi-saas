"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/DesignSystem";

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

function ModalShell({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/30 p-3" onMouseDown={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <p className="text-sm font-semibold text-slate-900 truncate">{title}</p>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50"
            onClick={onClose}
          >
            Fechar
          </button>
        </div>
        <div className="p-5">{children}</div>
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

export default function ProfessionalMonthViewClient({ initialData }) {
  const router = useRouter();

  const [data, setData] = useState(initialData);
  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  const [detail, setDetail] = useState(null); // { isoDate, occId }
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

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

  const currentTitle = useMemo(() => {
    if (!currentOcc) return "";
    const p = currentOcc?.patientId ? patientsById?.[currentOcc.patientId] : null;
    return p?.fullName || currentOcc?.leadName || "(sem nome)";
  }, [currentOcc, patientsById]);

  const [status, setStatus] = useState("Agendado");
  useEffect(() => {
    setStatus(currentOcc?.status || "Agendado");
  }, [currentOcc?.status]);

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

  async function saveStatus(occurrenceId, nextStatus) {
    if (!occurrenceId || !nextStatus) return;
    setBusy(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/professional/occurrence/status", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ occurrenceId, status: nextStatus }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.message || "Falha ao salvar status");
      setDetail(null);
      router.refresh();
    } catch (e) {
      setErrorMsg(e?.message || "Erro ao salvar status");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-3 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white">
            <CalendarDays className="h-5 w-5 text-slate-700" />
          </div>
          <div>
            <p className="text-xs text-slate-900 capitalize">Mês</p>
            <p className="text-xs text-slate-600 capitalize">{monthLabel}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1">
            <button className="rounded-xl px-3 py-2 text-xs text-slate-900 bg-slate-100" type="button" onClick={() => {}}>
              Mês
            </button>
            <button
              className="rounded-xl px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
              type="button"
              onClick={() => goWeek(monthAnchorIso || todayIso)}
            >
              Semana
            </button>
            <button
              className="rounded-xl px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
              type="button"
              onClick={() => goDay(monthAnchorIso || todayIso)}
            >
              Dia
            </button>
          </div>

          <Button variant="secondary" icon={ChevronLeft} onClick={() => goMonth(-1)} />
          <Button variant="secondary" onClick={goToday}>
            Hoje
          </Button>
          <Button variant="secondary" icon={ChevronRight} onClick={() => goMonth(1)} />
        </div>
      </div>

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
                        return (
                          <button
                            key={o.id}
                            type="button"
                            className="w-full rounded-lg px-2 py-1 text-left hover:bg-white/80"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetail({ isoDate: iso, occId: o.id });
                            }}
                            title="Abrir detalhes"
                          >
                            <div className="flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full ${statusDotClass(o?.status)}`} />
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
          title={`${currentOcc?.isHold ? "Reserva" : "Agendamento"} — ${fmtDateShortPt(detail.isoDate)} ${String(
            currentOcc?.startTime || ""
          ).slice(0, 5)}`}
          onClose={() => setDetail(null)}
        >
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-xs text-slate-400 font-semibold">Paciente/Lead</p>
              <p className="text-sm font-semibold text-slate-900 truncate">{currentTitle}</p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs text-slate-500 font-semibold">Status</p>
              <div className="mt-2 flex items-center gap-2">
                <select
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
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
                <Button variant="primary" disabled={busy} onClick={() => saveStatus(currentOcc.id, status)}>
                  Salvar
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setDetail(null);
                  goDay(detail.isoDate);
                }}
              >
                Abrir no Dia
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl bg-slate-900 px-4 py-3 text-xs font-semibold text-white hover:bg-slate-800"
                onClick={() => setDetail(null)}
              >
                Fechar
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}
