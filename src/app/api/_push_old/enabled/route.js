import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import crypto from "crypto";
import { writeHistory } from "@/lib/server/historyLog";
import { enforceSameOrigin } from "@/lib/server/originGuard";
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

export async function POST(req) {
  try {
    const originCheck = enforceSameOrigin(req, {
      allowNoOrigin: false,
      allowNoOriginWithAuth: true,
      message: "Acesso bloqueado (origem inválida).",
    });
    if (!originCheck.ok) return originCheck.res;

    initAdmin();

    // Auth: Bearer <firebase idToken>
    const authHeader = req.headers.get("authorization") || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = match?.[1];

    if (!idToken) {
      return NextResponse.json({ ok: false, error: "Missing Authorization token." }, { status: 401 });
    }

    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded?.uid;

    if (!uid) {
      return NextResponse.json({ ok: false, error: "Invalid token." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const phone = String(body?.phone || "").replace(/\D/g, "");
    const token = String(body?.token || "");

    if (!phone) return NextResponse.json({ ok: false, error: "Missing phone." }, { status: 400 });
    if (!token) return NextResponse.json({ ok: false, error: "Missing token." }, { status: 400 });

    // ✅ Não salvar o token bruto em logs. Apenas hash + sufixo para auditoria.
    const tokenHash = sha256(token);
    const tokenTail = token.length >= 8 ? token.slice(-8) : token;

    // PASSO 24/45: rate limit leve + dedupe (evita spam no history)
    // - Se já registrou push_enabled para esse patientId+tokenHash nos últimos 30s => 429
    // - Se já registrou o mesmo tokenHash nas últimas 24h => não duplica (retorna ok + deduped)
    const historyRef = admin.firestore().collection("history");

    const recentSnap = await historyRef
      .where("type", "==", "push_enabled")
      .where("patientId", "==", uid)
      .orderBy("createdAt", "desc")
      .limit(5)
      .get();

    const nowMs = Date.now();
    for (const d of recentSnap.docs) {
      const data = d.data() || {};
      const ts = data.createdAt;
      const createdMs =
        ts && typeof ts.toMillis === "function" ? ts.toMillis() : ts instanceof Date ? ts.getTime() : null;

      if (!createdMs) continue;

      const sameToken = String(data.tokenHash || "") === tokenHash;

      if (sameToken && nowMs - createdMs < 30_000) {
        return NextResponse.json({ ok: false, error: "Too many requests.", rateLimited: true }, { status: 429 });
      }

      if (sameToken && nowMs - createdMs < 24 * 60 * 60 * 1000) {
        return NextResponse.json({ ok: true, deduped: true });
      }
    }

    await writeHistory(admin.firestore(), {
      type: "push_enabled",
      patientId: uid,
      phone,
      tokenHash,
      tokenTail,
      userAgent: req.headers.get("user-agent") || "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e.message || "Erro" }, { status: 500 });
  }
}