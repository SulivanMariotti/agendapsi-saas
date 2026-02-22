import crypto from "crypto";

function safePart(v, max = 48) {
  const s = String(v || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

function utcStamp(d = new Date()) {
  // 2026-02-21T20:42:12.123Z -> 20260221T204212Z
  const iso = d.toISOString();
  const base = iso.replace(/\.\d{3}Z$/, "Z");
  return base.replace(/[-:]/g, "");
}

/**
 * batchId estável por execução (sem PII) para rastrear lote em history/audit.
 * Ex.: 20260221T204212Z_admin_reminders_send_7a3f9c1b
 */
export function makeBatchId(kind, suffix = "") {
  const k = safePart(kind, 64) || "batch";
  const suf = safePart(suffix, 32);
  const rand = crypto.randomBytes(4).toString("hex");
  const stamp = utcStamp();
  return suf ? `${stamp}_${k}_${suf}_${rand}` : `${stamp}_${k}_${rand}`;
}
