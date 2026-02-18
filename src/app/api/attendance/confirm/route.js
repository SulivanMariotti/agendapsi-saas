import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
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

function getBearerToken(req) {
  const authHeader = req.headers.get("authorization") || "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  return m?.[1] || "";
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

    const idToken = getBearerToken(req);
    if (!idToken) {
      return NextResponse.json({ ok: false, error: "Missing Authorization token." }, { status: 401 });
    }

    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded?.uid;
    if (!uid) {
      return NextResponse.json({ ok: false, error: "Invalid token." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const appointmentId = String(body?.appointmentId || "").trim();
    const phone = String(body?.phone || "").replace(/\D/g, "");
    const channel = String(body?.channel || "web").trim() || "web";

    if (!appointmentId) {
      return NextResponse.json({ ok: false, error: "Missing appointmentId." }, { status: 400 });
    }
    if (!phone) {
      return NextResponse.json({ ok: false, error: "Missing phone." }, { status: 400 });
    }

    const db = admin.firestore();

    // PASSO 18/45: Deduplicação + rate limit leve (evita spam / múltiplos cliques)
    // 1) Bloqueia confirmações repetidas para o mesmo appointmentId + uid
    const existingSnap = await db
      .collection("attendance_logs")
      .where("eventType", "==", "patient_confirmed")
      .where("appointmentId", "==", appointmentId)
      .where("patientId", "==", uid)
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      return NextResponse.json({ ok: true, alreadyConfirmed: true });
    }

    // 2) Rate limit: se confirmou outra sessão há menos de 30s, bloqueia (protege contra double-click)
    const recentSnap = await db
      .collection("attendance_logs")
      .where("eventType", "==", "patient_confirmed")
      .where("patientId", "==", uid)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    if (!recentSnap.empty) {
      const last = recentSnap.docs[0].data()?.createdAt?.toDate?.();
      if (last) {
        const diffMs = Date.now() - last.getTime();
        if (diffMs < 30_000) {
          return NextResponse.json(
            { ok: false, error: "Aguarde alguns segundos e tente novamente." },
            { status: 429 }
          );
        }
      }
    }

    await db.collection("attendance_logs").add({
      eventType: "patient_confirmed",
      appointmentId,
      patientId: uid,
      phone,
      channel,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, alreadyConfirmed: false });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || "Erro" }, { status: 500 });
  }
}