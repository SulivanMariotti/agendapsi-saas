import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { requirePatient } from "@/lib/server/requirePatient";

export const runtime = "nodejs";

/**
 * GET /api/patient/appointments
 *
 * Objetivo clínico (UX): garantir que o paciente SEMPRE consiga ver a própria agenda
 * (sem erros de permission-denied), reduzindo fricção e aumentando constância.
 *
 * Segurança:
 * - Authorization Bearer (idToken)
 * - role patient (estrito; fallback users/{uid}.role)
 * - Resolve phone pelo users/{uid} e/ou claims
 * - Sem impersonação/override (produção)
 */

function onlyDigits(v) {
  return String(v || "").replace(/\D/g, "");
}

/**
 * Canonical phone (projeto): DDD + número (10/11 dígitos), SEM 55
 */
function toPhoneCanonical(raw) {
  let d = onlyDigits(raw).replace(/^0+/, "");
  if (!d) return "";
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length === 10 || d.length === 11) return d;
  if (d.length > 11) return d.slice(-11);
  return d;
}

function serializeFirestoreValue(v) {
  if (v == null) return v;
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.toDate === "function") return v.toDate().getTime();
  if (v instanceof Date) return v.getTime();
  if (Array.isArray(v)) return v.map(serializeFirestoreValue);
  if (typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = serializeFirestoreValue(val);
    return out;
  }
  return v;
}

export async function GET(req) {
  try {
    const rl = await rateLimit(req, {
      bucket: "patient:appointments",
      limit: 180,
      windowMs: 60_000,
      errorMessage: "Muitas requisições. Aguarde um pouco e tente novamente.",
    });
    if (!rl.ok) return rl.res;

    const auth = await requirePatient(req);
    if (!auth.ok) return auth.res;

    const decoded = auth.decoded;
    const uid = auth.uid;

    const userRef = admin.firestore().collection("users").doc(uid);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : {};

    const claimPhone =
      decoded?.phoneCanonical || decoded?.patientPhone || decoded?.phone || decoded?.phone_number || "";

    const phoneCanonical = toPhoneCanonical(
      userData?.phoneCanonical ||
        userData?.phone ||
        userData?.phoneNumber ||
        userData?.phoneE164 ||
        claimPhone ||
        ""
    );

    const email = String(decoded?.email || userData?.email || "").trim().toLowerCase();

    if (!phoneCanonical && !email) {
      return NextResponse.json(
        { ok: false, error: "Não foi possível identificar seu cadastro (telefone/e-mail)." },
        { status: 400 }
      );
    }

    const col = admin.firestore().collection("appointments");
    const q = phoneCanonical
      ? col.where("phone", "==", phoneCanonical).orderBy("isoDate", "asc").limit(250)
      : col.where("email", "==", email).orderBy("isoDate", "asc").limit(250);

    const snap = await q.get();

    const appointments = snap.docs.map((d) => {
      const data = d.data() || {};
      return { id: d.id, ...serializeFirestoreValue(data) };
    });

    return NextResponse.json({ ok: true, appointments });
  } catch (e) {
    console.error("[PATIENT_APPOINTMENTS] Error", e);
    return NextResponse.json({ ok: false, error: "Erro interno. Tente novamente." }, { status: 500 });
  }
}
