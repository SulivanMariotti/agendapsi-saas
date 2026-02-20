import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/server/requireAuth";
import { forbiddenOrigin } from "@/lib/server/adminError";
import { enforceSameOrigin } from "@/lib/server/originGuard";

function envBool(value, fallback = false) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "y", "on"].includes(raw)) return true;
  if (["0", "false", "no", "n", "off"].includes(raw)) return false;
  return fallback;
}

function norm(v) {
  return String(v ?? "").toLowerCase().trim();
}

function isAccessDisabledUserDoc(u) {
  // IMPORTANTE: isso é **status de acesso** (segurança), não status clínico/constância.
  // Não bloquear por "faltou", "inativo clínico", etc. Bloqueio é apenas por flag explícita.
  const accessStatus = norm(u?.accessStatus || u?.access?.status || "");
  if (["disabled", "blocked", "suspended", "hold", "security_hold"].includes(accessStatus)) return true;
  if (u?.accessDisabled === true) return true;
  if (u?.securityHold === true) return true;
  if (u?.access?.disabled === true) return true;
  if (u?.accessDisabledAt || u?.access?.disabledAt) return true;
  return false;
}

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
 * - (hardening) Opcional: bloqueia acesso quando houver flag explícita (ex.: users/{uid}.accessDisabled/securityHold)
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

  const claimRole = norm(decoded?.role || decoded?.token?.role || "");

  // Hardening: por padrão em produção, valida se o acesso do paciente NÃO está explicitamente suspenso.
// Isso NÃO tem relação com faltas/constância (clínico). Suspensão é decisão de segurança/operacional.
// ENV (novo): AUTH_ENFORCE_PATIENT_ACCESS=1|0
// ENV (legado): AUTH_ENFORCE_PATIENT_ACTIVE (tratado como alias por compatibilidade)
const enforceAccess = envBool(
  process.env.AUTH_ENFORCE_PATIENT_ACCESS,
  envBool(process.env.AUTH_ENFORCE_PATIENT_ACTIVE, process.env.NODE_ENV === "production")
);

  let userData = null;
  let roleOk = false;

  // 1) Se houver claim, valida papel.
  if (claimRole) {
    if (claimRole !== "patient") {
      return {
        ok: false,
        res: NextResponse.json(
          { ok: false, error: "Sessão não é de paciente. Faça logout e entre como paciente." },
          { status: 403 }
        ),
      };
    }
    roleOk = true;
  }

  // 2) Se não houver claim, fallback seguro no Firestore.
  if (!roleOk) {
    try {
      const userSnap = await admin.firestore().collection("users").doc(uid).get();
      userData = userSnap.exists ? (userSnap.data() || null) : null;
      const userRole = norm(userData?.role || "");
      if (userRole === "patient") roleOk = true;
    } catch (_) {
      // best-effort
    }
  }

  if (!roleOk) {
    return {
      ok: false,
      res: NextResponse.json(
        { ok: false, error: "Sessão não é de paciente. Faça logout e entre como paciente." },
        { status: 403 }
      ),
    };
  }

  // 3) Bloqueio de acesso suspenso (segurança/operacional; produção por padrão)
  if (enforceAccess) {
    try {
      if (!userData) {
        const userSnap = await admin.firestore().collection("users").doc(uid).get();
        userData = userSnap.exists ? (userSnap.data() || null) : null;
      }

      // Sem userDoc: negar (seguro), pois não conseguimos validar status.
      if (!userData) {
        return {
          ok: false,
          res: NextResponse.json(
            {
              ok: false,
              error: "Não foi possível validar seu acesso agora. Tente novamente e, se persistir, fale com a clínica.",
            },
            { status: 403 }
          ),
        };
      }

      if (isAccessDisabledUserDoc(userData)) {
        return {
          ok: false,
          res: NextResponse.json(
            {
              ok: false,
              error:
                "Seu acesso está temporariamente suspenso. Se você acredita que isso é um engano, fale com a clínica para regularizar.",
            },
            { status: 403 }
          ),
        };
      }
    } catch (_) {
      // Falha ao checar status: não vaza detalhes.
      return {
        ok: false,
        res: NextResponse.json(
          {
            ok: false,
            error: "Não foi possível validar seu acesso agora. Tente novamente em instantes.",
          },
          { status: 503 }
        ),
      };
    }
  }

  return { ok: true, uid, decoded };
}
