import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { requirePatient } from "@/lib/server/requirePatient";
import { asPlainObject, enforceAllowedKeys, getString, readJsonBody } from "@/lib/server/payloadSchema";

export const runtime = "nodejs";

function toMillis(ts) {
  if (!ts) return null;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.toDate === "function") return ts.toDate().getTime();
  if (ts instanceof Date) return ts.getTime();
  const n = Date.parse(String(ts));
  return Number.isFinite(n) ? n : null;
}

async function getUserPhoneCanonical(uid) {
  try {
    const snap = await admin.firestore().collection("users").doc(uid).get();
    const u = snap.exists ? snap.data() : {};
    return String(u?.phoneCanonical || u?.phone || u?.phoneNumber || "").replace(/\D/g, "");
  } catch {
    return "";
  }
}

/**
 * GET /api/patient/notes
 * Retorna notas do paciente (server-side) para evitar permission-denied no client.
 */
export async function GET(req) {
  try {
    const rl = await rateLimit(req, {
      bucket: "patient:notes:list",
      limit: 90,
      windowMs: 60_000,
      errorMessage: "Muitas requisições. Aguarde um pouco e tente novamente.",
    });
    if (!rl.ok) return rl.res;

    const auth = await requirePatient(req);
    if (!auth.ok) return auth.res;

    const uid = auth.uid;

    const snap = await admin
      .firestore()
      .collection("patient_notes")
      .where("patientId", "==", uid)
      .limit(250)
      .get();

    const notes = snap.docs
      .map((d) => {
        const data = d.data() || {};
        return {
          id: d.id,
          content: String(data?.content || ""),
          createdAtMs: toMillis(data?.createdAt) || 0,
          updatedAtMs: toMillis(data?.updatedAt) || null,
        };
      })
      .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));

    return NextResponse.json({ ok: true, notes });
  } catch (e) {
    console.error("[PATIENT_NOTES_LIST] Error", e);
    return NextResponse.json({ ok: false, error: "Erro interno. Tente novamente." }, { status: 500 });
  }
}

/**
 * POST /api/patient/notes
 * Body: { content: string }
 */
export async function POST(req) {
  try {
    const rl = await rateLimit(req, {
      bucket: "patient:notes:write",
      limit: 45,
      windowMs: 60_000,
      errorMessage: "Muitas tentativas. Aguarde um pouco e tente novamente.",
    });
    if (!rl.ok) return rl.res;

    const auth = await requirePatient(req);
    if (!auth.ok) return auth.res;

    const bodyRes = await readJsonBody(req, { maxBytes: 12_000, defaultValue: {} });
    if (!bodyRes.ok) return NextResponse.json({ ok: false, error: bodyRes.error }, { status: 400 });

    const plain = asPlainObject(bodyRes.value);
    if (!plain.ok) return NextResponse.json({ ok: false, error: plain.error }, { status: 400 });

    const keysOk = enforceAllowedKeys(plain.value, ["content"]);
    if (!keysOk.ok) return NextResponse.json({ ok: false, error: keysOk.error }, { status: 400 });

    const cRes = getString(plain.value, "content", {
      required: true,
      trim: true,
      min: 1,
      max: 4000,
      maxBytes: 8000,
      label: "Conteúdo",
    });
    if (!cRes.ok) return NextResponse.json({ ok: false, error: cRes.error }, { status: 400 });

    const uid = auth.uid;

    const phoneCanonical = await getUserPhoneCanonical(uid);

    const ref = await admin.firestore().collection("patient_notes").add({
      patientId: uid,
      phone: phoneCanonical || "",
      content: cRes.value,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (e) {
    console.error("[PATIENT_NOTES_CREATE] Error", e);
    return NextResponse.json({ ok: false, error: "Erro interno. Tente novamente." }, { status: 500 });
  }
}
