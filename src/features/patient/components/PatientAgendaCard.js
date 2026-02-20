"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button, Card } from "../../../components/DesignSystem";
import { Calendar, CalendarCheck } from "lucide-react";
import AppointmentMiniRow from "./AppointmentMiniRow";
import InlineLoading from "./InlineLoading";
import EmptyState from "./EmptyState";
import InlineError from "./InlineError";
import {
  startOfWeek,
  weekLabelPT,
  monthLabelFromIso,
  toMillis,
  formatDateTimeBR,
} from "../lib/dates";
import { startDateTimeFromAppointment } from "../lib/ics";

export default function PatientAgendaCard({
  appointments = [],
  appointmentsRaw = [],
  loading = false,
  confirmedIds,
  error = null,
  onRetry = null,
}) {
  const [agendaView, setAgendaView] = useState("compact");
  const [showAllWeeks, setShowAllWeeks] = useState(false);
  const [showAllMonths, setShowAllMonths] = useState(false);

  // 📱 mobile: grupos colapsáveis para leitura mais leve
  const [openWeekKey, setOpenWeekKey] = useState(null);
  const [openMonthKey, setOpenMonthKey] = useState(null);

  // ✅ sutil: última atualização da agenda (data/hora apenas)
  const agendaLastUpdate = useMemo(() => {
    let bestMs = null;

    for (const a of appointmentsRaw || []) {
      const ms =
        toMillis(a?.updatedAt) ??
        toMillis(a?.uploadedAt) ??
        toMillis(a?.createdAt) ??
        null;

      if (ms && (!bestMs || ms > bestMs)) {
        bestMs = ms;
      }
    }

    if (!bestMs) return null;

    return { label: formatDateTimeBR(bestMs) };
  }, [appointmentsRaw]);


  const agendaGroups = useMemo(() => {
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const items = (appointments || [])
      .map((a) => {
        const dt = startDateTimeFromAppointment(a);
        const ts = dt ? dt.getTime() : Number.POSITIVE_INFINITY;
        return { a, dt, ts };
      })
      .filter((x) => Number.isFinite(x.ts))
      .sort((x, y) => x.ts - y.ts);

    const upcoming = items.filter((x) => x.ts >= now.getTime());

    const highlights = upcoming.slice(0, 3).map((x) => x.a);

    const weeksMap = new Map();
    const monthsMap = new Map();

    for (const x of upcoming) {
      const dt = x.dt;
      if (!dt) continue;

      if (dt <= in30) {
        const key = startOfWeek(dt).toISOString();
        const label = weekLabelPT(dt);
        if (!weeksMap.has(key)) weeksMap.set(key, { key, label, list: [] });
        weeksMap.get(key).list.push(x.a);
      } else {
        const iso = x.a?.isoDate || x.a?.date || "";
        const m = monthLabelFromIso(iso) || "Outros";
        if (!monthsMap.has(m)) monthsMap.set(m, []);
        monthsMap.get(m).push(x.a);
      }
    }

    const weeks = Array.from(weeksMap.values()).sort((a, b) => a.key.localeCompare(b.key));
    const months = Array.from(monthsMap.entries()).map(([label, list]) => ({ label, list }));

    return { highlights, weeks, months };
  }, [appointments]);

  // abre automaticamente o primeiro grupo no mobile (sem forçar no desktop)
  useEffect(() => {
    if (!openWeekKey && agendaGroups?.weeks?.length) {
      setOpenWeekKey(agendaGroups.weeks[0].key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agendaGroups?.weeks?.length]);

  useEffect(() => {
    if (!openMonthKey && agendaGroups?.months?.length) {
      setOpenMonthKey(agendaGroups.months[0].label);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agendaGroups?.months?.length]);

  return (

    <Card title="Agenda">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="text-xs text-slate-500">Visualização</div>

          {agendaLastUpdate?.label ? (
            <div className="text-[11px] text-slate-400 mt-1 leading-snug">
              Agenda atualizada em <b className="text-slate-600">{agendaLastUpdate.label}</b>
            </div>
          ) : null}
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => {
              setAgendaView("compact");
              setShowAllWeeks(false);
              setShowAllMonths(false);
            }}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-full text-xs font-semibold border ${
              agendaView === "compact"
                ? "bg-violet-50 border-violet-100 text-violet-900"
                : "bg-white border-slate-200 text-slate-700"
            }`}
          >
            Compacta
          </button>
          <button
            type="button"
            onClick={() => {
              setAgendaView("all");
              setShowAllWeeks(true);
              setShowAllMonths(true);
            }}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-full text-xs font-semibold border ${
              agendaView === "all"
                ? "bg-violet-50 border-violet-100 text-violet-900"
                : "bg-white border-slate-200 text-slate-700"
            }`}
          >
            Completa
          </button>
        </div>
      </div>

      {error ? (


        <InlineError
          title="Não foi possível carregar sua agenda"
          description={typeof error === "string" ? error : "Tente novamente em instantes."}
          actionLabel={typeof onRetry === "function" ? "Recarregar" : ""}
          onAction={onRetry}
        />
      ) : loading ? (
        <div className="py-2">
          <InlineLoading label="Carregando agenda…" />
        </div>
      ) : (appointments || []).length === 0 ? (
        <EmptyState
          title="Nenhum agendamento encontrado"
          description="Assim que sua agenda estiver disponível, ela aparecerá aqui. Seu horário é um espaço sagrado de cuidado."
          Icon={Calendar}
        />
      ) : (
        <div className="space-y-5">
          {agendaGroups.highlights.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <Calendar size={14} className="text-slate-400" />
                Próximos atendimentos
              </div>
              {agendaGroups.highlights.map((a) => (
                <AppointmentMiniRow key={a.id} a={a} isConfirmed={confirmedIds?.has?.(String(a.id))} />
              ))}
            </div>
          )}

          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Próximas semanas</div>

            {(showAllWeeks ? agendaGroups.weeks : agendaGroups.weeks.slice(0, 3)).map((w) => {
              const limit = agendaView === "compact" ? 5 : 999;
              const shown = w.list.slice(0, limit);
              const hiddenCount = Math.max(0, w.list.length - shown.length);
              const isOpen = openWeekKey === w.key;

              return (
                <div key={w.key} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-2.5 space-y-2">
                  <button
                    type="button"
                    onClick={() => setOpenWeekKey((prev) => (prev === w.key ? null : w.key))}
                    className="w-full flex items-center justify-between gap-3 px-2 py-1.5 rounded-xl hover:bg-white/70 active:scale-[0.99]"
                    aria-expanded={isOpen}
                  >
                    <div className="text-xs font-semibold text-slate-700 text-left">{w.label}</div>
                    <div className="text-[11px] font-semibold text-slate-400 shrink-0">
                      {w.list.length} {w.list.length === 1 ? "sessão" : "sessões"}
                    </div>
                  </button>

                  <div className={`${isOpen ? "block" : "hidden"} sm:block space-y-2 px-2 pb-1`}>
                    {shown.map((a) => (
                      <AppointmentMiniRow key={a.id} a={a} isConfirmed={confirmedIds?.has?.(String(a.id))} />
                    ))}
                    {agendaView === "compact" && hiddenCount > 0 && (
                      <div className="text-xs text-slate-400">+ {hiddenCount} atendimentos nesta semana</div>
                    )}
                  </div>
                </div>
              );
            })}

            {agendaGroups.weeks.length > 3 && (
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => setShowAllWeeks((v) => !v)}
                icon={CalendarCheck}
              >
                {showAllWeeks ? "Mostrar menos semanas" : "Mostrar mais semanas"}
              </Button>
            )}
          </div>

          {agendaGroups.months.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Próximos meses</div>

              {(showAllMonths ? agendaGroups.months : agendaGroups.months.slice(0, 2)).map((m) => {
                const limit = agendaView === "compact" ? 4 : 999;
                const shown = m.list.slice(0, limit);
                const hiddenCount = Math.max(0, m.list.length - shown.length);
                const isOpen = openMonthKey === m.label;

                return (
                  <div key={m.label} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-2.5 space-y-2">
                    <button
                      type="button"
                      onClick={() => setOpenMonthKey((prev) => (prev === m.label ? null : m.label))}
                      className="w-full flex items-center justify-between gap-3 px-2 py-1.5 rounded-xl hover:bg-white/70 active:scale-[0.99]"
                      aria-expanded={isOpen}
                    >
                      <div className="text-xs font-semibold text-slate-700 text-left">{m.label}</div>
                      <div className="text-[11px] font-semibold text-slate-400 shrink-0">
                        {m.list.length} {m.list.length === 1 ? "sessão" : "sessões"}
                      </div>
                    </button>

                    <div className={`${isOpen ? "block" : "hidden"} sm:block space-y-2 px-2 pb-1`}>
                      {shown.map((a) => (
                        <AppointmentMiniRow key={a.id} a={a} isConfirmed={confirmedIds?.has?.(String(a.id))} />
                      ))}
                      {agendaView === "compact" && hiddenCount > 0 && (
                        <div className="text-xs text-slate-400">+ {hiddenCount} atendimentos neste mês</div>
                      )}
                    </div>
                  </div>
                );
              })}

              {agendaGroups.months.length > 2 && (
                <Button variant="secondary" className="w-full" onClick={() => setShowAllMonths((v) => !v)}>
                  {showAllMonths ? "Mostrar menos meses" : "Mostrar mais meses"}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

    </Card>
  );
}
