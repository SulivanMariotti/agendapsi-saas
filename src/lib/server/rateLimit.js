import { NextResponse } from "next/server";

/**
 * Simple in-memory rate limit (best-effort).
 *
 * Notes:
 * - Works per server instance (Vercel serverless can have multiple instances).
 * - Still useful to stop accidental loops and basic abuse.
 * - For strict/global limiting, use Redis/KV (future).
 */

function getStore() {
  if (!globalThis.__LP_RATE_LIMIT_STORE__) {
    globalThis.__LP_RATE_LIMIT_STORE__ = new Map();
  }
  return globalThis.__LP_RATE_LIMIT_STORE__;
}

function getClientIp(req) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}

function keyFor({ bucket, ip, uid }) {
  const parts = [String(bucket || "default"), String(ip || "unknown")];
  if (uid) parts.push(String(uid));
  return parts.join("|");
}

export async function rateLimit(req, opts = {}) {
  const {
    bucket = "default",
    limit = 60,
    windowMs = 60_000,
    uid = null,
    // Mensagem retornada ao cliente quando exceder o limite.
    // Admin pode manter o padrão (inglês) se desejar; rotas do paciente usam PT-BR.
    errorMessage = "Rate limit exceeded.",
  } = opts;

  const store = getStore();
  const ip = getClientIp(req);
  const key = keyFor({ bucket, ip, uid });

  const now = Date.now();
  const hit = store.get(key);

  if (!hit || now >= hit.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }

  const nextCount = hit.count + 1;
  hit.count = nextCount;
  store.set(key, hit);

  const remaining = Math.max(0, limit - nextCount);

  if (nextCount > limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((hit.resetAt - now) / 1000));
    const res = NextResponse.json(
      {
        ok: false,
        error: String(errorMessage || "Rate limit exceeded."),
        retryAfterSeconds,
      },
      { status: 429 }
    );
    res.headers.set("Retry-After", String(retryAfterSeconds));
    res.headers.set("X-RateLimit-Limit", String(limit));
    res.headers.set("X-RateLimit-Remaining", "0");
    return { ok: false, res };
  }

  return { ok: true, remaining };
}
