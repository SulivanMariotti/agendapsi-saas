import admin from "@/lib/firebaseAdmin";

// Centralized history logging with PII minimization + retention.
// Collection: history (read/write admin-only by Firestore rules)

function toInt(v, defVal) {
  const n = parseInt(String(v || ""), 10);
  return Number.isFinite(n) ? n : defVal;
}

function onlyDigits(v) {
  return String(v || "").replace(/\D/g, "");
}

function phoneTail(phoneLike) {
  const d = onlyDigits(phoneLike);
  if (!d) return null;
  const tail = d.slice(-4);
  if (!tail) return null;
  return tail;
}

function maskPhone(phoneLike) {
  const tail = phoneTail(phoneLike);
  if (!tail) return null;
  return `***${tail}`;
}

function maskEmail(email) {
  const e = String(email || "").trim();
  const at = e.indexOf("@");
  if (at <= 0) return null;
  const user = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (!domain) return null;
  const head = user ? user[0] : "*";
  return `${head}***@${domain}`;
}

function truncate(s, max) {
  const str = String(s ?? "");
  if (str.length <= max) return str;
  return str.slice(0, max) + "...";
}

function shouldRedactKey(k) {
  const key = String(k || "");
  // Allow tokenHash/tokenTail, but redact raw token.
  if (/token/i.test(key) && !/(hash|tail)/i.test(key)) return true;
  if (/password|secret|private|key/i.test(key)) return true;
  return false;
}

function sanitizeValue(key, val, depth) {
  if (val == null) return null;
  if (depth > 3) return null;

  const k = String(key || "");

  if (shouldRedactKey(k)) return "[redacted]";

  // Normalize common PII fields
  if (/email/i.test(k) && typeof val === "string") return maskEmail(val) || null;
  if (/(phone|cel|telefone)/i.test(k) && typeof val === "string") return maskPhone(val) || null;
  if (/useragent|ua/i.test(k) && typeof val === "string") return truncate(val, 200);

  if (typeof val === "string") return truncate(val, 600);
  if (typeof val === "number" || typeof val === "boolean") return val;

  if (Array.isArray(val)) {
    return val.slice(0, 30).map((x) => sanitizeValue(k, x, depth + 1));
  }

  if (typeof val === "object") {
    const out = {};
    for (const [kk, vv] of Object.entries(val)) {
      out[kk] = sanitizeValue(kk, vv, depth + 1);
    }
    return out;
  }

  return String(val);
}

function sanitizeDoc(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) {
    if (k === "createdAt" || k === "expireAt") {
      out[k] = v;
      continue;
    }
    out[k] = sanitizeValue(k, v, 0);
  }

  // Keep helpful derived fields (masked) if raw values were present
  const phRaw = fields?.phoneCanonical || fields?.phone || fields?.phoneNumber || null;
  const emRaw = fields?.email || null;
  if (phRaw && !out.phoneCanonical) out.phoneCanonical = maskPhone(phRaw);
  if (emRaw && !out.email) out.email = maskEmail(emRaw);

  return out;
}

function buildExpireAt(days) {
  const d = Math.max(1, toInt(days, 180));
  const ms = Date.now() + d * 24 * 60 * 60 * 1000;
  return admin.firestore.Timestamp.fromDate(new Date(ms));
}

export function getHistoryRetentionDays() {
  return Math.max(7, toInt(process.env.HISTORY_RETENTION_DAYS, 180));
}

/**
 * Writes a history log document with:
 * - createdAt (serverTimestamp)
 * - expireAt (Timestamp for Firestore TTL or cron purge)
 * - PII minimization (masked phone/email, redacted tokens)
 */
export async function writeHistory(db, fields) {
  try {
    if (!db || typeof db.collection !== "function") return;
    const type = String(fields?.type || fields?.action || "").trim();
    if (!type) return;

    const createdAt = fields?.createdAt || admin.firestore.FieldValue.serverTimestamp();
    const expireAt = fields?.expireAt || buildExpireAt(getHistoryRetentionDays());

    const safe = sanitizeDoc({ ...fields, type, createdAt, expireAt });

    await db.collection("history").add(safe);
  } catch (_) {
    // Never break main request because of history logging
  }
}

export { maskPhone, maskEmail, phoneTail };
