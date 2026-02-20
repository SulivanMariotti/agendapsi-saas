import admin from "@/lib/firebaseAdmin";
import { unauthorized } from "@/lib/server/adminError";

function envBool(value, fallback = false) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "y", "on"].includes(raw)) return true;
  if (["0", "false", "no", "n", "off"].includes(raw)) return false;
  return fallback;
}

/**
 * requireAuth(req)
 *
 * - Exige Authorization: Bearer <idToken>
 * - Valida o token via Firebase Admin
 * - (opcional) Checa revogação/disabled via verifyIdToken(..., checkRevoked)
 * - Retorna { ok: true, decoded } ou { ok: false, res }
 */

export async function requireAuth(req) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = match?.[1]?.trim();

    if (!idToken) {
      return { ok: false, res: unauthorized() };
    }

    // Hardening: revogação real de sessão em produção (pode ser desativado em dev)
    // ENV: AUTH_CHECK_REVOKED=1|0
    const checkRevoked = envBool(process.env.AUTH_CHECK_REVOKED, process.env.NODE_ENV === "production");

    const decoded = await admin.auth().verifyIdToken(idToken, checkRevoked);
    if (!decoded?.uid) {
      return { ok: false, res: unauthorized() };
    }

    return { ok: true, decoded };
  } catch (_) {
    return { ok: false, res: unauthorized() };
  }
}
