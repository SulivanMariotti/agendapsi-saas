import { NextResponse } from "next/server";
import { readJsonObjectBody } from "@/lib/server/payloadSchema";
import admin from "@/lib/firebaseAdmin";
import crypto from "crypto";
import { rateLimit } from "@/lib/server/rateLimit";
import { writeHistory } from "@/lib/server/historyLog";
import { requirePatient } from "@/lib/server/requirePatient";

export const runtime = "nodejs";

function sha256(input) {
  return crypto.createHash("sha256").update(String(input || ""), "utf8").digest("hex");
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
  try {
    const auth = await requirePatient(req);
    if (!auth.ok) return auth.res;

    const uid = auth.uid;

    const rl = await rateLimit(req, {
      bucket: "patient:push:register",
      global: true,
      uid,
      limit: 20,
      windowMs: 10 * 60_000,
      errorMessage: "Muitas tentativas. Aguarde um pouco e tente novamente.",
    });
    if (!rl.ok) return rl.res;

    const bodyRes = await readJsonObjectBody(req, {
      maxBytes: 20000,
      defaultValue: {},
      allowedKeys: ["token"],
      label: "patient-push-register",
      showKeys: true,
    });
    if (!bodyRes.ok) return NextResponse.json({ ok: false, error: bodyRes.error }, { status: 400 });
    const body = bodyRes.value;

    const token = String(body?.token || "");
    if (!token) return NextResponse.json({ ok: false, error: "Missing token." }, { status: 400 });

    const userSnap = await admin.firestore().collection("users").doc(uid).get();
    const userData = userSnap.exists ? userSnap.data() : null;

    // Aceita múltiplos campos (admin pode salvar como phoneCanonical)
    const phoneRaw =
      userData?.phoneCanonical ||
      userData?.phone ||
      userData?.phoneNumber ||
      userData?.phoneE164 ||
      "";

    const phoneCanonical = toPhoneCanonical(phoneRaw);

    if (!phoneCanonical) {
      return NextResponse.json(
        { ok: false, error: "Telefone não encontrado no seu perfil. Peça atualização ao admin." },
        { status: 400 }
      );
    }

    // Atualiza token em subscribers/{phoneCanonical} (SEM 55)
    await admin
      .firestore()
      .collection("subscribers")
      .doc(phoneCanonical)
      .set(
        {
          pushToken: token,
          lastSeen: admin.firestore.FieldValue.serverTimestamp(),
          status: "active",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    // Auditoria: não guardamos token bruto em history
    const tokenHash = sha256(token);
    const tokenTail = token.length >= 8 ? token.slice(-8) : token;

    await writeHistory(admin.firestore(), {
      type: "push_enabled",
      patientId: uid,
      phoneCanonical,
      tokenHash,
      tokenTail,
      userAgent: req.headers.get("user-agent") || "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, phoneCanonical });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: "Erro interno. Tente novamente." }, { status: 500 });
  }
}
