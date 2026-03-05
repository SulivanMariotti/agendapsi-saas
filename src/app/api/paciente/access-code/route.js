// src/app/api/paciente/access-code/route.js
import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { enforceSameOrigin } from "@/lib/server/originGuard";

export const runtime = "nodejs";

function normalizeCode(codeRaw) {
  return String(codeRaw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^0-9A-Z]/g, "");
}

function last4Digits(phoneRaw) {
  const digits = String(phoneRaw || "").replace(/\D/g, "");
  if (digits.length < 4) return "";
  return digits.slice(-4);
}

/**
 * POST /api/paciente/access-code
 *
 * Exchange de "código de acesso" -> Firebase Custom Token do paciente.
 *
 * - Não usa Firestore no client (portal via API).
 * - O código é gerado pelo profissional/admin e armazenado em patientAccessCodes/{code}.
 * - Ao consumir, o código é marcado como "consumed" (one-time) e expira por tempo.
 */
export async function POST(req) {
  // CSRF hardening (ainda não há Auth no request)
  const originCheck = enforceSameOrigin(req, {
    allowNoOrigin: false,
    allowNoOriginWithAuth: false,
    failureResponse: () =>
      NextResponse.json({ ok: false, error: "forbidden-origin" }, { status: 403 }),
  });
  if (!originCheck.ok) return originCheck.res;

  const limited = await rateLimit(req, {
    bucket: "paciente:access-code",
    limit: 20,
    windowMs: 60_000,
    global: true,
    errorMessage: "Muitas tentativas. Aguarde um pouco e tente novamente.",
  });
  if (!limited.ok) return limited.res;

  let body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const code = normalizeCode(body?.code);
  const phoneLast4 = last4Digits(body?.phone);

  // Formato MVP: 6 dígitos (numérico), enviado pela clínica
  if (!code || !/^[0-9]{6}$/.test(code)) {
    return NextResponse.json({ ok: false, error: "invalid-code" }, { status: 400 });
  }

  const codeRef = admin.firestore().doc(`patientAccessCodes/${code}`);

  try {
    const result = await admin.firestore().runTransaction(async (tx) => {
      const snap = await tx.get(codeRef);
      if (!snap.exists) {
        throw new Error("not-found");
      }

      const data = snap.data() || {};
      if (data.status === "consumed" || data.consumedAt) {
        throw new Error("already-consumed");
      }

      const now = Date.now();
      const expiresAtMs = data?.expiresAt?.toMillis?.() ?? null;
      if (expiresAtMs && now > expiresAtMs) {
        // expira e invalida
        tx.update(codeRef, {
          status: "expired",
          expiredAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        throw new Error("expired");
      }

      if (!data?.tenantId || !data?.patientId) {
        throw new Error("invalid-record");
      }

      // Opcional: valida last4 do telefone (se presente no código)
      const storedLast4 = String(data.phoneLast4 || "");
      if (storedLast4 && phoneLast4 && storedLast4 !== phoneLast4) {
        throw new Error("phone-mismatch");
      }

      const tenantId = data.tenantId;
      const patientId = data.patientId;

      // Bloqueio SaaS: tenant suspenso/ausente
      const tenantRef = admin.firestore().doc(`tenants/${tenantId}`);
      const tenantSnap = await tx.get(tenantRef);
      if (!tenantSnap.exists) {
        throw new Error("tenant-missing");
      }
      const tenantStatus = String((tenantSnap.data() || {}).status || "active").toLowerCase().trim();
      if (tenantStatus && tenantStatus !== "active") {
        throw new Error("tenant-suspended");
      }


      // Resolve/Cria "portal user"
      const portalRef = admin.firestore().doc(`tenants/${tenantId}/patientsPortal/${patientId}`);
      const portalSnap = await tx.get(portalRef);

      // UID determinístico (para permitir re-login do mesmo paciente)
      const safeTenant = String(tenantId).replace(/[^a-zA-Z0-9_-]/g, "_");
      const safePatient = String(patientId).replace(/[^a-zA-Z0-9_-]/g, "_");
      const uid = portalSnap.exists
        ? String(portalSnap.data()?.uid || `pt_${safeTenant}_${safePatient}`)
        : `pt_${safeTenant}_${safePatient}`;

      // Garante doc portal (mínimo)
      if (!portalSnap.exists) {
        tx.set(
          portalRef,
          {
            uid,
            tenantId,
            patientId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      } else {
        tx.set(
          portalRef,
          { updatedAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        );
      }

      // Consome o código (one-time)
      tx.update(codeRef, {
        status: "consumed",
        consumedAt: admin.firestore.FieldValue.serverTimestamp(),
        consumedByUid: uid,
      });

      return { uid, tenantId, patientId };
    });

    const { uid, tenantId, patientId } = result;

    // Garante usuário no Auth e claims
    try {
      await admin.auth().getUser(uid);
    } catch (e) {
      // create if not found
      if (String(e?.code || "").includes("auth/user-not-found")) {
        await admin.auth().createUser({ uid, disabled: false });
      } else {
        throw e;
      }
    }

    const claims = { role: "patient", tenantId, patientId };

    // Persistir claims no usuário (ID token futuro)
    await admin.auth().setCustomUserClaims(uid, claims);

    // Custom token para login imediato
    const token = await admin.auth().createCustomToken(uid, claims);

    return NextResponse.json({ ok: true, token }, { status: 200 });
  } catch (e) {
    const msg = String(e?.message || "");
    const map = {
      "not-found": ["not-found", 404],
      "already-consumed": ["already-consumed", 409],
      "expired": ["expired", 410],
      "invalid-record": ["invalid-record", 500],
      "phone-mismatch": ["phone-mismatch", 401],
    };

    for (const key of Object.keys(map)) {
      if (msg.includes(key)) {
        const [err, status] = map[key];
        return NextResponse.json({ ok: false, error: err }, { status });
      }
    }

    return NextResponse.json({ ok: false, error: "internal-error" }, { status: 500 });
  }
}
