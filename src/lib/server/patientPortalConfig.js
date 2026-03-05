// src/lib/server/patientPortalConfig.js
import admin from "@/lib/firebaseAdmin";
import { getTenantPlan, featureAllowed } from "@/lib/server/tenantPlan";
import { getTenantBillingState } from "@/lib/server/tenantBilling";

function toBool(v, fallback = false) {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return fallback;
  if (["1","true","yes","y","on"].includes(s)) return true;
  if (["0","false","no","n","off"].includes(s)) return false;
  return fallback;
}

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * getPatientPortalConfig(tenantId)
 *
 * Lê config do portal do paciente em:
 *   tenants/{tenantId}/settings/patientPortal
 *
 * Campos esperados (opcionais):
 * - termsVersion (number)
 * - termsText (string)
 * - libraryEnabled (boolean)
 * - notesEnabled (boolean)
 * - remindersEnabled (boolean)
 */
export async function getPatientPortalConfig(tenantId) {
  const ref = admin.firestore().collection("tenants").doc(String(tenantId)).collection("settings").doc("patientPortal");
  const snap = await ref.get();
  const data = snap.exists ? (snap.data() || {}) : {};

  const termsVersion = toNum(data.termsVersion, 1) || 1;
  const termsText = String(data.termsText || `CONTRATO TERAPÊUTICO (RESUMO)
1) Pontualidade e presença: o horário reservado é um espaço de cuidado. Comparecer sustenta o processo.
2) Remarcações: caso precise ajustar, entre em contato diretamente com a clínica/profissional.
3) Sigilo e ética: o atendimento segue princípios éticos e de confidencialidade.
4) Comunicação: mensagens servem para organização (não substituem a sessão).
5) Constância: faltas e interrupções são conteúdos importantes para levar à sessão.

Ao concordar, você reconhece que leu e compreendeu os termos básicos do acompanhamento.`).trim();
  const libraryEnabled = toBool(data.libraryEnabled, true);
  const notesEnabled = toBool(data.notesEnabled, true); // agora disponível (pode desativar por tenant)
  const remindersEnabled = toBool(data.remindersEnabled, true);

  // Plano (Pós-MVP): aplica gating (settings ∩ plano)
  const plan = await getTenantPlan(tenantId);
  const planLibrary = featureAllowed(plan, ["patientPortal", "library"]);
  const planNotes = featureAllowed(plan, ["patientPortal", "notes"]);
  const planReminders = featureAllowed(plan, ["patientPortal", "reminders"]);

  const billing = await getTenantBillingState(tenantId);
  const billingOk = billing?.writeAllowed !== false; // ativo ou trial

  return {
    termsVersion,
    termsText,
    // effective flags
    libraryEnabled: libraryEnabled && planLibrary && billingOk,
    notesEnabled: notesEnabled && planNotes && billingOk,
    remindersEnabled: remindersEnabled && planReminders && billingOk,
    // debug/telemetry (server-side only consumers)
    planId: plan.planId,
  };
}
