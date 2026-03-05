import { NextResponse } from "next/server";
import { enforceSameOrigin } from "@/lib/server/originGuard";
import { rateLimit } from "@/lib/server/rateLimit";
import { getProfessionalApiSession } from "@/lib/server/getProfessionalApiSession";
import { billingWriteBlockedMessage } from "@/lib/shared/billingText";

/**
 * requireProfessionalApi(req, opts)
 *
 * Segurança padrão para rotas /api/professional/*
 * - (CSRF/CORS hardening) bloqueia cross-site em produção (cookie-based)
 * - exige sessão server-side (__session) e tenant ativo
 * - aplica rate limit (por bucket + uid)
 * - aplica billing gating (bloqueio de writes quando aplicável)
 *
 * Retorna:
 *  - { ok: true, session }
 *  - { ok: false, res }
 */
export async function requireProfessionalApi(req, opts = {}) {
  const { bucket = "professional:default", limit = 240, windowMs = 60_000 } = opts;

  const originCheck = enforceSameOrigin(req, {
    // cookie-based (sem Bearer): em produção, não permite requests sem Origin/Referer.
    allowNoOrigin: false,
    allowNoOriginWithAuth: false,
  });
  if (!originCheck.ok) return originCheck;

  const session = await getProfessionalApiSession();
  if (!session) {
    return { ok: false, res: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  const rl = await rateLimit(req, { bucket, uid: session.uid, limit, windowMs });
  if (!rl.ok) return rl;

  const inferredWrite =
    opts?.write === true ||
    (opts?.write == null && !["GET", "HEAD", "OPTIONS"].includes(String(req.method || "GET").toUpperCase()));

  if (inferredWrite && session?.billing && session.billing.writeAllowed === false) {
    const msg = billingWriteBlockedMessage(session.billing, { scope: "Ações de criação/alteração" });
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
