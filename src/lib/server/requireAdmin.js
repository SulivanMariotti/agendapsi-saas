import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/server/requireAuth";
import { forbiddenOrigin } from "@/lib/server/adminError";

/**
 * requireAdmin(req)
 *
 * Padrão de segurança para rotas sensíveis (Admin):
 * - (CORS/CSRF) Bloqueia requisições com Origin diferente do host atual.
 * - Exige Authorization: Bearer <idToken>
 * - Valida token via Firebase Admin
 * - Autoriza se:
 *   - decoded.role === 'admin'  OR decoded.admin === true
 *
 * Retorna { ok: true, uid, decoded } ou { ok: false, res }
 */

function getExpectedOrigin(req) {
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (!host) return null;
  return `${proto}://${host}`;
}

function enforceSameOrigin(req) {
  const origin = req.headers.get("origin");
  // Se não houver Origin, geralmente é server-to-server (permitir).
  if (!origin) return { ok: true };

  const expected = getExpectedOrigin(req);
  if (!expected) return { ok: true };

  if (origin !== expected) {
    return { ok: false, res: forbiddenOrigin() };
  }

  return { ok: true };
}

export async function requireAdmin(req) {
  // Bloqueio de origem (CSRF/CORS hardening)
  const originCheck = enforceSameOrigin(req);
  if (!originCheck.ok) return originCheck;

  const auth = await requireAuth(req);
  if (!auth.ok) return auth;

  const decoded = auth.decoded;
  const uid = decoded.uid;

  const claimRole = String(decoded?.role || "").toLowerCase();
  const claimAdmin = decoded?.admin === true;
  if (claimRole === "admin" || claimAdmin) {
    return { ok: true, uid, decoded };
  }

  return {
    ok: false,
    res: NextResponse.json({ ok: false, error: "Acesso restrito ao Admin." }, { status: 403 }),
  };
}
