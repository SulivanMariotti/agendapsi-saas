import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { requirePatient } from "@/lib/server/requirePatient";

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

export async function GET(req) {
  try {
    const auth = await requirePatient(req);
    if (!auth.ok) return auth.res;

    const uid = auth.uid;

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
      return NextResponse.json({ ok: true, confirmed, appointmentIds: confirmed ? [appointmentId] : [] }, { status: 200 });
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
    // Hardening: em produção, não vazar mensagens internas.
    const isProd = process.env.NODE_ENV === "production";
    const errorMsg = isProd ? "Falha ao carregar confirmações." : e?.message || "Erro";

    return NextResponse.json({ ok: false, confirmed: false, appointmentIds: [], error: errorMsg }, { status: 200 });
  }
}
