import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { requirePatient } from "@/lib/server/requirePatient";
import { asPlainObject, enforceAllowedKeys, getNumber, readJsonBody } from "@/lib/server/payloadSchema";

export const runtime = "nodejs";

/**
 * POST /api/patient/contract/accept
 * Body: { version: number }
 *
 * Objetivo clínico: reduzir fricção. O contrato é parte do enquadre; aceitar não deve
 * depender de permissões client-side.
 */
export async function POST(req) {
  try {
    const rl = await rateLimit(req, {
      bucket: "patient:contract:accept",
      limit: 30,
      windowMs: 60_000,
      errorMessage: "Muitas tentativas. Aguarde um pouco e tente novamente.",
    });
    if (!rl.ok) return rl.res;

    const auth = await requirePatient(req);
    if (!auth.ok) return auth.res;

    const bodyRes = await readJsonBody(req, { maxBytes: 6_000, defaultValue: {} });
    if (!bodyRes.ok) return NextResponse.json({ ok: false, error: bodyRes.error }, { status: 400 });

    const plain = asPlainObject(bodyRes.value);
    if (!plain.ok) return NextResponse.json({ ok: false, error: plain.error }, { status: 400 });

    const keysOk = enforceAllowedKeys(plain.value, ["version"]);
    if (!keysOk.ok) return NextResponse.json({ ok: false, error: keysOk.error }, { status: 400 });

    const vRes = getNumber(plain.value, "version", { required: true, integer: true, min: 1, max: 9999, label: "Versão" });
    if (!vRes.ok) return NextResponse.json({ ok: false, error: vRes.error }, { status: 400 });

    const uid = auth.uid;

    const userRef = admin.firestore().collection("users").doc(uid);
    const snap = await userRef.get();
    const data = snap.exists ? snap.data() : {};

    const accepted = Number(data?.contractAcceptedVersion || 0);
    const nextVersion = Number(vRes.value);

    // Idempotência: se já aceitou essa versão (ou maior), apenas confirma.
    if (accepted >= nextVersion) {
      await userRef.set(
        {
          lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
          lastSeenSource: "patient_panel",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return NextResponse.json({ ok: true, version: accepted });
    }

    await userRef.set(
      {
        contractAcceptedVersion: nextVersion,
        contractAcceptedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
        lastSeenSource: "patient_panel",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, version: nextVersion });
  } catch (e) {
    console.error("[PATIENT_CONTRACT_ACCEPT] Error", e);
    return NextResponse.json({ ok: false, error: "Erro interno. Tente novamente." }, { status: 500 });
  }
}
