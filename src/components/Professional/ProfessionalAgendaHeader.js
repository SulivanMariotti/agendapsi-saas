"use client";

import React, { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Search, Clock, ChevronsDown, ChevronsUp, RefreshCcw } from "lucide-react";
import { Button } from "@/components/DesignSystem";
import { loadProfessionalAgendaPrefs, saveProfessionalAgendaPrefs, clearProfessionalAgendaPrefs, PROFESSIONAL_AGENDA_PREFS_DEFAULTS } from "@/lib/client/proAgendaPrefs";

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
  viewerUid,
  onChangeView,
  onPrev,
  onNext,
  onToday,
  showNow,
  onNow,
  showNextAppt,
  onNextAppt,
  onLogout,
  searchScope,
  onSearchScopeChange,
  searchValue,
  onSearchChange,
  searchResults,
  onSelectSearchItem,
  stats,
  statusFilter,
  onStatusFilterChange,
  rightActions,
  onPreferencesReset,
}) {
  const viewLabel = view === "day" ? "Dia" : view === "week" ? "Semana" : "Mês";
  const effectiveSearchScope = String(searchScope || "view") === "all" ? "all" : "view";
  const effectiveStatusFilter = String(statusFilter || "all");

  const [dateOpen, setDateOpen] = useState(false);
  const [dateDraft, setDateDraft] = useState(String(isoDate || ""));
  const [searchFocused, setSearchFocused] = useState(false);
  const [compact, setCompact] = useState(false);
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const popoverRef = useRef(null);

  // Persistência de preferências (localStorage) — por tenant + usuário
  const prefsReadyRef = useRef(false);
  const skipNextPersistViewRef = useRef(false);

  const persistPrefsPatch = (patch) => {
    if (!tenantId || !viewerUid) return;
    saveProfessionalAgendaPrefs({ tenantId, uid: viewerUid, patch });
  };

  const onResetPreferences = () => {
    if (!tenantId || !viewerUid) return;
    const ok = window.confirm("Restaurar as preferências padrão da agenda?");
    if (!ok) return;

    clearProfessionalAgendaPrefs({ tenantId, uid: viewerUid });

    const d = PROFESSIONAL_AGENDA_PREFS_DEFAULTS;
    // aplica defaults imediatamente (a persistência acontecerá via effects)
    onStatusFilterChange?.(d.statusFilter);
    setControlsCollapsed(Boolean(d.headerCollapsed));
    if (d.viewMode && d.viewMode !== view) {
      skipNextPersistViewRef.current = true;
      onChangeView?.(d.viewMode);
    }

    onSearchScopeChange?.(d.searchScope || "view");
    onSearchChange?.("");

// permite que visões específicas reajam ao reset (ex.: densidade da Semana)
    onPreferencesReset?.(d);
  };

  useEffect(() => {
    if (!tenantId || !viewerUid) return;

    const prefs = loadProfessionalAgendaPrefs({ tenantId, uid: viewerUid });

    // aplica filtro salvo
    if (prefs?.statusFilter && String(prefs.statusFilter) !== String(effectiveStatusFilter)) {
      onStatusFilterChange?.(prefs.statusFilter);
    }


    // aplica escopo de busca salvo ("view" vs "all")
    if (prefs?.searchScope) {
      const s = String(prefs.searchScope || "").toLowerCase();
      const normalized = s === "all" ? "all" : "view";
      if (normalized !== effectiveSearchScope) {
        onSearchScopeChange?.(normalized);
        onSearchChange?.("");
      }
    }

    // aplica view salva APENAS quando o usuário não passou view explicitamente na URL
    try {
      const sp = new URLSearchParams(window?.location?.search || "");
      const hasView = sp.has("view");
      if (!hasView && prefs?.viewMode && prefs.viewMode !== view) {
        skipNextPersistViewRef.current = true;
        onChangeView?.(prefs.viewMode);
      }
    } catch {
      // ignore
    }

    // aplica colapso manual salvo
    if (typeof prefs?.headerCollapsed === "boolean") {
      setControlsCollapsed(Boolean(prefs.headerCollapsed));
    }

    prefsReadyRef.current = true;
  }, [tenantId, viewerUid]);

  useEffect(() => {
    if (!prefsReadyRef.current) return;
    persistPrefsPatch({ statusFilter: effectiveStatusFilter });
  }, [effectiveStatusFilter, tenantId, viewerUid]);

  useEffect(() => {
    if (!prefsReadyRef.current) return;
    persistPrefsPatch({ searchScope: effectiveSearchScope });
  }, [effectiveSearchScope, tenantId, viewerUid]);

  useEffect(() => {
    if (!prefsReadyRef.current) return;
    if (skipNextPersistViewRef.current) {
      skipNextPersistViewRef.current = false;
      return;
    }
    persistPrefsPatch({ viewMode: view });
  }, [view, tenantId, viewerUid]);

  useEffect(() => {
    if (!prefsReadyRef.current) return;
    persistPrefsPatch({ headerCollapsed: Boolean(controlsCollapsed) });
  }, [controlsCollapsed, tenantId, viewerUid]);


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
  const hideControls = (compact || controlsCollapsed) && !keepExpanded;

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
            <Button
              variant="secondary"
              icon={controlsCollapsed ? ChevronsDown : ChevronsUp}
              onClick={() => setControlsCollapsed((v) => !v)}
              title={controlsCollapsed ? "Mostrar controles do header" : "Ocultar controles do header"}
            >
              Controles
            </Button>
            <Button variant="secondary" icon={RefreshCcw} onClick={onResetPreferences} title="Restaurar preferências padrão">Padrão</Button>
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

        <div className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between transition-all duration-200 ${hideControls ? "max-h-0 opacity-0 pointer-events-none overflow-hidden" : "max-h-[200px] opacity-100"}`}>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
              <button
                type="button"
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
                  view === "day" ? "bg-violet-600 text-white" : "text-slate-700 hover:bg-slate-50"
                }`}
                onClick={() => { persistPrefsPatch({ viewMode: "day" }); onChangeView?.("day"); }}
              >
                Dia
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
                  view === "week" ? "bg-violet-600 text-white" : "text-slate-700 hover:bg-slate-50"
                }`}
                onClick={() => { persistPrefsPatch({ viewMode: "week" }); onChangeView?.("week"); }}
              >
                Semana
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
                  view === "month" ? "bg-violet-600 text-white" : "text-slate-700 hover:bg-slate-50"
                }`}
                onClick={() => { persistPrefsPatch({ viewMode: "month" }); onChangeView?.("month"); }}
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
                  placeholder={effectiveSearchScope === "all" ? "Buscar paciente (todos)..." : "Buscar paciente nesta visão..."}
                  className="w-full bg-transparent text-xs font-semibold text-slate-800 placeholder:text-slate-400 outline-none"
                />

                <button
                  type="button"
                  onClick={() => {
                    const next = effectiveSearchScope === "all" ? "view" : "all";
                    onSearchScopeChange?.(next);
                    onSearchChange?.("");
                  }}
                  className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-200"
                  title={effectiveSearchScope === "all" ? "Trocar para busca na visão" : "Trocar para busca em todos os pacientes"}
                >
                  {effectiveSearchScope === "all" ? "Pacientes" : "Visão"}
                </button>
              </div>

              {Array.isArray(searchResults) && searchResults.length ? (
                <div className="absolute left-0 right-0 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl z-50">
                  {searchResults.map((it) => {
                    const hasNext =
                      String(it?.kind || "") === "patient" &&
                      it?.nextAppt?.isoDate &&
                      it?.nextAppt?.occurrenceId;
                    return (
                      <div
                        key={it.key}
                        className="flex items-stretch border-b border-slate-100 last:border-b-0"
                      >
                        <button
                          type="button"
                          onClick={() => onSelectSearchItem?.(it)}
                          className="flex-1 min-w-0 px-3 py-2 text-left hover:bg-slate-50"
                        >
                          <span className="truncate block text-xs font-semibold text-slate-800">
                            {it.label}
                          </span>
                          {it?.subLabel ? (
                            <span className="truncate block text-[11px] font-semibold text-slate-500">
                              {it.subLabel}
                            </span>
                          ) : null}
                        </button>

                        {hasNext ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onSelectSearchItem?.({ ...it, action: "next" });
                            }}
                            className="shrink-0 px-3 text-[11px] font-extrabold text-violet-700 hover:bg-violet-50 border-l border-slate-100"
                            title="Ir para o próximo atendimento deste paciente"
                          >
                            Próximo
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {stats ? (
              <div className="hidden sm:flex items-center gap-2">
                {effectiveStatusFilter !== "all" ? (
                  <button
                    type="button"
                    onClick={() => { persistPrefsPatch({ statusFilter: "all" }); onStatusFilterChange?.("all"); }}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-extrabold text-slate-700 hover:bg-slate-50"
                    title="Limpar filtro"
                  >
                    Filtro ativo <span className="text-slate-500">×</span>
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => { const next = effectiveStatusFilter === "confirmed" ? "all" : "confirmed"; persistPrefsPatch({ statusFilter: next }); onStatusFilterChange?.(next); }}
                  className={`inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-extrabold text-emerald-800 hover:brightness-[0.99] ${
                    effectiveStatusFilter === "confirmed" ? "ring-2 ring-emerald-300" : "opacity-90"
                  }`}
                  title="Filtrar por confirmados"
                >
                  Confirmados <span className="text-emerald-900">{stats.confirmed}</span>
                </button>

                <button
                  type="button"
                  onClick={() => { const next = effectiveStatusFilter === "scheduled" ? "all" : "scheduled"; persistPrefsPatch({ statusFilter: next }); onStatusFilterChange?.(next); }}
                  className={`inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-extrabold text-blue-800 hover:brightness-[0.99] ${
                    effectiveStatusFilter === "scheduled" ? "ring-2 ring-blue-300" : "opacity-90"
                  }`}
                  title="Filtrar por agendados"
                >
                  Agendados <span className="text-blue-900">{stats.scheduled}</span>
                </button>

                <button
                  type="button"
                  onClick={() => { const next = effectiveStatusFilter === "holds" ? "all" : "holds"; persistPrefsPatch({ statusFilter: next }); onStatusFilterChange?.(next); }}
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
