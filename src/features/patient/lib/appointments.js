import { PT } from "./uiTokens";

const ACCENT_CHIP = `${PT.accentSoft} ${PT.accentText}`;

export function chipClass(style) {
  if (style === "today") return PT.ok;
  if (style === "tomorrow") return ACCENT_CHIP;
  if (style === "future") return PT.neutralChip;
  return PT.warn;
}

export function prettyServiceLabel(serviceType) {
  const s = String(serviceType || "").trim().toLowerCase();
  if (!s) return "";
  if (s === "psicologia") return "Psicologia";
  if (s === "fonoaudiologia") return "Fonoaudiologia";
  if (s === "nutricao") return "Nutrição";
  if (s === "neuropsicologia") return "Neuropsicologia";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// fallback robusto: campo novo `serviceType`, mas suporta variações antigas
export function getServiceTypeFromAppointment(a) {
  return a?.serviceType || a?.servico || a?.service || a?.tipoServico || a?.tipo_servico || "";
}

export function getLocationFromAppointment(a) {
  return a?.location || a?.local || a?.sala || a?.place || "";
}

export function statusChipFor(appointmentStatus, isConfirmed) {
  const s = String(appointmentStatus || "scheduled").toLowerCase();

  if (s === "done") {
    return { text: "Realizada", cls: PT.ok };
  }
  if (s === "no_show") {
    return { text: "Faltou", cls: PT.warn };
  }
  if (s === "cancelled") {
    return { text: "Cancelada", cls: PT.neutralChip };
  }
  if (isConfirmed) {
    return { text: "Confirmada", cls: ACCENT_CHIP };
  }
  return { text: "Agendada", cls: PT.neutralChip };
}
