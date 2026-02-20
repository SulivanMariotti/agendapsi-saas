import { NextResponse } from "next/server";
import { readJsonObjectBody } from "@/lib/server/payloadSchema";
import admin from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { adminError } from "@/lib/server/adminError";
export const runtime = "nodejs";
function getServiceAccount() {
  const b64 = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_B64;
  if (b64) {
    const json = Buffer.from(b64, "base64").toString("utf-8");
    return JSON.parse(json);
  }
  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
  if (!raw) throw new Error("Missing FIREBASE_ADMIN_SERVICE_ACCOUNT(_B64) env var");
  return JSON.parse(raw);
}

function initAdmin() {
  if (admin.apps.length) return;
  const serviceAccount = getServiceAccount();
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

function onlyDigits(v) {
  return String(v || "").replace(/\D/g, "");
}

/**
 * Canonical phone for this project:
 * - DDD + número (10/11 dígitos)
 * - SEM 55
 */
function toPhoneCanonical(raw) {
  const d = onlyDigits(raw);
  if (!d) return "";
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d.slice(2);
  if (d.length === 10 || d.length === 11) return d;
  if (d.length > 11) return d.slice(-11);
  return d;
}

export async function POST(req) {
  let auth = null;
  try {
    initAdmin();

    auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const rl = await rateLimit(req, { bucket: "admin:push:status-batch", uid: auth.uid, limit: 60, windowMs: 60_000 });
    if (!rl.ok) return rl.res;


    const bodyRes = await readJsonObjectBody(req, {
      maxBytes: 60000,
      defaultValue: {},
      allowedKeys: ["phones"],
      label: "admin-push-status-batch",
      showKeys: true,
    });
    if (!bodyRes.ok) return NextResponse.json({ ok: false, error: bodyRes.error }, { status: 400 });
    const body = bodyRes.value;

    const phonesRaw = Array.isArray(body.phones) ? body.phones : [];
    const phones = phonesRaw.map(toPhoneCanonical).filter(Boolean);

    if (!phones.length) {
      return NextResponse.json({ ok: true, byPhone: {}, count: 0 });
    }

    const db = admin.firestore();
    const byPhone = {};

    const chunks = [];
    for (let i = 0; i < phones.length; i += 500) chunks.push(phones.slice(i, i + 500));

    for (const chunk of chunks) {
      const refs = chunk.map((p) => db.collection("subscribers").doc(p));
      const snaps = await db.getAll(...refs);
      snaps.forEach((snap) => {
        const phone = snap.id;
        const data = snap.exists ? snap.data() : null;
        byPhone[phone] = !!(data && data.pushToken);
      });
    }

    return NextResponse.json({ ok: true, byPhone, count: Object.keys(byPhone).length });
  } catch (err) {
    return adminError({ req, auth: auth?.ok ? auth : null, action: "push_status_batch", err });
  }
}