import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/server/requireAuth";
import { forbiddenOrigin } from "@/lib/server/adminError";
import { enforceSameOrigin } from "@/lib/server/originGuard";

/**
 * requirePatient(req)
 *
 * Padrão de segurança para rotas do Paciente:
 * - (CSRF/CORS hardening) Bloqueia requisições cross-site quando houver contexto de navegador.
 * - Exige Authorization: Bearer <idToken>
 * - Valida token via Firebase Admin
 * - Autoriza se:
 *   - decoded.role === 'patient'  OR
 *   - users/{uid}.role === 'patient' (fallback seguro quando claims não existem)
 *
 * Retorna { ok: true, uid, decoded } ou { ok: false, res }
 */

export async function requirePatient(req) {
  // Bloqueio de origem (CSRF/CORS hardening)
  const originCheck = enforceSameOrigin(req, {
    allowNoOrigin: false,
    allowNoOriginWithAuth: true,
    failureResponse: () => forbiddenOrigin(),
  });
  if (!originCheck.ok) return originCheck;

  const auth = await requireAuth(req);
  if (!auth.ok) return auth;

  const decoded = auth.decoded;
  const uid = decoded?.uid;

  const claimRole = String(decoded?.role || decoded?.token?.role || "").toLowerCase().trim();
  if (claimRole) {
    if (claimRole === "patient") return { ok: true, uid, decoded };
    return {
      ok: false,
      res: NextResponse.json(
        { ok: false, error: "Sessão não é de paciente. Faça logout e entre como paciente." },
        { status: 403 }
      ),
    };
  }

  // Fallback: valida no Firestore para cenários legados (claims ausentes)
  try {
    const userSnap = await admin.firestore().collection("users").doc(uid).get();
    const userRole = String(userSnap.data()?.role || "").toLowerCase().trim();
    if (userRole === "patient") return { ok: true, uid, decoded };
  } catch (_) {
    // best-effort
  }

  return {
    ok: false,
    res: NextResponse.json(
      { ok: false, error: "Sessão não é de paciente. Faça logout e entre como paciente." },
      { status: 403 }
    ),
  };
}
