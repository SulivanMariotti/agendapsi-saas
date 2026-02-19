import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { requirePatient } from "@/lib/server/requirePatient";

export const runtime = "nodejs";

/**
 * POST /api/patient/ping
 *
 * Objetivo clínico (UX): manter o painel responsivo e estável sem depender de writes
 * client-side no Firestore (que podem gerar permission-denied e fricção).
 *
 * Segurança:
 * - requirePatient (idToken + role)
 * - rate limit
 */
export async function POST(req) {
  try {
    const rl = await rateLimit(req, {
      bucket: "patient:ping",
      limit: 60,
      windowMs: 60_000,
      errorMessage: "Muitas tentativas. Aguarde um pouco e tente novamente.",
    });
    if (!rl.ok) return rl.res;

    const auth = await requirePatient(req);
    if (!auth.ok) return auth.res;

    const uid = auth.uid;

    await admin
      .firestore()
      .collection("users")
      .doc(uid)
      .set(
        {
          lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
          lastSeenSource: "patient_panel",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[PATIENT_PING] Error", e);
    return NextResponse.json({ ok: false, error: "Erro interno. Tente novamente." }, { status: 500 });
  }
}
