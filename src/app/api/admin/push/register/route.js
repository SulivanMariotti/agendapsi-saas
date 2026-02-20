import { NextResponse } from "next/server";
import { readJsonObjectBody } from "@/lib/server/payloadSchema";
import admin from "@/lib/firebaseAdmin";
import crypto from "crypto";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { logAdminAudit } from "@/lib/server/auditLog";
import { adminError } from "@/lib/server/adminError";
import { writeHistory } from "@/lib/server/historyLog";
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

function sha256(input) {
  return crypto.createHash("sha256").update(String(input || ""), "utf8").digest("hex");
}

function onlyDigits(v) {
  return String(v || "").replace(/\D/g, "");
}

export async function POST(req) {
  let auth = null;
  try {
    initAdmin();

    auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;
    const uid = auth.uid;

    const rl = await rateLimit(req, {
      bucket: "admin:push:register",
      uid,
      limit: 60,
      windowMs: 60_000,
    });
    if (!rl.ok) return rl.res;


    const bodyRes = await readJsonObjectBody(req, {
      maxBytes: 20000,
      defaultValue: {},
      allowedKeys: ["token"],
      label: "admin-push-register",
      showKeys: true,
    });
    if (!bodyRes.ok) return NextResponse.json({ ok: false, error: bodyRes.error }, { status: 400 });
    const body = bodyRes.value;

    const token = String(body?.token || "");
    if (!token) return NextResponse.json({ ok: false, error: "Missing token." }, { status: 400 });

    const userSnap = await admin.firestore().collection("users").doc(uid).get();
    const userData = userSnap.exists ? userSnap.data() : null;

    const phone = onlyDigits(userData?.phone || userData?.phoneNumber || "");
    if (!phone) {
      return NextResponse.json(
        { ok: false, error: "Telefone não encontrado no seu perfil. Peça atualização ao admin." },
        { status: 400 }
      );
    }

    // Atualiza token em subscribers/{phone}
    await admin
      .firestore()
      .collection("subscribers")
      .doc(phone)
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
      phone,
      tokenHash,
      tokenTail,
      userAgent: req.headers.get("user-agent") || "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await logAdminAudit({
      req,
      actorUid: uid,
      actorEmail: auth.decoded?.email || null,
      action: "push_register",
      target: phone,
    });

    return NextResponse.json({ ok: true, phone });
  } catch (e) {
    return adminError({ req, auth: auth?.ok ? auth : null, action: "push_register", err: e });
  }
}