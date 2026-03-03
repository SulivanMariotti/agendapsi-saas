// src/app/api/paciente/dev-token/route.js
import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { enforceSameOrigin } from "@/lib/server/originGuard";

export const runtime = "nodejs";

/**
 * DEV ONLY: emite um custom token para testar o Painel do Paciente (AgendaPsi).
 *
 * Segurança:
 * - Apenas em development (NODE_ENV !== 'production')
 * - Exige ENABLE_PATIENT_DEV_TOKEN=true
 * - Proteção de origem + rate limit
 *
 * ENV:
 * - AGENDA_PSI_TENANT_ID (default tn_JnA5yU)
 * - AGENDA_PSI_PATIENT_ID (default do seed)
 */

function envBool(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(s);
}

function resolveTenantId() {
  return String(process.env.AGENDA_PSI_TENANT_ID || "").trim() || "tn_JnA5yU";
}

function resolvePatientId() {
  return String(process.env.AGENDA_PSI_PATIENT_ID || "").trim() || "oke7bg0oQ2qJDOfTF3Xu";
}

export async function POST(req) {
  try {
    const originCheck = enforceSameOrigin(req, {
      allowNoOrigin: false,
      allowNoOriginWithAuth: false,
      message: "Acesso bloqueado (origem inválida).",
    });
    if (!originCheck.ok) return originCheck.res;

    const enabled = envBool(process.env.ENABLE_PATIENT_DEV_TOKEN);
    const isProd = process.env.NODE_ENV === "production";
    if (isProd || !enabled) {
      return NextResponse.json({ ok: false, error: "Rota indisponível." }, { status: 404 });
    }

    const rl = await rateLimit(req, {
      bucket: "dev:patient:token",
      global: true,
      limit: 30,
      windowMs: 60_000,
    });
    if (!rl.ok) return rl.res;

    const tenantId = resolveTenantId();
    const patientId = resolvePatientId();
    const uid = `pt_${tenantId}_${patientId}`;

    // garante que o paciente existe no tenant (melhor feedback em dev)
    const snap = await admin.firestore().collection("tenants").doc(tenantId).collection("patients").doc(patientId).get();
    if (!snap.exists) {
      return NextResponse.json(
        { ok: false, error: "Paciente de teste não encontrado. Rode o seed ou ajuste AGENDA_PSI_PATIENT_ID." },
        { status: 404 }
      );
    }

    const token = await admin.auth().createCustomToken(uid, {
      role: "patient",
      tenantId,
      patientId,
      mode: "dev",
    });

    return NextResponse.json({ ok: true, token, uid, tenantId, patientId });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[DEV_PATIENT_TOKEN] Error", e);
    return NextResponse.json({ ok: false, error: "Erro interno." }, { status: 500 });
  }
}
