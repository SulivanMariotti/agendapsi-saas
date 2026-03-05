"use client";

import React, { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Search, Clock, ChevronsDown } from "lucide-react";
import { Button } from "@/components/DesignSystem";

/**
 * Header padrão da Agenda do Profissional (Dia/Semana/Mês)
 * - sticky + 2 linhas
 * - toggle Dia/Semana/Mês
 * - busca de paciente (na visão atual)
 * - resumo rápido (Confirmados/Agendados/Holds)
 */
export default function ProfessionalAgendaHeader({
  view, // "day" | "week" | "month"
  periodLabel,
  isoDate, // "YYYY-MM-DD"
  onGoToDate,

  tenantId,
  onChangeView,
  onPrev,
  onNext,
  onToday,
  showNow,
  onNow,
  showNextAppt,
  onNextAppt,
  onLogout,
  searchValue,
  onSearchChange,
  searchResults,
  onSelectSearchItem,
  stats,
  statusFilter,
  onStatusFilterChange,
  rightActions,
}) {
  const viewLabel = view === "day" ? "Dia" : view === "week" ? "Semana" : "Mês";
  const effectiveStatusFilter = String(statusFilter || "all");

  const [dateOpen, setDateOpen] = useState(false);
  const [dateDraft, setDateDraft] = useState(String(isoDate || ""));
  const [searchFocused, setSearchFocused] = useState(false);
  const [compact, setCompact] = useState(false);
  const popoverRef = useRef(null);

  // Keep draft in sync when the view date changes.
  useEffect(() => {
    setDateDraft(String(isoDate || ""));
  }, [isoDate]);

  const keepExpanded = dateOpen || searchFocused || Boolean((searchValue || "").trim());

  useEffect(() => {
    function onScroll() {
      const y = typeof window !== "undefined" ? window.scrollY || 0 : 0;
      if (keepExpanded) return setCompact(false);
      setCompact(y > 80);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [keepExpanded]);

  useEffect(() => {
    function onDocClick(e) {
      if (!dateOpen) return;
      if (!popoverRef.current) return;
      const el = popoverRef.current;
      if (el.contains(e.target)) return;
      setDateOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [dateOpen]);

  const canGo = /^\d{4}-\d{2}-\d{2}$/.test(String(dateDraft || ""));

  return (
    <div className={`sticky top-0 z-40 -mx-3 sm:-mx-6 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70 border-b border-slate-200 shadow-sm px-3 sm:px-6 transition-all duration-200 ${compact ? "py-2" : "py-3"}`}>
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setDateOpen((v) => !v)}
              className="flex items-start gap-3 min-w-0 text-left"
              title="Ir para uma data"
            >

            <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-3">
              <CalendarDays className="text-violet-700" size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 capitalize">{viewLabel}</p>
              <p className="text-sm sm:text-base font-extrabold tracking-tight text-slate-900 capitalize truncate">
                {periodLabel || "—"}
              </p>
              {tenantId ? (
                <p className="text-[11px] text-slate-400 truncate">
                  Tenant: <span className="font-mono">{tenantId}</span>
                </p>
              ) : null}
            </div>
          </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Button variant="secondary" icon={ChevronLeft} onClick={onPrev} title="Anterior" />
            <Button variant="secondary" onClick={onToday}>Hoje</Button>
            {showNextAppt ? (
              <Button variant="secondary" icon={ChevronsDown} onClick={onNextAppt} title="Próximo atendimento" />
            ) : null}
            {showNow ? (
              <Button variant="secondary" icon={Clock} onClick={onNow} title="Ir para agora" />
            ) : null}
            <Button variant="secondary" icon={ChevronRight} onClick={onNext} title="Próximo" />
            <Button variant="secondary" onClick={onLogout}>Sair</Button>
          </div>
        </div>

        {dateOpen ? (
          <div ref={popoverRef} className="mt-2 rounded-2xl border border-slate-200 bg-white shadow-xl px-3 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-col gap-1">
                <p className="text-[11px] font-extrabold text-slate-700">Ir para data</p>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={dateDraft || ""}
                    onChange={(e) => setDateDraft(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none"
                  />
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (!canGo) return;
                      onGoToDate?.(String(dateDraft || ""));
                      setDateOpen(false);
                    }}
                    disabled={!canGo}
                  >
                    Ir
                  </Button>
                  <Button variant="secondary" onClick={() => setDateOpen(false)}>
                    Cancelar
                  </Button>
                </div>
                <p className="text-[11px] text-slate-400">Dica: clique no período para abrir este seletor.</p>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <Button
                  variant="secondary"
                  onClick={() => {
                    onToday?.();
                    setDateOpen(false);
                  }}
                >
                  Hoje
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <div className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between transition-all duration-200 ${compact && !keepExpanded ? "max-h-0 opacity-0 pointer-events-none overflow-hidden" : "max-h-[200px] opacity-100"}`}>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
              <button
                type="button"
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
                  view === "day" ? "bg-violet-600 text-white" : "text-slate-700 hover:bg-slate-50"
                }`}
                onClick={() => onChangeView?.("day")}
              >
                Dia
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
                  view === "week" ? "bg-violet-600 text-white" : "text-slate-700 hover:bg-slate-50"
                }`}
                onClick={() => onChangeView?.("week")}
              >
                Semana
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
                  view === "month" ? "bg-violet-600 text-white" : "text-slate-700 hover:bg-slate-50"
                }`}
                onClick={() => onChangeView?.("month")}
              >
                Mês
              </button>
            </div>

            <div className="relative w-full sm:w-[320px]">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={searchValue || ""}
                  onChange={(e) => onSearchChange?.(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  placeholder="Buscar paciente nesta visão..."
                  className="w-full bg-transparent text-xs font-semibold text-slate-800 placeholder:text-slate-400 outline-none"
                />
              </div>

              {Array.isArray(searchResults) && searchResults.length ? (
                <div className="absolute left-0 right-0 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl z-50">
                  {searchResults.map((it) => (
                    <button
                      key={it.key}
                      type="button"
                      onClick={() => onSelectSearchItem?.(it)}
                      className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-800 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                    >
                      <span className="truncate block">{it.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {stats ? (
              <div className="hidden sm:flex items-center gap-2">
                {effectiveStatusFilter !== "all" ? (
                  <button
                    type="button"
                    onClick={() => onStatusFilterChange?.("all")}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-extrabold text-slate-700 hover:bg-slate-50"
                    title="Limpar filtro"
                  >
                    Filtro ativo <span className="text-slate-500">×</span>
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => onStatusFilterChange?.(effectiveStatusFilter === "confirmed" ? "all" : "confirmed")}
                  className={`inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-extrabold text-emerald-800 hover:brightness-[0.99] ${
                    effectiveStatusFilter === "confirmed" ? "ring-2 ring-emerald-300" : "opacity-90"
                  }`}
                  title="Filtrar por confirmados"
                >
                  Confirmados <span className="text-emerald-900">{stats.confirmed}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onStatusFilterChange?.(effectiveStatusFilter === "scheduled" ? "all" : "scheduled")}
                  className={`inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-extrabold text-blue-800 hover:brightness-[0.99] ${
                    effectiveStatusFilter === "scheduled" ? "ring-2 ring-blue-300" : "opacity-90"
                  }`}
                  title="Filtrar por agendados"
                >
                  Agendados <span className="text-blue-900">{stats.scheduled}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onStatusFilterChange?.(effectiveStatusFilter === "holds" ? "all" : "holds")}
                  className={`inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-extrabold text-amber-800 hover:brightness-[0.99] ${
                    effectiveStatusFilter === "holds" ? "ring-2 ring-amber-300" : "opacity-90"
                  }`}
                  title="Filtrar por reservas (holds)"
                >
                  Holds <span className="text-amber-900">{stats.holds}</span>
                </button>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">{rightActions || null}</div>
        </div>
      </div>
    </div>
  );
}