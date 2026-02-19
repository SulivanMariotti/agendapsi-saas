import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { requirePatient } from "@/lib/server/requirePatient";

export const runtime = "nodejs";

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

export async function GET(req) {
  try {
    const auth = await requirePatient(req);
    if (!auth.ok) return auth.res;

    const uid = auth.uid;

    const rl = await rateLimit(req, {
      bucket: "patient:push:status",
      global: true,
      uid,
      limit: 120,
      windowMs: 60_000,
      errorMessage: "Muitas requisições. Aguarde um pouco e tente novamente.",
    });
    if (!rl.ok) return rl.res;

    const userSnap = await admin.firestore().collection("users").doc(uid).get();
    const userData = userSnap.exists ? userSnap.data() : null;

    const phoneRaw =
      userData?.phoneCanonical ||
      userData?.phone ||
      userData?.phoneNumber ||
      userData?.phoneE164 ||
      "";

    const phoneCanonical = toPhoneCanonical(phoneRaw);

    if (!phoneCanonical) {
      return NextResponse.json({ ok: true, hasToken: false, reason: "missing_phone" });
    }

    const subSnap = await admin.firestore().collection("subscribers").doc(phoneCanonical).get();
    const sub = subSnap.exists ? subSnap.data() : null;

    return NextResponse.json({
      ok: true,
      hasToken: Boolean(sub?.pushToken),
      status: sub?.status || null,
      phoneCanonical,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || "Erro" }, { status: 500 });
  }
}
