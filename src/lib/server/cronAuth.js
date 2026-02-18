import { NextResponse } from "next/server";
import crypto from "crypto";

// Centralized auth for cron routes.
// Goal: header-only in production (no secrets in URLs/logs).
// Supported headers:
//  - Authorization: Bearer <secret>
//  - x-cron-secret: <secret>
// Optional legacy fallback (disabled by default): ?key=<secret>

function toStr(v) {
  return String(v == null ? "" : v).trim();
}

function splitSecrets(raw) {
  return toStr(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function getAllowedSecrets() {
  const list = splitSecrets(process.env.CRON_SECRETS);
  if (list.length) return list;
  const single = toStr(process.env.CRON_SECRET);
  return single ? [single] : [];
}

function safeEqual(a, b) {
  const aa = Buffer.from(toStr(a));
  const bb = Buffer.from(toStr(b));
  if (!aa.length || !bb.length) return false;
  if (aa.length !== bb.length) return false;
  try {
    return crypto.timingSafeEqual(aa, bb);
  } catch {
    return false;
  }
}

function extractProvidedSecret(req) {
  const auth = toStr(req.headers.get("authorization"));
  if (auth.toLowerCase().startsWith("bearer ")) {
    return { secret: toStr(auth.slice(7)), source: "authorization" };
  }

  const x = toStr(req.headers.get("x-cron-secret"));
  if (x) return { secret: x, source: "x-cron-secret" };

  // Legacy query fallback (disabled by default)
  const url = new URL(req.url);
  const q = toStr(url.searchParams.get("key"));
  if (q) return { secret: q, source: "query" };

  return { secret: "", source: "none" };
}

function canUseQueryFallback() {
  const flag = toStr(process.env.ALLOW_CRON_QUERY_KEY).toLowerCase();
  if (["1", "true", "yes", "y"].includes(flag)) return true;
  // Dev convenience only (still discouraged)
  if (process.env.NODE_ENV !== "production") return true;
  return false;
}

function deny(reason = "unauthorized") {
  return NextResponse.json({ ok: false, error: reason }, { status: 401 });
}

export function requireCron(req) {
  const allowed = getAllowedSecrets();
  if (!allowed.length) {
    // Misconfiguration should be loud and explicit.
    return NextResponse.json({ ok: false, error: "Missing CRON_SECRET/CRON_SECRETS env" }, { status: 500 });
  }

  const provided = extractProvidedSecret(req);

  // If the caller used query param but it's disallowed, deny with a specific error
  // so operators can fix scheduler configuration.
  if (provided.source === "query" && !canUseQueryFallback()) {
    console.warn("[cron] denied: query key not allowed", {
      path: new URL(req.url).pathname,
      ip: toStr(req.headers.get("x-forwarded-for")),
      ua: toStr(req.headers.get("user-agent")),
    });
    return deny("query_key_not_allowed");
  }

  const ok = allowed.some((s) => safeEqual(s, provided.secret));
  if (!ok) {
    console.warn("[cron] denied: bad secret", {
      path: new URL(req.url).pathname,
      source: provided.source,
      ip: toStr(req.headers.get("x-forwarded-for")),
      ua: toStr(req.headers.get("user-agent")),
    });
    return deny();
  }

  return null;
}
