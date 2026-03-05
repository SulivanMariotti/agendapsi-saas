// src/app/api/paciente/agenda/route.js
import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { enforceSameOrigin } from "@/lib/server/originGuard";
import { requireAuth } from "@/lib/server/requireAuth";
import { ensureTenantActive } from "@/lib/server/tenantStatus";
import { getPatientPortalConfig } from "@/lib/server/patientPortalConfig";

export const runtime = "nodejs";

/**
 * GET /api/paciente/agenda
 *
 * AgendaPsi (portal do paciente) — leitura server-side (Admin SDK)
 * - Evita permission-denied no client
 * - Minimiza dados (sem prontuário/evolução)
 *
 * Auth:
 * - Authorization: Bearer <idToken>
 * - Claims obrigatórias: role='patient', tenantId, patientId
 *
 * Retorna:
 * - paciente (nome)
 * - próximos agendamentos (main occurrences; sem blocks; sem holds)
 */

function norm(v) {
  return String(v ?? "").trim();
}

function pickFirstNonEmpty(...vals) {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return null;
}

function toIsoDate(tsOrDate) {
  if (!tsOrDate) return null;
  const d = typeof tsOrDate?.toDate === "function" ? tsOrDate.toDate() : tsOrDate instanceof Date ? tsOrDate : new Date(tsOrDate);
  const t = d?.getTime?.();
  if (!Number.isFinite(t)) return null;
  return d.toISOString().slice(0, 10);
}

function startAtMillisFromOcc(o) {
  const iso = toIsoDate(o?.date);
  const t = norm(o?.startTime || "");
  if (!iso) return null;
  if (t && /^\d{2}:\d{2}$/.test(t)) {
    const ms = new Date(`${iso}T${t}:00`).getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  return new Date(`${iso}T00:00:00`).getTime();
}

export async function GET(req) {
  try {
    const originCheck = enforceSameOrigin(req, {
      allowNoOrigin: false,
      allowNoOriginWithAuth: true,
      message: "Acesso bloqueado (origem inválida).",
    });
    if (!originCheck.ok) return originCheck.res;

    const rl = await rateLimit(req, {
      bucket: "patient:agendapsi:agenda",
      limit: 120,
      windowMs: 60_000,
      errorMessage: "Muitas requisições. Aguarde um pouco e tente novamente.",
    });
    if (!rl.ok) return rl.res;

    const auth = await requireAuth(req);
    if (!auth.ok) return auth.res;

    const decoded = auth.decoded || {};
    const role = String(decoded?.role || "").toLowerCase().trim();
    if (role !== "patient") {
      return NextResponse.json({ ok: false, error: "Acesso restrito ao paciente." }, { status: 403 });
    }

    const tenantId = norm(decoded?.tenantId || "");
    const patientId = norm(decoded?.patientId || "");

    if (!tenantId || !patientId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Sessão do paciente sem contexto de tenant/paciente. (Dev) Use o botão de demo ou vincule o paciente ao AgendaPsi.",
        },
        { status: 403 }
      );
    }


    const tenantCheck = await ensureTenantActive(tenantId);
    if (!tenantCheck.ok) {
      return NextResponse.json(
        { ok: false, error: "tenant-suspended", code: "TENANT_SUSPENDED" },
        { status: 403 }
      );
    }

    const tenantRef = admin.firestore().collection("tenants").doc(tenantId);
    const patientRef = tenantRef.collection("patients").doc(patientId);

    const patientSnap = await patientRef.get();
    if (!patientSnap.exists) {
      return NextResponse.json({ ok: false, error: "Paciente não encontrado." }, { status: 404 });
    }

    // Query simples (evita índice composto): filtra e ordena no server
    const occSnap = await tenantRef
      .collection("appointmentOccurrences")
      .where("patientId", "==", patientId)
      .limit(250)
      .get();

    const nowMs = Date.now();
    const windowEndMs = nowMs + 90 * 24 * 60 * 60 * 1000;

    const occurrences = occSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() || {}) }))
      .filter((o) => o && o.isHold !== true)
      .filter((o) => o && o.isBlock !== true && (o.parentOccurrenceId == null || o.parentOccurrenceId === ""))
      .map((o) => {
        const dateIso = toIsoDate(o.date);
        const startAtMs = startAtMillisFromOcc(o);
        return {
          id: o.id,
          seriesId: o.seriesId || null,
          dateIso,
          startTime: o.startTime || null,
          durationMin: o.durationMin || null,
          status: o.status || null,
          sessionIndex: o.sessionIndex || null,
          plannedTotalSessions: o.plannedTotalSessions || null,
          startAtMs,
        };
      })
      .filter((o) => Number.isFinite(o.startAtMs) ? o.startAtMs >= (nowMs - 2 * 60 * 60 * 1000) && o.startAtMs <= windowEndMs : true)
      .sort((a, b) => (a.startAtMs || 0) - (b.startAtMs || 0))
      .slice(0, 40);

    const p = patientSnap.data() || {};
    const phoneFromPatient = pickFirstNonEmpty(
      p.mobile,
      p.mobilePhone,
      p.phone,
      p.phoneE164,
      p.phoneNumber,
      p.whatsapp,
      p.whatsappPhone,
      p.contactPhone,
      p?.contact?.phone
    );

    const phoneFromOcc = occSnap.docs
      .map((d) => d.data() || {})
      .map((o) =>
        pickFirstNonEmpty(
          o.patientPhone,
          o.patientMobile,
          o.patientWhatsapp,
          o.patientPhoneE164,
          o.patientPhoneCanonical,
          o.phone,
          o.mobile
        )
      )
      .find(Boolean);

    const patient = {
      id: patientId,
      fullName: p.fullName || null,
      phone: phoneFromPatient || phoneFromOcc || null,
      profileCompleted: p.profileCompleted === true,
    };

    const portalCfg = await getPatientPortalConfig(tenantId);
    const portal = p.portal || {};

    const acceptedVersion = Number(portal.termsAcceptedVersion || 0) || 0;
    const needsContractAcceptance = acceptedVersion < Number(portalCfg.termsVersion || 1);

    const remindersModuleEnabled = portalCfg.remindersEnabled !== false;

    const remindersPreference =
      typeof portal.remindersEnabled === "boolean" ? portal.remindersEnabled : portalCfg.remindersEnabled;

    const remindersEnabled = remindersModuleEnabled ? remindersPreference : false;

    const portalPublic = {
      contract: {
        version: portalCfg.termsVersion,
        text: portalCfg.termsText,
        needsAcceptance: needsContractAcceptance,
        acceptedAt: portal.termsAcceptedAt || null,
      },
      features: {
        libraryEnabled: portalCfg.libraryEnabled,
        notesEnabled: portalCfg.notesEnabled,
        remindersModuleEnabled,
        remindersEnabled,
      },
    };

    return NextResponse.json({ ok: true, tenantId, patient, portal: portalPublic, occurrences });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[PACIENTE_AGENDA] Error", e);
    return NextResponse.json({ ok: false, error: "Erro interno." }, { status: 500 });
  }
}
