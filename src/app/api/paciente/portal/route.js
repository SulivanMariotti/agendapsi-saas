// src/app/api/paciente/portal/route.js
import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { enforceSameOrigin } from "@/lib/server/originGuard";
import { requireAuth } from "@/lib/server/requireAuth";
import { ensureTenantActive } from "@/lib/server/tenantStatus";
import { getPatientPortalConfig } from "@/lib/server/patientPortalConfig";
import { toPhoneCanonical } from "@/lib/server/subscriberLookup";

export const runtime = "nodejs";

function norm(v) {
  return String(v ?? "").trim();
}

function nowServer() {
  return admin.firestore.FieldValue.serverTimestamp();
}

/**
 * Sincroniza preferências do portal do paciente com a camada "Admin Lembretes" (legada),
 * sem mudar a fonte da verdade clínica do AgendaPsi.
 *
 * Motivação:
 * - O Admin já possui painel e rotinas para lembretes/push.
 * - O paciente só deve controlar o opt-in/opt-out (preferência).
 *
 * Estratégia (MVP):
 * - Continua gravando em tenants/{tenantId}/patients/{patientId}.portal.remindersEnabled
 * - E (best-effort) espelha em:
 *   - users/{uid}.phoneCanonical/name/tenantId/patientId (para integrações legadas)
 *   - subscribers/{phoneCanonical}.status = 'active' | 'disabled'
 */
async function syncLegacyReminderOptIn({ uid, tenantId, patientId, enabled, patient }) {
  try {
    const fullName = norm(patient?.fullName || patient?.nameFull || patient?.name || "");
    const mobile = norm(patient?.mobile || patient?.phoneCanonical || patient?.phone || "");
    const phoneCanonical = toPhoneCanonical(mobile);

    // users/{uid} (registro mínimo)
    await admin
      .firestore()
      .collection("users")
      .doc(uid)
      .set(
        {
          role: "patient",
          tenantId,
          patientId,
          nameFull: fullName || null,
          phoneCanonical: phoneCanonical || null,
          updatedAt: nowServer(),
        },
        { merge: true }
      );

    if (!phoneCanonical) return;

    // subscribers/{phoneCanonical} (opt-in/out)
    const subRef = admin.firestore().collection("subscribers").doc(phoneCanonical);
    const patch = enabled
      ? {
          status: "active",
          disabledAt: null,
          deletedAt: null,
          updatedAt: nowServer(),
          nameFull: fullName || null,
          tenantId,
          patientId,
        }
      : {
          status: "disabled",
          disabledAt: nowServer(),
          updatedAt: nowServer(),
          nameFull: fullName || null,
          tenantId,
          patientId,
        };

    await subRef.set(patch, { merge: true });
  } catch (e) {
    // best-effort: não bloquear UX do paciente por integração legada
    // eslint-disable-next-line no-console
    console.warn("syncLegacyReminderOptIn failed:", e?.message || e);
  }
}

export async function POST(req) {
  try {
    const originCheck = enforceSameOrigin(req, {
      allowNoOrigin: false,
      allowNoOriginWithAuth: true,
      message: "Acesso bloqueado (origem inválida).",
    });
    if (!originCheck.ok) return originCheck.res;

    const rl = await rateLimit(req, {
      bucket: "patient:agendapsi:portal",
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
    const uid = norm(decoded?.uid || decoded?.user_id || decoded?.sub || "");
    if (!tenantId || !patientId || !uid) {
      return NextResponse.json({ ok: false, error: "Sessão do paciente sem contexto." }, { status: 403 });
    }


    const tenantCheck = await ensureTenantActive(tenantId);
    if (!tenantCheck.ok) {
      return NextResponse.json(
        { ok: false, error: "tenant-suspended", code: "TENANT_SUSPENDED" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const action = norm(body?.action || "");

    const tenantRef = admin.firestore().collection("tenants").doc(tenantId);
    const patientRef = tenantRef.collection("patients").doc(patientId);

    const portalCfg = await getPatientPortalConfig(tenantId);
    const remindersModuleEnabled = portalCfg.remindersEnabled !== false;

    const patch = {};
    let remindersToggleValue = null;

    if (action === "acceptContract") {
      patch["portal.termsAcceptedVersion"] = Number(portalCfg.termsVersion || 1);
      patch["portal.termsAcceptedAt"] = nowServer();
      patch["portal.updatedAt"] = nowServer();
    } else if (action === "setReminders") {
      const enabled = typeof body?.remindersEnabled === "boolean" ? body.remindersEnabled : null;
      if (enabled === null) {
        return NextResponse.json({ ok: false, error: "remindersEnabled inválido." }, { status: 400 });
      }

      // Se o tenant desativou o módulo de lembretes, força false e não permite ativar.
      if (!remindersModuleEnabled) {
        remindersToggleValue = false;
        patch["portal.remindersEnabled"] = false;
        patch["portal.updatedAt"] = nowServer();
      } else {
        remindersToggleValue = !!enabled;
        patch["portal.remindersEnabled"] = remindersToggleValue;
        patch["portal.updatedAt"] = nowServer();
      }
    } else {
      return NextResponse.json({ ok: false, error: "Ação inválida." }, { status: 400 });
    }

    await patientRef.set(patch, { merge: true });

    // re-lê o paciente para responder estado atual
    const patientSnap = await patientRef.get();
    const p = patientSnap.data() || {};
    const portal = p.portal || {};

    const acceptedVersion = Number(portal.termsAcceptedVersion || 0) || 0;
    const needsContractAcceptance = acceptedVersion < Number(portalCfg.termsVersion || 1);

    const remindersPreference =
      typeof portal.remindersEnabled === "boolean" ? portal.remindersEnabled : portalCfg.remindersEnabled;

    const remindersEnabled = remindersModuleEnabled ? remindersPreference : false;

    // espelha opt-in/out para o painel Admin (best-effort)
    if (remindersToggleValue !== null) {
      await syncLegacyReminderOptIn({
        uid,
        tenantId,
        patientId,
        enabled: remindersToggleValue,
        patient: p,
      });
    }

    return NextResponse.json({
      ok: true,
      portal: {
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
        remindersEnabled,
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("paciente portal error:", e);
    return NextResponse.json({ ok: false, error: "Falha ao salvar preferências." }, { status: 500 });
  }
}
