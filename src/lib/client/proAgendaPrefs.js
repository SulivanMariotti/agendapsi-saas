/**
 * AgendaPsi — Preferências da Agenda do Profissional (localStorage)
 * - Armazenamento local apenas de UI/UX (sem dados sensíveis).
 * - Escopo: por tenant + usuário.
 */

const PREFS_VERSION = "v1";

const DEFAULT_PREFS = {
  viewMode: "day", // "day" | "week" | "month"
  statusFilter: "all", // "all" | "scheduled" | "confirmed" | "holds"
  searchScope: "view", // "view" | "all" — busca "Nesta visão" vs "Todos os pacientes"
  headerCollapsed: false, // boolean — controla colapso manual da Camada 2 do header
  weekDensity: "comfortable", // "comfortable" | "compact" — densidade apenas para a visão Semana
};

function makeKey({ tenantId, uid }) {
  const t = String(tenantId || "").trim();
  const u = String(uid || "").trim();
  if (!t || !u) return null;
  return `agendapsi:pro:agendaPrefs:${PREFS_VERSION}:${t}:${u}`;
}

function isValidViewMode(v) {
  return v === "day" || v === "week" || v === "month";
}

function isValidStatusFilter(v) {
  return v === "all" || v === "scheduled" || v === "confirmed" || v === "holds";
}

function isValidSearchScope(v) {
  return v === "view" || v === "all";
}

function isValidWeekDensity(v) {
  return v === "comfortable" || v === "compact";
}

function sanitize(raw) {
  const next = { ...DEFAULT_PREFS };

  if (raw && typeof raw === "object") {
    const viewMode = String(raw.viewMode || "").toLowerCase();
    const statusFilter = String(raw.statusFilter || "").toLowerCase();
    let searchScope = String(raw.searchScope || "").toLowerCase();
    if (searchScope === "patients" || searchScope === "pacientes") searchScope = "all";
    const weekDensity = String(raw.weekDensity || "").toLowerCase();
    const headerCollapsedRaw = raw.headerCollapsed;

    if (isValidViewMode(viewMode)) next.viewMode = viewMode;
    if (isValidStatusFilter(statusFilter)) next.statusFilter = statusFilter;
    if (isValidSearchScope(searchScope)) next.searchScope = searchScope;
    if (isValidWeekDensity(weekDensity)) next.weekDensity = weekDensity;

    // headerCollapsed pode ser boolean ou string "true"/"false"
    if (typeof headerCollapsedRaw === "boolean") next.headerCollapsed = headerCollapsedRaw;
    else if (typeof headerCollapsedRaw === "string") {
      const s = headerCollapsedRaw.trim().toLowerCase();
      if (s === "true") next.headerCollapsed = true;
      if (s === "false") next.headerCollapsed = false;
    }
  }

  return next;
}

export function loadProfessionalAgendaPrefs({ tenantId, uid }) {
  const key = makeKey({ tenantId, uid });
  if (!key) return { ...DEFAULT_PREFS };

  try {
    const v = window?.localStorage?.getItem(key);
    if (!v) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(v);
    return sanitize(parsed);
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveProfessionalAgendaPrefs({ tenantId, uid, patch }) {
  const key = makeKey({ tenantId, uid });
  if (!key) return;

  try {
    const current = loadProfessionalAgendaPrefs({ tenantId, uid });
    const next = sanitize({ ...current, ...(patch || {}) });
    window?.localStorage?.setItem(key, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function clearProfessionalAgendaPrefs({ tenantId, uid }) {
  const key = makeKey({ tenantId, uid });
  if (!key) return;
  try {
    window?.localStorage?.removeItem(key);
  } catch {
    // ignore
  }
}

export const PROFESSIONAL_AGENDA_PREFS_DEFAULTS = DEFAULT_PREFS;
