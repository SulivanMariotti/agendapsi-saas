// src/app/api/patient-auth/route.js
import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { enforceSameOrigin } from "@/lib/server/originGuard";
export const runtime = "nodejs";
/**
 * Patient Login (email) - server-side (Firebase Admin)
 *
 * BUGFIXES:
 * - Autoriza consultando `users` (role == "patient") pelo email cadastrado no Admin.
 * - Bloqueia se paciente estiver inativo.
 * - Resistente a duplicidades antigas de `users` com o mesmo email:
 *   escolhe o doc "melhor" (prioriza o que tem telefone/phoneCanonical) para evitar
 *   casos em que o paciente entra num doc legado sem telefone.
 * - Se o doc escolhido estiver sem `phoneCanonical`, tenta preencher automaticamente
 *   (copiando de outro doc ativo com mesmo email ou derivando de campos existentes).
 *
 * Resposta:
 *   { ok: true, token, uid, phoneCanonical? }
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

function hasAnyPhone(data) {
  return Boolean(
    String(data?.phoneCanonical || "").trim() ||
      String(data?.phone || "").trim() ||
      String(data?.phoneNumber || "").trim() ||
      String(data?.phoneE164 || "").trim()
  );
}

function pickBestUserDoc(items) {
  // Score:
  // - +1000 se tem telefone (evita escolher doc legado vazio)
  // - -100 se está marcado como mergedTo (por segurança)
  // - +recência (updatedAt/createdAt)
  let best = null;

  for (const item of items) {
    const d = item?.data || {};
    const hasPhone = hasAnyPhone(d);
    const isMerged = Boolean(d.mergedTo);
    const recency = toMillis(d.updatedAt) || toMillis(d.createdAt) || 0;

    // normaliza recência para não dominar totalmente a pontuação
    const score = (hasPhone ? 1000 : 0) + (isMerged ? -100 : 0) + recency / 1_000_000_000;

    if (!best || score > best.score) best = { ...item, score };
  }

  return best;
}

export async function POST(req) {
  try {
    const originCheck = enforceSameOrigin(req, {
      // Endpoint inseguro (email) - se habilitado, deve aceitar apenas mesma origem.
      allowNoOrigin: false,
      allowNoOriginWithAuth: false,
      message: "Acesso bloqueado (origem inválida).",
    });
    if (!originCheck.ok) return originCheck.res;

    // Rate limit (mesmo desativado por padrão, evita abuso quando habilitado em testes)
    const rl = await rateLimit(req, {
      bucket: "auth:patient:email",
      limit: 10,
      windowMs: 10 * 60_000,
      errorMessage: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    });
    if (!rl.ok) return rl.res;

    // 🔒 Segurança: login por e-mail do paciente é INSEGURO sem verificação (OTP/Magic Link).
    // Mantemos o endpoint apenas para testes controlados e legado.
    // Em produção, deixe DESATIVADO (padrão). Para habilitar conscientemente, set:
    //   ENABLE_INSECURE_PATIENT_EMAIL_LOGIN="true"
    const enabled = String(process.env.ENABLE_INSECURE_PATIENT_EMAIL_LOGIN || "").toLowerCase() === "true";
    if (!enabled) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Login por e-mail está desativado por segurança. Use telefone + código de vinculação fornecido pela clínica.",
        },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ ok: false, error: "E-mail inválido." }, { status: 400 });
    }

    initAdmin();

    const db = admin.firestore();

    // Authorize based on users collection (Admin cadastro)
    const q = await db
      .collection("users")
      .where("role", "==", "patient")
      .where("email", "==", email)
      .get();

    if (q.empty) {
      return NextResponse.json(
        { ok: false, error: "E-mail não autorizado. Solicite cadastro à clínica." },
        { status: 403 }
      );
    }

    const candidates = q.docs.map((doc) => ({ id: doc.id, data: doc.data() || {} }));
    const activeCandidates = candidates.filter((c) => !isInactiveUser(c.data));

    if (!activeCandidates.length) {
      return NextResponse.json(
        { ok: false, error: "Cadastro inativo. Fale com a clínica para reativação." },
        { status: 403 }
      );
    }

    // Escolher o melhor doc para evitar cair em duplicado sem telefone
    const chosen = pickBestUserDoc(activeCandidates) || activeCandidates[0];
    const uid = chosen.id;
    const userData = chosen.data || {};

    // Garantir phoneCanonical no doc escolhido (se possível)
    let phoneCanonical = toPhoneCanonical(
      userData?.phoneCanonical || userData?.phone || userData?.phoneNumber || userData?.phoneE164 || ""
    );

    if (!phoneCanonical) {
      // tenta copiar de outro doc ativo com mesmo email
      for (const c of activeCandidates) {
        const d = c?.data || {};
        const probe = toPhoneCanonical(d?.phoneCanonical || d?.phone || d?.phoneNumber || d?.phoneE164 || "");
        if (probe) {
          phoneCanonical = probe;
          break;
        }
      }
    }

    // Update lastLogin + (opcional) phoneCanonical/phone
    const now = admin.firestore.FieldValue.serverTimestamp();
    const patch = { lastLogin: now, updatedAt: now };

    if (phoneCanonical) {
      const existingPc = toPhoneCanonical(userData?.phoneCanonical || "");
      const existingFromPhone = toPhoneCanonical(userData?.phone || "");

      if (!existingPc || existingPc !== phoneCanonical) patch.phoneCanonical = phoneCanonical;
      // manter `phone` consistente com o que as rules usam (comparação com appointments.resource.data.phone)
      if (!existingFromPhone || existingFromPhone !== phoneCanonical) patch.phone = phoneCanonical;
    }

    await db.collection("users").doc(uid).set(patch, { merge: true });

    // Custom token with claims (keeps email for client convenience)
    const token = await admin.auth().createCustomToken(uid, { role: "patient", email });

    return NextResponse.json({ ok: true, token, uid, phoneCanonical: phoneCanonical || null });
  } catch (e) {
    console.error("[PATIENT_AUTH_EMAIL] Error", e);
    return NextResponse.json(
      { ok: false, error: "Erro interno. Tente novamente." },
      { status: 500 }
    );
  }
}