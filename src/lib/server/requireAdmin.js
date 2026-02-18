import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/server/requireAuth";
import { forbiddenOrigin } from "@/lib/server/adminError";
import { enforceSameOrigin } from "@/lib/server/originGuard";

/**
 * requireAdmin(req)
 *
 * Padrão de segurança para rotas sensíveis (Admin):
 * - (CSRF/CORS hardening) Bloqueia requisições cross-site quando houver contexto de navegador.
 * - Exige Authorization: Bearer <idToken>
 * - Valida token via Firebase Admin
 * - Autoriza se:
 *   - decoded.role === 'admin'  OR decoded.admin === true
 *
 * Retorna { ok: true, uid, decoded } ou { ok: false, res }
 */

export async function requireAdmin(req) {
  // Bloqueio de origem (CSRF/CORS hardening)
  const originCheck = enforceSameOrigin(req, {
    // Admin usa Bearer token; permite server-to-server sem Origin quando autenticado
    allowNoOrigin: false,
    allowNoOriginWithAuth: true,
    failureResponse: () => forbiddenOrigin(),
  });
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
