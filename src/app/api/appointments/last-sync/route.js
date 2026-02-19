import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/server/requireAdmin";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const cfg = await admin.firestore().collection("config").doc("global").get();
    const data = cfg.data() || {};

    const ts = data.appointmentsLastSyncAt;
    const appointmentsLastSyncAt =
      ts && typeof ts.toMillis === "function"
        ? ts.toMillis()
        : ts instanceof Date
          ? ts.getTime()
          : null;

    return NextResponse.json({
      ok: true,
      appointmentsLastSyncAt,
      appointmentsLastUploadId: data.appointmentsLastUploadId || null,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || "Erro" }, { status: 500 });
  }
}
