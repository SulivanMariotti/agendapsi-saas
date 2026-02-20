import { NextResponse } from "next/server";
import { readJsonObjectBody } from "@/lib/server/payloadSchema";
import admin from "@/lib/firebaseAdmin";
import crypto from "crypto";
import { rateLimit } from "@/lib/server/rateLimit";
import { enforceSameOrigin } from "@/lib/server/originGuard";

export const runtime = "nodejs";

function initAdmin() {
  if (admin.apps.length) return;

  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
  if (!raw) throw new Error("Missing FIREBASE_ADMIN_SERVICE_ACCOUNT env var");

  const serviceAccount = JSON.parse(raw);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

function timingSafePasswordEquals(a, b) {
  const aStr = String(a ?? "");
  const bStr = String(b ?? "");
  const aBuf = Buffer.from(aStr, "utf8");
  const bBuf = Buffer.from(bStr, "utf8");

  if (aBuf.length !== bBuf.length) {
    // Mantém comparação em tempo constante mesmo com tamanhos diferentes
    const ah = crypto.createHash("sha256").update(aBuf).digest();
    const bh = crypto.createHash("sha256").update(bBuf).digest();
    crypto.timingSafeEqual(ah, bh);
    return false;
  }

  try {
    return crypto.timingSafeEqual(aBuf, bBuf);
  } catch (_) {
    return false;
  }
}

export async function POST(req) {
  try {
    // 1) Proteção de origem (CSRF/CORS hardening)
    const originCheck = enforceSameOrigin(req, {
      // Login admin deve vir do próprio app (browser). Em produção, sem Origin/Referer => bloqueia.
      allowNoOrigin: false,
      allowNoOriginWithAuth: false,
      message: "Acesso bloqueado (origem inválida).",
    });
    if (!originCheck.ok) return originCheck.res;

    // 2) Rate limit (best-effort)
    const rl = await rateLimit(req, {
      bucket: "auth:admin:password",
      global: true,
      limit: 10,
      windowMs: 10 * 60_000,
      errorMessage: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    });
    if (!rl.ok) return rl.res;

    const bodyRes = await readJsonObjectBody(req, {
      maxBytes: 20000,
      defaultValue: {},
      allowedKeys: ["password"],
      label: "admin-auth",
      showKeys: true,
    });
    if (!bodyRes.ok) return NextResponse.json({ ok: false, error: bodyRes.error }, { status: 400 });
    const body = bodyRes.value;

    const password = String(body?.password || "");

    const expectedPassword = process.env.ADMIN_PASSWORD;
    const adminUid = process.env.ADMIN_UID;

    if (!expectedPassword || !adminUid) {
      // Configuração incorreta do servidor. Não vazar detalhes para o cliente.
      // eslint-disable-next-line no-console
      console.error("[AUTH] Missing ADMIN_PASSWORD/ADMIN_UID env");
      return NextResponse.json(
        { ok: false, error: "Configuração do servidor. Contate o administrador." },
        { status: 500 }
      );
    }

    if (!timingSafePasswordEquals(password, expectedPassword)) {
      return NextResponse.json(
        { ok: false, error: "Credenciais inválidas." },
        { status: 401 }
      );
    }

    initAdmin();
    const token = await admin
      .auth()
      .createCustomToken(adminUid, { role: "admin" });

    return NextResponse.json({ ok: true, token });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[AUTH] Error", e);
    return NextResponse.json(
      { ok: false, error: "Erro interno. Tente novamente." },
      { status: 500 }
    );
  }
}
