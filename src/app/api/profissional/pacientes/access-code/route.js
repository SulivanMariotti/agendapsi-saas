// src/app/api/profissional/pacientes/access-code/route.js
import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { enforceSameOrigin } from "@/lib/server/originGuard";
import { getProfessionalApiSession } from "@/lib/server/getProfessionalApiSession";

export const runtime = "nodejs";

function digitsOnly(v) {
  return String(v || "").replace(/\D/g, "");
}

function random6Digits() {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
}

/**
 * POST /api/profissional/pacientes/access-code
 *
 * Gera código one-time para o paciente acessar /paciente.
 * - Exige sessão do profissional/admin via cookie (__session)
 * - O código expira (default: 15 minutos)
 *
 * Armazena em:
 *   patientAccessCodes/{code}
 */
export async function POST(req) {
  const originCheck = enforceSameOrigin(req, {
    allowNoOrigin: false,
    allowNoOriginWithAuth: true,
    failureResponse: () =>
      NextResponse.json({ ok: false, error: "forbidden-origin" }, { status: 403 }),
  });
  if (!originCheck.ok) return originCheck.res;

  const limited = await rateLimit(req, {
    keyPrefix: "prof:patient-access-code",
    windowMs: 60_000,
    max: 30,
    global: true,
  });
  if (!limited.ok) return limited.res;

  const session = await getProfessionalApiSession();
  if (!session?.tenantId || !session?.uid) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const patientId = String(body?.patientId || "").trim();
  if (!patientId) {
    return NextResponse.json({ ok: false, error: "missing-patientId" }, { status: 400 });
  }

  const tenantId = session.tenantId;

  // Confere se o paciente existe no tenant
  const patientRef = admin.firestore().doc(`tenants/${tenantId}/patients/${patientId}`);
  const patientSnap = await patientRef.get();
  if (!patientSnap.exists) {
    return NextResponse.json({ ok: false, error: "patient-not-found" }, { status: 404 });
  }

  const patientData = patientSnap.data() || {};
  const phone = patientData?.phone || patientData?.telefone || "";
  const phoneDigits = digitsOnly(phone);
  const phoneLast4 = phoneDigits.length >= 4 ? phoneDigits.slice(-4) : "";

  const now = Date.now();
  const ttlMinEnv = Number(process.env.PATIENT_ACCESS_CODE_TTL_MIN || 15);
  const ttlMin = Math.max(5, Math.min(60, Number.isFinite(ttlMinEnv) ? ttlMinEnv : 15));
  const expiresAt = new Date(now + ttlMin * 60_000);

  const baseDoc = {
    tenantId,
    patientId,
    phoneLast4: phoneLast4 || null,
    status: "active",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdByUid: session.uid,
    createdByRole: session.role,
    expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
  };

  // Tenta criar um doc com id aleatório (6 dígitos) garantindo unicidade via .create()
  for (let i = 0; i < 10; i++) {
    const code = random6Digits();
    const codeRef = admin.firestore().doc(`patientAccessCodes/${code}`);
    try {
      await codeRef.create({ code, ...baseDoc });
      return NextResponse.json(
        { ok: true, code, expiresAt: expiresAt.toISOString(), ttlMin },
        { status: 200 }
      );
    } catch (e) {
      // se já existe, tenta outro
      const msg = String(e?.message || "");
      if (msg.toLowerCase().includes("already exists")) continue;
      // Admin SDK pode lançar code=6 (ALREADY_EXISTS)
      if (String(e?.code || "") === "6") continue;
      // Outras falhas
      return NextResponse.json({ ok: false, error: "internal-error" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: false, error: "code-unavailable" }, { status: 503 });
}
