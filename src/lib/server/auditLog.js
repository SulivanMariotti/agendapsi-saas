import admin from "@/lib/firebaseAdmin";

function getClientIp(req) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}

function getPath(req) {
  try {
    const url = new URL(req.url);
    return url.pathname;
  } catch (_) {
    return "";
  }
}

function shouldRedactKey(k) {
  return /(password|token|secret|private|key)/i.test(String(k || ""));
}

function truncateString(s, max = 400) {
  const str = String(s ?? "");
  if (str.length <= max) return str;
  return str.slice(0, max) + "...";
}

function sanitizeMeta(meta) {
  if (!meta || typeof meta !== "object") return null;
  const out = {};
  for (const [k, v] of Object.entries(meta)) {
    if (shouldRedactKey(k)) continue;
    if (v == null) {
      out[k] = null;
      continue;
    }
    if (typeof v === "string") {
      out[k] = truncateString(v, 400);
      continue;
    }
    if (typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
      continue;
    }
    // objects/arrays
    try {
      out[k] = truncateString(JSON.stringify(v), 800);
    } catch (_) {
      out[k] = "[unserializable]";
    }
  }
  return out;
}

function toInt(v, defVal) {
  const n = parseInt(String(v || ""), 10);
  return Number.isFinite(n) ? n : defVal;
}

function getAuditRetentionDays() {
  // Keep longer than history; admin accountability.
  return Math.max(30, toInt(process.env.AUDIT_RETENTION_DAYS, 365));
}

function buildExpireAt(days) {
  const d = Math.max(1, toInt(days, 365));
  const ms = Date.now() + d * 24 * 60 * 60 * 1000;
  return admin.firestore.Timestamp.fromDate(new Date(ms));
}

/**
 * Admin audit log (server-side).
 * Stores a minimal record for accountability and troubleshooting.
 *
 * Collection: audit_logs
 */
export async function logAdminAudit({
  req,
  actorUid,
  actorEmail,
  action,
  target = null,
  status = "success",
  meta = null,
}) {
  try {
    const db = admin.firestore();
    const ip = getClientIp(req);
    const ua = truncateString(req.headers.get("user-agent") || "", 200);
    const path = getPath(req);

    const doc = {
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expireAt: buildExpireAt(getAuditRetentionDays()),
      actorUid: actorUid || null,
      actorEmail: actorEmail || null,
      action: String(action || "").slice(0, 120),
      status: String(status || "success").slice(0, 40),
      target: target ? truncateString(target, 200) : null,
      ip,
      ua,
      method: (req.method || "").toUpperCase(),
      path,
      meta: sanitizeMeta(meta),
    };

    await db.collection("audit_logs").add(doc);
  } catch (_) {
    // never break the main request because of audit logging
  }
}
