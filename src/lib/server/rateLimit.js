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
