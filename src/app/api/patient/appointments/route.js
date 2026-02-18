import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";

/**
 * GET /api/patient/appointments
 *
 * Objetivo clínico (UX): garantir que o paciente SEMPRE consiga ver a própria agenda
 * (sem erros de permission-denied), reduzindo fricção e aumentando constância.
 *
 * Segurança:
 * - Authorization Bearer (idToken)
 * - role patient
 * - Resolve phone pelo users/{uid} e/ou claims
 * - Sem impersonação/override (produção)
 */

function getServiceAccount() {
  const b64 = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_B64;
  if (b64) {
    const json = Buffer.from(b64, "base64").toString("utf-8");
    return JSON.parse(json);
  }
  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
  if (!raw) throw new Error("Missing FIREBASE_ADMIN_SERVICE_ACCOUNT(_B64) env var");
  return JSON.parse(raw);
}

function initAdmin() {
  if (admin.apps?.length) return;
  const serviceAccount = getServiceAccount();
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

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

    initAdmin();

    const authHeader = req.headers.get("authorization") || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = match?.[1];

    if (!idToken) {
      return NextResponse.json({ ok: false, error: "Missing Authorization token." }, { status: 401 });
    }

    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded?.uid;
    if (!uid) return NextResponse.json({ ok: false, error: "Invalid token." }, { status: 401 });

    const role = String(decoded?.role || decoded?.token?.role || "").toLowerCase().trim();
    if (role && role !== "patient") {
      return NextResponse.json(
        { ok: false, error: "Sessão não é de paciente. Faça logout e entre como paciente." },
        { status: 403 }
      );
    }

    const userRef = admin.firestore().collection("users").doc(uid);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : {};

    const claimPhone =
      decoded?.phoneCanonical || decoded?.patientPhone || decoded?.phone || decoded?.phone_number || "";

    const phoneCanonical =
      toPhoneCanonical(
        userData?.phoneCanonical || userData?.phone || userData?.phoneNumber || userData?.phoneE164 || claimPhone || ""
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
    return NextResponse.json(
      { ok: false, error: "Erro interno. Tente novamente." },
      { status: 500 }
    );
  }
}
