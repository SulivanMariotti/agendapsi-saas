// src/lib/shared/billingText.js
// Pure helpers (shared client/server) — AgendaPsi
//
// IMPORTANT:
// - No Firebase/admin imports here.
// - Keep messages consistent across Admin/Profissional/Paciente.

function norm(v) {
  return String(v ?? "").trim().toLowerCase();
}

// Canonical statuses: active | trial | past_due | canceled
export function normalizeBillingStatus(v) {
  const s = norm(v);
  if (s === "trial") return "trial";
  if (s === "past_due" || s === "pastdue" || s === "past-due") return "past_due";
  if (s === "canceled" || s === "cancelled" || s === "blocked") return "canceled"; // compat
  return "active";
}

export function billingStatusLabel(status) {
  const s = normalizeBillingStatus(status);
  if (s === "trial") return "Trial";
  if (s === "past_due") return "Pagamento pendente";
  if (s === "canceled") return "Cancelado";
  return "Ativo";
}

export function billingBannerCopy(billing, opts = {}) {
  const eff = normalizeBillingStatus(billing?.statusEffective || billing?.statusRaw || "active");
  if (!billing || eff === "active") return null;

  const canTenantAdmin = Boolean(opts?.canTenantAdmin);
  const context = String(opts?.context || "professional"); // professional | tenantAdmin | patient

  let title = "Atenção";
  let msg = "Seu status de cobrança não está ativo. Algumas ações podem ficar bloqueadas.";

  if (eff === "trial") {
    title = "Período de teste";
    const daysLeft = billing?.trialDaysLeft;
    msg =
      typeof daysLeft === "number"
        ? daysLeft <= 0
          ? "Seu período de teste expirou. Algumas ações podem ficar bloqueadas até a ativação."
          : `Seu período de teste termina em ${daysLeft} dia(s).`
        : "Seu período de teste está ativo.";
  }

  if (eff === "past_due") {
    title = "Pagamento pendente";
    const inGrace = Boolean(billing?.inGrace);
    const graceLeft = billing?.graceDaysLeft;

    if (inGrace && typeof graceLeft === "number") {
      msg =
        graceLeft <= 0
          ? "Pagamento pendente. Carência ativa (encerrando hoje). Regularize para evitar bloqueio."
          : `Pagamento pendente. Carência ativa por ${graceLeft} dia(s). Após isso, ações de criação/alteração podem ficar bloqueadas.`;
    } else {
      msg = "Pagamento pendente. O período de carência acabou e ações de criação/alteração estão bloqueadas até regularizar.";
    }
  }

  if (eff === "canceled") {
    title = "Assinatura cancelada";
    msg = "Assinatura cancelada. Ações de criação/alteração ficam bloqueadas.";
  }

  // Contextual nuance (small but consistent)
  if (context === "tenantAdmin" && eff !== "trial") {
    msg = msg.replaceAll("ações", "alterações");
  }

  return {
    title,
    msg,
    canTenantAdmin,
    statusEffective: eff,
  };
}

export function billingWriteBlockedMessage(billing, opts = {}) {
  const eff = normalizeBillingStatus(billing?.statusEffective || billing?.statusRaw || "active");
  const scope = String(opts?.scope || "ações de criação/alteração");

  if (eff === "canceled") {
    return `Assinatura cancelada. ${scope} estão bloqueadas.`;
  }
  if (eff === "past_due") {
    return `Pagamento pendente. O período de carência acabou e ${scope} estão bloqueadas até regularizar.`;
  }
  return `Cobrança pendente. ${scope} estão bloqueadas até regularizar.`;
}
