import admin from "@/lib/firebaseAdmin";
import crypto from "crypto";

/**
 * tenantInvites (Owner invite flow)
 *
 * Estratégia:
 * - token "raw" só aparece no link (retornado uma vez para o Super Admin).
 * - Firestore guarda somente o tokenHash (sha256 hex) como docId.
 *
 * Coleção global: tenantInvites/{tokenHash}
 */
function sha256Hex(input) {
  return crypto.createHash("sha256").update(String(input)).digest("hex");
}

function randToken() {
  // 32 bytes -> base64url
  return crypto.randomBytes(32).toString("base64url");
}

function norm(v) {
  return String(v ?? "").trim();
}

function emailLower(v) {
  return norm(v).toLowerCase();
}

export function hashInviteToken(rawToken) {
  const t = norm(rawToken);
  if (!t) return "";
  return sha256Hex(t);
}

export function getInviteTtlHours() {
  const raw = Number(process.env.OWNER_INVITE_TTL_HOURS || "72");
  if (!Number.isFinite(raw) || raw <= 0) return 72;
  return Math.min(Math.max(Math.floor(raw), 1), 24 * 30); // max 30 dias
}

export function buildInviteLink({ token }) {
  const base = process.env.NEXT_PUBLIC_APP_URL || ""; // opcional, fallback para relativo
  const q = new URLSearchParams({ token: String(token) });
  const path = `/invite?${q.toString()}`;
  if (!base) return path;
  try {
    const u = new URL(base);
    return `${u.origin}${path}`;
  } catch {
    return path;
  }
}

export function maskEmail(email) {
  const e = emailLower(email);
  if (!e || !e.includes("@")) return "";
  const [u, d] = e.split("@");
  const uMasked = u.length <= 2 ? `${u[0] || "*"}*` : `${u.slice(0, 2)}***`;
  const dParts = d.split(".");
  const d0 = dParts[0] || "";
  const dMasked = d0.length <= 2 ? `${d0[0] || "*"}*` : `${d0.slice(0, 2)}***`;
  const dTail = dParts.length > 1 ? "." + dParts.slice(1).join(".") : "";
  return `${uMasked}@${dMasked}${dTail}`;
}

export async function createTenantInvite({ tenantId, email, role = "owner", createdByUid }) {
  const db = admin.firestore();
  const token = randToken();
  const tokenHash = hashInviteToken(token);

  const ttlHours = getInviteTtlHours();
  const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + ttlHours * 60 * 60 * 1000));

  const ref = db.collection("tenantInvites").doc(tokenHash);

  await ref.set(
    {
      type: "tenantOwner",
      status: "pending",
      tenantId: norm(tenantId),
      emailLower: emailLower(email),
      role: String(role || "owner"),
      createdByUid: norm(createdByUid) || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt,
    },
    { merge: false }
  );

  return { token, tokenHash, expiresAt, ref };
}

export async function getTenantInviteByToken(rawToken) {
  const tokenHash = hashInviteToken(rawToken);
  if (!tokenHash) return null;
  const db = admin.firestore();
  const ref = db.collection("tenantInvites").doc(tokenHash);
  const snap = await ref.get();
  if (!snap.exists) return { ref, tokenHash, data: null };
  return { ref, tokenHash, data: snap.data() || {} };
}

export function isInviteExpired(inviteData) {
  const exp = inviteData?.expiresAt;
  if (!exp) return false;
  try {
    const d = exp.toDate ? exp.toDate() : new Date(exp);
    return d.getTime() < Date.now();
  } catch {
    return false;
  }
}
