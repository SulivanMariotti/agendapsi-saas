// src/app/api/patient/pair/route.js
import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import crypto from "crypto";
import { rateLimit } from "@/lib/server/rateLimit";
import { enforceSameOrigin } from "@/lib/server/originGuard";
import { writeHistory } from "@/lib/server/historyLog";
import { asPlainObject, enforceAllowedKeys, getString, readJsonBody } from "@/lib/server/payloadSchema";
export const runtime = "nodejs";

/**
 * POST /api/patient/pair
 *
 * Vincula o aparelho do paciente via:
 * - phone (DDD + número)
 * - pairCode (XXXX-XXXX-XXXX)
 *
 * Retorna um custom token do Firebase Auth (signInWithCustomToken),
 * criando uma sessão persistente por dispositivo (via Firebase Auth).
 *
 * Body:
 * { phone: string, code: string }
 *
 * Resposta:
 * { ok: true, token, uid }
 */

function getServiceAccount() {
  const b64 = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_B64;
  if (b64) return JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
  if (!raw) throw new Error("Missing FIREBASE_ADMIN_SERVICE_ACCOUNT(_B64) env var");
  return JSON.parse(raw);
}

function initAdmin() {
  if (admin.apps?.length) return;
  admin.initializeApp({ credential: admin.credential.cert(getServiceAccount()) });
}

function onlyDigits(v) {
  return String(v || "").replace(/\D/g, "");
}

// Canonical BR: DDD + número (10/11), SEM prefixo 55
function toPhoneCanonical(raw) {
  let d = onlyDigits(raw).replace(/^0+/, "");
  if (!d) return "";
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length === 10 || d.length === 11) return d;
  if (d.length > 11) return d.slice(-11);
  return d;
}

function normalizeCode(input) {
  return String(input || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9-]/g, "");
}

function sha256Hex(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function isInactiveUser(u) {
  const status = String(u?.status ?? "active").toLowerCase().trim();
  if (["inactive", "disabled", "archived", "deleted"].includes(status)) return true;
  if (u?.isActive === false) return true;
  if (u?.disabled === true) return true;
  if (u?.deletedAt) return true;
  if (u?.disabledAt) return true;
  if (u?.mergedTo) return true;
  return false;
}

export async function POST(req) {
  try {
    const originCheck = enforceSameOrigin(req, {
      // Fluxo de vinculação deve vir do próprio app (browser/webview).
      allowNoOrigin: false,
      allowNoOriginWithAuth: false,
      message: "Acesso bloqueado (origem inválida).",
    });
    if (!originCheck.ok) return originCheck.res;

    // Anti-abuso por IP (além do limiter por telefone)
    const rlIp = await rateLimit(req, {
      bucket: "auth:patient:pair:ip",
      global: true,
      limit: 60,
      windowMs: 15 * 60_000,
      errorMessage: "Muitas tentativas. Aguarde um pouco e tente novamente.",
    });
    if (!rlIp.ok) return rlIp.res;

    const rb = await readJsonBody(req, { maxBytes: 10_000 });
    if (!rb.ok) {
      return NextResponse.json({ ok: false, error: rb.error }, { status: 400 });
    }

    const po = asPlainObject(rb.value);
    if (!po.ok) {
      return NextResponse.json({ ok: false, error: po.error }, { status: 400 });
    }

    const ek = enforceAllowedKeys(po.value, ["phone", "code"], { showKeys: false });
    if (!ek.ok) {
      return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
    }

    const phoneRes = getString(po.value, "phone", {
      required: true,
      max: 40,
      maxBytes: 120,
      label: "Telefone",
    });
    if (!phoneRes.ok) {
      return NextResponse.json({ ok: false, error: phoneRes.error }, { status: 400 });
    }

    const codeRes = getString(po.value, "code", {
      required: true,
      max: 80,
      maxBytes: 200,
      label: "Código",
    });
    if (!codeRes.ok) {
      return NextResponse.json({ ok: false, error: codeRes.error }, { status: 400 });
    }

    const phoneRaw = phoneRes.value;
    const codeRaw = codeRes.value;

    const phoneCanonical = toPhoneCanonical(phoneRaw);
    const code = normalizeCode(codeRaw);

    if (!phoneCanonical) {
      return NextResponse.json({ ok: false, error: "Informe seu telefone (DDD + número)." }, { status: 400 });
    }
    if (!code || code.length < 10) {
      return NextResponse.json({ ok: false, error: "Informe o código de vinculação." }, { status: 400 });
    }

    // Rate limit (best-effort) para evitar tentativa de força-bruta de código.
    const rl = await rateLimit(req, {
      bucket: "auth:patient:pair",
      global: true,
      uid: phoneCanonical,
      limit: 20,
      windowMs: 15 * 60_000,
      errorMessage: "Muitas tentativas. Aguarde um pouco e tente novamente.",
    });
    if (!rl.ok) return rl.res;

    const AUTH_FAIL =
      "Não foi possível vincular. Verifique telefone e código. Se persistir, peça ajuda à clínica.";

    initAdmin();
    const db = admin.firestore();

    // Buscar usuário pelo phoneCanonical (padrão do sistema)
    let q = await db
      .collection("users")
      .where("role", "==", "patient")
      .where("phoneCanonical", "==", phoneCanonical)
      .get();

    // Fallback (legado): phoneNumber == canonical
    if (q.empty) {
      q = await db
        .collection("users")
        .where("role", "==", "patient")
        .where("phoneNumber", "==", phoneCanonical)
        .get();
    }

    if (q.empty) {
      return NextResponse.json(
        { ok: false, error: AUTH_FAIL },
        { status: 403 }
      );
    }

    // Se houver mais de um, pega o mais recente
    let chosen = null;
    q.forEach((doc) => {
      const data = doc.data() || {};
      if (!chosen) {
        chosen = { id: doc.id, data };
        return;
      }
      const a = (chosen.data?.updatedAt?.toDate?.() || chosen.data?.createdAt?.toDate?.() || new Date(0)).getTime();
      const b = (data?.updatedAt?.toDate?.() || data?.createdAt?.toDate?.() || new Date(0)).getTime();
      if (b >= a) chosen = { id: doc.id, data };
    });

    const uid = chosen.id;
    const userData = chosen.data || {};

    if (isInactiveUser(userData)) {
      return NextResponse.json(
        { ok: false, error: AUTH_FAIL },
        { status: 403 }
      );
    }

    const status = String(userData?.pairCodeStatus || "").toLowerCase().trim();
    const salt = String(userData?.pairCodeSalt || "");
    const expectedHash = String(userData?.pairCodeHash || "");

    if (!salt || !expectedHash || status !== "active") {
      return NextResponse.json(
        { ok: false, error: AUTH_FAIL },
        { status: 403 }
      );
    }

    const computed = sha256Hex(`${salt}:${code}`);

    if (computed !== expectedHash) {
      return NextResponse.json(
        { ok: false, error: AUTH_FAIL },
        { status: 403 }
      );
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const userRef = db.collection("users").doc(uid);

    // Marca o código como usado (single-use). Para outro aparelho, a clínica gera novo.
    await userRef.set(
      {
        pairCodeStatus: "used",
        pairCodeUsedAt: now,
        pairedAt: now,
        lastLogin: now,
        updatedAt: now,
        phoneCanonical,
        phone: phoneCanonical,
        phoneNumber: phoneCanonical,
      },
      { merge: true }
    );

    // Auditoria
    const ua = (req.headers.get("user-agent") || "").slice(0, 180);
    await writeHistory(db, {
      type: "patient_paired_device",
      createdAt: now,
      payload: {
        uid,
        phoneCanonical,
        userAgent: ua || null,
      },
    });

    // Retorna token para o app usar signInWithCustomToken
    const token = await admin.auth().createCustomToken(uid, { role: "patient", phoneCanonical });

    return NextResponse.json({ ok: true, token, uid });
  } catch (e) {
    console.error("[PATIENT_PAIR] Error", e);
    return NextResponse.json(
      { ok: false, error: "Erro interno. Tente novamente." },
      { status: 500 }
    );
  }
}