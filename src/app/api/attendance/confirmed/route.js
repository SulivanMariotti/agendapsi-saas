import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/server/requireAuth";

export const runtime = "nodejs";

/**
 * GET /api/attendance/confirmed
 *
 * Objetivo clínico (UX):
 * - Mostrar ao paciente o status de "confirmação" de presença (para reforçar compromisso)
 *   sem depender de leituras client-side que gerem permission-denied.
 * - Evitar cliques repetidos e sustentar constância.
 *
 * Como usar (query params):
 * - (opcional) appointmentId: retorna confirmed (boolean) para esse id.
 *
 * Retorno:
 * - Sem appointmentId: { ok: true, appointmentIds: string[] }
 * - Com appointmentId: { ok: true, confirmed: boolean, appointmentIds: string[] }
 *
 * Observação clínica/produto:
 * - Não cria reagendamento/cancelamento.
 * - Apenas reflete confirmações registradas em attendance_logs (eventType=patient_confirmed).
 */

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

export async function GET(req) {
  try {
    initAdmin();

    const auth = await requireAuth(req);
    if (!auth.ok) return auth.res;

    const uid = String(auth.decoded?.uid || "").trim();
    if (!uid) {
      return NextResponse.json(
        { ok: false, confirmed: false, appointmentIds: [], error: "Invalid token." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const appointmentId = (searchParams.get("appointmentId") || "").trim();

    const db = admin.firestore();

    // 1) Checagem pontual (próxima sessão)
    if (appointmentId) {
      const snap = await db
        .collection("attendance_logs")
        .where("eventType", "==", "patient_confirmed")
        .where("patientId", "==", uid)
        .where("appointmentId", "==", appointmentId)
        .limit(1)
        .get();

      const confirmed = !snap.empty;
      return NextResponse.json(
        { ok: true, confirmed, appointmentIds: confirmed ? [appointmentId] : [] },
        { status: 200 }
      );
    }

    // 2) Lista (para chips na agenda)
    // Evita orderBy para não exigir índice composto; limit protege custo.
    const snap = await db
      .collection("attendance_logs")
      .where("eventType", "==", "patient_confirmed")
      .where("patientId", "==", uid)
      .limit(250)
      .get();

    const uniq = new Set();
    snap.forEach((d) => {
      const data = d.data() || {};
      const id = String(data.appointmentId || "").trim();
      if (id) uniq.add(id);
    });

    return NextResponse.json({ ok: true, appointmentIds: Array.from(uniq) }, { status: 200 });
  } catch (e) {
    console.error("GET /api/attendance/confirmed error:", e);
    // Retornar 200 com ok:false evita loops no client e mantém UX estável.
    return NextResponse.json(
      { ok: false, confirmed: false, appointmentIds: [], error: e?.message || "Erro" },
      { status: 200 }
    );
  }
}
