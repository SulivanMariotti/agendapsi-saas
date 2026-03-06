// Centralized status -> Tailwind classes for AgendaPsi (Profissional).
// Keep strings explicit to remain compatible with Tailwind class scanning.

export const STATUSES = [
  "Agendado",
  "Confirmado",
  "Finalizado",
  "Não comparece",
  "Cancelado",
  "Reagendado",
];

// Backward/variant spellings (defensive)
const STATUS_ALIASES = {
  "Não Compareceu": "Não comparece",
  "Não compareceu": "Não comparece",
};

function normStatus(status) {
  if (!status) return "";
  return STATUS_ALIASES[status] || status;
}

const PILL_CLASS = {
  Agendado: "bg-violet-100 text-violet-900 border-violet-300",
  Confirmado: "bg-blue-100 text-blue-900 border-blue-300",
  Finalizado: "bg-emerald-100 text-emerald-900 border-emerald-300",
  "Não comparece": "bg-pink-100 text-pink-900 border-pink-300",
  Cancelado: "bg-red-100 text-red-900 border-red-300",
  Reagendado: "bg-orange-100 text-orange-900 border-orange-300",
};

const BAR_CLASS = {
  Agendado: "bg-violet-600",
  Confirmado: "bg-blue-600",
  Finalizado: "bg-emerald-600",
  "Não comparece": "bg-pink-600",
  Cancelado: "bg-red-600",
  Reagendado: "bg-orange-600",
};

const CARD_SOFT_CLASS = {
  Agendado: "bg-violet-100 border-violet-200",
  Confirmado: "bg-blue-100 border-blue-200",
  Finalizado: "bg-emerald-100 border-emerald-200",
  "Não comparece": "bg-pink-100 border-pink-200",
  Cancelado: "bg-red-100 border-red-200",
  Reagendado: "bg-orange-100 border-orange-200",
};

const ACCENT_BORDER_CLASS = {
  Agendado: "border-l-violet-600",
  Confirmado: "border-l-blue-600",
  Finalizado: "border-l-emerald-600",
  "Não comparece": "border-l-pink-600",
  Cancelado: "border-l-red-600",
  Reagendado: "border-l-orange-600",
};

const ICON_COLOR_CLASS = {
  Agendado: "text-violet-800",
  Confirmado: "text-blue-800",
  Finalizado: "text-emerald-800",
  "Não comparece": "text-pink-800",
  Cancelado: "text-red-800",
  Reagendado: "text-orange-800",
};

const WEEK_BLOCK_CLASS = {
  Agendado: "bg-violet-200 border-violet-400 text-violet-900",
  Confirmado: "bg-blue-200 border-blue-400 text-blue-900",
  Finalizado: "bg-emerald-200 border-emerald-400 text-emerald-900",
  "Não comparece": "bg-pink-200 border-pink-400 text-pink-900",
  Cancelado: "bg-red-200 border-red-400 text-red-900",
  Reagendado: "bg-orange-200 border-orange-400 text-orange-900",
};

const MONTH_ITEM_BG_CLASS = {
  Agendado: "bg-violet-200/80 border border-violet-300 text-violet-900",
  Confirmado: "bg-blue-200/80 border border-blue-300 text-blue-900",
  Finalizado: "bg-emerald-200/80 border border-emerald-300 text-emerald-900",
  "Não comparece": "bg-pink-200/80 border border-pink-300 text-pink-900",
  Cancelado: "bg-red-200/80 border border-red-300 text-red-900",
  Reagendado: "bg-orange-200/80 border border-orange-300 text-orange-900",
};

export function statusPillClass(status) {
  const s = normStatus(status);
  return PILL_CLASS[s] || "bg-slate-50 text-slate-700 border-slate-200";
}

export function statusBarClass(status) {
  const s = normStatus(status);
  return BAR_CLASS[s] || "bg-slate-300";
}

export function statusCardSoftClass(status) {
  const s = normStatus(status);
  return CARD_SOFT_CLASS[s] || "bg-white border-slate-100";
}

export function statusAccentBorderClass(status) {
  const s = normStatus(status);
  return ACCENT_BORDER_CLASS[s] || "border-l-slate-300";
}

export function statusIconColorClass(status) {
  const s = normStatus(status);
  return ICON_COLOR_CLASS[s] || "text-slate-600";
}

export function statusBlockClass({ status, isHold }) {
  if (isHold) return "bg-slate-100/60 border-slate-200 text-slate-800";
  const s = normStatus(status);
  return WEEK_BLOCK_CLASS[s] || "bg-slate-50 border-slate-200 text-slate-800";
}

export function statusDotClass(status) {
  const s = normStatus(status);
  return BAR_CLASS[s] || "bg-slate-400";
}

export function statusItemBgClass({ status, isHold, inMonth }) {
  // Month view: color the whole chip background based on status.
  // Holds should be visually "muted" (gray ~50%).
  if (isHold) return `${inMonth ? "" : "opacity-70 "}bg-slate-100/60 border border-slate-200 text-slate-700`;
  const s = normStatus(status);
  const base = MONTH_ITEM_BG_CLASS[s] || "bg-slate-50 border border-slate-200 text-slate-800";
  return `${inMonth ? "" : "opacity-70 "}${base}`;
}
