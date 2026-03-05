import { NextResponse } from "next/server";
import { enforceSameOrigin } from "@/lib/server/originGuard";
import { rateLimit } from "@/lib/server/rateLimit";
import { getProfessionalApiSession } from "@/lib/server/getProfessionalApiSession";
import { billingWriteBlockedMessage } from "@/lib/shared/billingText";

/**
 * requireTenantAdmin(req)
 *
 * Autorização para ações administrativas **do tenant** (owner/admin),
 * usando sessão server-side (__session) do Profissional.
 *
 * - (CSRF/CORS hardening) Bloqueia requisições cross-site (browser-facing)
 * - Exige sessão válida (cookie)
 * - Autoriza apenas roles: owner | admin
 * - Aplica rateLimit (por bucket + uid)
 * - Aplica billing gating (bloqueio de writes quando aplicável)
 *
 * Retorna:
 *  - { ok: true, session }
 *  - { ok: false, res }
 */
export async function requireTenantAdmin(req, opts = {}) {
  const { bucket = "tenant-admin:default", limit = 60, windowMs = 60_000 } = opts;

  const originCheck = enforceSameOrigin(req, {
    // Aqui não há Bearer auth; bloqueia chamadas sem origem em produção.
    allowNoOrigin: false,
    allowNoOriginWithAuth: false,
  });
  if (!originCheck.ok) return originCheck;

  const session = await getProfessionalApiSession();
  if (!session) {
    return { ok: false, res: NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 }) };
  }

  if (!["owner", "admin"].includes(String(session.role || ""))) {
    return { ok: false, res: NextResponse.json({ ok: false, error: "Acesso negado." }, { status: 403 }) };
  }

  const rl = await rateLimit(req, { bucket, uid: session.uid, limit, windowMs });
  if (!rl.ok) return rl;

  const inferredWrite = !["GET", "HEAD", "OPTIONS"].includes(String(req.method || "GET").toUpperCase());
  if (inferredWrite && session?.billing && session.billing.writeAllowed === false) {
    const msg = billingWriteBlockedMessage(session.billing, { scope: "Alterações" });
    return {
      ok: false,
      res: NextResponse.json(
        {
          ok: false,
          error: msg,
          code: "BILLING_WRITE_BLOCKED",
          legacyCode: "BILLING_STATUS_BLOCKED",
          billing: session.billing,
        },
        { status: 403 }
      ),
    };
  }

  return { ok: true, session };
}
