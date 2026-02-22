import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { requirePatient } from "@/lib/server/requirePatient";
import { readJsonObjectBody } from "@/lib/server/payloadSchema";

export const runtime = "nodejs";

/**
 * DELETE /api/patient/notes/:id
 */
export async function DELETE(req, ctx) {
  const bodyRes = await readJsonObjectBody(req, {
    allowedKeys: [],
    maxBytes: 2_000,
    defaultValue: {},
    label: "patient:notes:delete",
    showKeys: false,
  });
  if (!bodyRes.ok) {
    return NextResponse.json({ ok: false, error: bodyRes.error }, { status: 400 });
  }

  try {
    const rl = await rateLimit(req, {
      bucket: "patient:notes:delete",
      limit: 45,
      windowMs: 60_000,
      errorMessage: "Muitas tentativas. Aguarde um pouco e tente novamente.",
    });
    if (!rl.ok) return rl.res;

    const auth = await requirePatient(req);
    if (!auth.ok) return auth.res;

    const uid = auth.uid;
    // Em alguns ambientes/bundlers, `ctx.params` pode vir indefinido.
    // Fallback: extrai o ID diretamente do pathname.
    const fromCtx = String(ctx?.params?.id || "").trim();
    const fromUrl = (() => {
      try {
        const u = new URL(req.url);
        const parts = u.pathname.split("/").filter(Boolean);
        const last = parts[parts.length - 1] || "";
        return decodeURIComponent(String(last || "").trim());
      } catch {
        return "";
      }
    })();
    const id = (fromCtx || fromUrl || "").trim();
    if (!id) return NextResponse.json({ ok: false, error: "ID inválido." }, { status: 400 });

    const ref = admin.firestore().collection("patient_notes").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: "Nota não encontrada." }, { status: 404 });

    const data = snap.data() || {};
    if (String(data?.patientId || "") !== String(uid)) {
      return NextResponse.json({ ok: false, error: "Nota não encontrada." }, { status: 404 });
    }

    await ref.delete();

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[PATIENT_NOTES_DELETE] Error", e);
    return NextResponse.json({ ok: false, error: "Erro interno. Tente novamente." }, { status: 500 });
  }
}