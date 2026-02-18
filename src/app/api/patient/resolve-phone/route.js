import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
export const runtime = "nodejs";
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
  if (admin.apps.length) return;
  const serviceAccount = getServiceAccount();
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

function onlyDigits(v) {
  return String(v || "").replace(/\D/g, "");
}

function isInactiveUser(u) {
  const status = String(u?.status ?? "active").toLowerCase().trim();
  if (["inactive", "disabled", "archived", "deleted", "merged"].includes(status)) return true;
  if (u?.isActive === false) return true;
  if (u?.disabled === true) return true;
  if (u?.deletedAt) return true;
  if (u?.disabledAt) return true;
  if (u?.mergedTo) return true;
  return false;
}

function toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.toDate === "function") return ts.toDate().getTime();
  if (ts instanceof Date) return ts.getTime();
  const n = Date.parse(String(ts));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Canonical phone for this project:
 * - DDD + número (10/11 dígitos)
 * - SEM 55
 */
function toPhoneCanonical(raw) {
  const d = onlyDigits(raw);
  if (!d) return "";
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d.slice(2);
  if (d.length === 10 || d.length === 11) return d;
  if (d.length > 11) return d.slice(-11);
  return d;
}

export async function GET(req) {
  try {
    const rl = await rateLimit(req, {
      bucket: "patient:resolve-phone",
      limit: 60,
      windowMs: 60_000,
      errorMessage: "Muitas tentativas. Aguarde um pouco e tente novamente.",
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

    const userRef = admin.firestore().collection("users").doc(uid);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : {};

    const email =
      String(decoded?.email || "").trim().toLowerCase() ||
      String(userData?.email || "").trim().toLowerCase() ||
      "";

    const role = String(decoded?.role || userData?.role || "").toLowerCase().trim();
    if (role && role !== "patient") {
      return NextResponse.json(
        { ok: false, error: "Sessão não é de paciente. Faça logout e entre como paciente." },
        { status: 403 }
      );
    }

    // Aceita múltiplos campos possíveis (inclui custom claims dos custom tokens)
    const claimPhoneRaw =
      decoded?.phoneCanonical ||
      decoded?.patientPhone ||
      decoded?.phone ||
      decoded?.phone_number ||
      "";

    const phoneRaw =
      userData?.phoneCanonical ||
      userData?.phone ||
      userData?.phoneNumber ||
      userData?.phoneE164 ||
      claimPhoneRaw ||
      "";

    let phoneCanonical = toPhoneCanonical(phoneRaw);

    // Fallback 2: se o doc atual não tem telefone, tenta resolver pelo EMAIL
    // (casos legados: doc antigo sem phone/phoneCanonical)
    if (!phoneCanonical && email) {
      const q = await admin
        .firestore()
        .collection("users")
        .where("role", "==", "patient")
        .where("email", "==", email)
        .get();

      // Preferir o mais atualizado e que tenha telefone válido
      let best = null;
      q.forEach((doc) => {
        const d = doc.data() || {};
        if (isInactiveUser(d)) return;

        const raw = d?.phoneCanonical || d?.phone || d?.phoneNumber || d?.phoneE164 || "";
        const cand = toPhoneCanonical(raw);
        if (!cand) return;

        const score = toMillis(d?.updatedAt) || toMillis(d?.createdAt);
        if (!best || score >= best.score) best = { phoneCanonical: cand, score, uid: doc.id };
      });

      if (best?.phoneCanonical) phoneCanonical = best.phoneCanonical;
    }

    if (!phoneCanonical) {
      return NextResponse.json(
        { ok: false, error: "Telefone não encontrado. Peça atualização ao admin." },
        { status: 400 }
      );
    }

    // Garante consistência no users/{uid}
    await userRef.set(
      {
        phoneCanonical,
        phone: phoneCanonical,
        phoneNumber: phoneCanonical,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, phoneCanonical });
  } catch (err) {
    console.error("[PATIENT_RESOLVE_PHONE] Error", err);
    return NextResponse.json(
      { ok: false, error: "Erro interno. Tente novamente." },
      { status: 500 }
    );
  }
}