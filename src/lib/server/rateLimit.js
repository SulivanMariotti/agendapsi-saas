import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import crypto from "crypto";

/**
 * Rate limit helper
 *
 * Default: in-memory (best-effort).
 * Optional: Firestore-backed "global" limiter (serverless-safe across instances).
 *
 * Why global:
 * - In serverless (Vercel), memory limiter resets per instance and can be bypassed.
 * - For critical endpoints (auth/pair/confirm), Firestore-backed limiting is safer.
 *
 * Notes about Firestore:
 * - Uses collection: `_rate_limits`
 * - Writes a short-lived doc per (bucket + ip + uid + windowStart)
 * - Adds `expireAt` (Timestamp) for TTL cleanup (recommended)
 */

function getMemoryStore() {
  if (!globalThis.__LP_RATE_LIMIT_STORE__) {
    globalThis.__LP_RATE_LIMIT_STORE__ = new Map();
  }
  return globalThis.__LP_RATE_LIMIT_STORE__;
}

function parseForwardedHeader(forwarded) {
  // RFC 7239: Forwarded: for=1.2.3.4;proto=https;by=...
  // Examples:
  // - for=203.0.113.43
  // - for="[2001:db8:cafe::17]:4711"
  // - for=unknown
  const s = String(forwarded || "");
  const m = s.match(/for=([^;]+)/i);
  if (!m) return "";
  let v = String(m[1] || "").trim();
  // Strip quotes
  v = v.replace(/^\s*\"|\"\s*$/g, "");
  return v;
}

function normalizeIpCandidate(raw) {
  let ip = String(raw || "").trim();
  if (!ip) return "";

  // In x-forwarded-for, it can be a list
  ip = ip.split(",")[0].trim();
  if (!ip) return "";

  if (ip.toLowerCase() === "unknown") return "";

  // Strip quotes
  ip = ip.replace(/^\s*\"|\"\s*$/g, "");

  // Forwarded header can include brackets for IPv6
  // [2001:db8::1]:1234
  if (ip.startsWith("[") && ip.includes("]")) {
    const inside = ip.slice(1, ip.indexOf("]"));
    ip = inside;
  } else {
    // Remove port for IPv4 like 1.2.3.4:1234
    // Avoid breaking pure IPv6 (which contains :)
    const colonCount = (ip.match(/:/g) || []).length;
    if (colonCount <= 1) ip = ip.replace(/:\d+$/, "");
  }

  // IPv6 mapped IPv4: ::ffff:1.2.3.4
  if (ip.startsWith("::ffff:")) ip = ip.slice("::ffff:".length);

  // Lowercase IPv6
  if (ip.includes(":")) ip = ip.toLowerCase();

  // Basic hygiene: keep only safe chars
  ip = ip.replace(/[^0-9a-fA-F:\.]/g, "");

  // Keep bounded
  if (ip.length > 64) ip = ip.slice(0, 64);

  return ip;
}

function isPrivateIp(ip) {
  const s = String(ip || "").trim().toLowerCase();
  if (!s) return true;
  if (s === "unknown") return true;

  // IPv4 private / loopback
  const m4 = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m4) {
    const a = Number(m4[1]);
    const b = Number(m4[2]);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    return false;
  }

  // IPv6 loopback / unique-local
  if (s === "::1") return true;
  if (s.startsWith("fc") || s.startsWith("fd")) return true; // fc00::/7
  return false;
}

function fallbackPseudoIp(req) {
  // When infra headers aren't present (local/dev) we still want a stable limiter key.
  const ua = String(req.headers.get("user-agent") || "");
  const al = String(req.headers.get("accept-language") || "");
  const seed = (ua + "|" + al).slice(0, 256);
  if (!seed.trim()) return "unknown";
  return "ua_" + sha256Hex(seed).slice(0, 16);
}

function getClientIp(req) {
  // Prefer infra headers (CDN/proxy). Keep a stable, normalized key.
  const forwarded = parseForwardedHeader(req.headers.get("forwarded"));
  const candidates = [
    req.headers.get("cf-connecting-ip"),
    req.headers.get("x-forwarded-for"),
    req.headers.get("x-real-ip"),
    forwarded,
  ].filter(Boolean);

  let ip = "";
  for (const c of candidates) {
    const n = normalizeIpCandidate(c);
    if (!n) continue;
    ip = n;
    break;
  }

  // If first candidate is private/loopback, try next (common behind proxies)
  if (ip && isPrivateIp(ip)) {
    for (const c of candidates) {
      const n = normalizeIpCandidate(c);
      if (!n) continue;
      if (isPrivateIp(n)) continue;
      ip = n;
      break;
    }
  }

  if (!ip) ip = fallbackPseudoIp(req);

  // Keep bounded
  if (ip.length > 64) ip = ip.slice(0, 64);
  return ip;
}

function keyFor({ bucket, ip, uid }) {
  const parts = [String(bucket || "default"), String(ip || "unknown")];
  if (uid) parts.push(String(uid));
  return parts.join("|");
}

function sha256Hex(input) {
  return crypto.createHash("sha256").update(String(input || ""), "utf8").digest("hex");
}

function safeDocPrefix(bucket) {
  // Firestore doc id cannot contain "/" and should be small.
  return String(bucket || "default")
    .replace(/[^a-zA-Z0-9:_-]/g, "_")
    .slice(0, 80);
}

function shouldUseFirestore(opts = {}) {
  if (opts.store === "firestore") return true;
  if (opts.global === true) return true;

  const env = String(process.env.LP_RATE_LIMIT_STORE || "").toLowerCase().trim();
  if (env === "firestore") return true;

  return false;
}

async function rateLimitMemory(req, opts = {}) {
  const {
    bucket = "default",
    limit = 60,
    windowMs = 60_000,
    uid = null,
    errorMessage = "Rate limit exceeded.",
  } = opts;

  const store = getMemoryStore();
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

async function rateLimitFirestore(req, opts = {}) {
  const {
    bucket = "default",
    limit = 60,
    windowMs = 60_000,
    uid = null,
    errorMessage = "Rate limit exceeded.",
  } = opts;

  const ip = getClientIp(req);
  const key = keyFor({ bucket, ip, uid });
  const keyHash = sha256Hex(key);

  const now = Date.now();
  const windowStart = Math.floor(now / windowMs);
  const resetAtMs = (windowStart + 1) * windowMs;

  const prefix = safeDocPrefix(bucket);
  const docId = `${prefix}__${keyHash.slice(0, 32)}__${windowStart}`;

  const db = admin.firestore();
  const ref = db.collection("_rate_limits").doc(docId);

  // Keep docs alive just enough for TTL cleanup:
  // - resetAt + up to 24h (prevents indefinite growth if TTL isn't configured yet).
  const extraTtlMs = Math.min(24 * 60 * 60_000, Math.max(windowMs, 60_000));
  const expireAtMs = resetAtMs + extraTtlMs;

  const nextCount = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists ? Number(snap.data()?.count || 0) : 0;
    const n = prev + 1;

    const patch = {
      bucket: String(bucket || "default"),
      keyHash,
      windowStart,
      windowMs,
      count: n,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expireAt: admin.firestore.Timestamp.fromMillis(expireAtMs),
    };

    if (!snap.exists) {
      patch.createdAt = admin.firestore.FieldValue.serverTimestamp();
    }

    tx.set(ref, patch, { merge: true });
    return n;
  });

  const remaining = Math.max(0, limit - nextCount);

  if (nextCount > limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAtMs - now) / 1000));
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

export async function rateLimit(req, opts = {}) {
  // Prefer Firestore only when explicitly requested (critical endpoints),
  // to avoid unnecessary reads/writes for high-frequency endpoints.
  if (shouldUseFirestore(opts)) {
    try {
      return await rateLimitFirestore(req, opts);
    } catch (e) {
      // Fail-open (with memory limiter) to avoid breaking core flows
      // if Firestore/Admin credentials are momentarily unavailable.
      return await rateLimitMemory(req, opts);
    }
  }

  return await rateLimitMemory(req, opts);
}
