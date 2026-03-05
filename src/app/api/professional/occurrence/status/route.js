import { NextResponse } from "next/server";
import { requireProfessionalApi } from "@/lib/server/requireProfessionalApi";
import { updateOccurrenceStatus, ALLOWED_STATUS } from "@/lib/server/agendapsiData";

export const dynamic = "force-dynamic";

export async function PATCH(request) {
  const auth = await requireProfessionalApi(request, { bucket: "professional:occurrence-status", limit: 60, windowMs: 60_000 });
  if (!auth.ok) return auth.res;
  const session = auth.session;
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    const result = await updateOccurrenceStatus({
      tenantId: session.tenantId,
      occurrenceId: body.occurrenceId,
      status: body.status,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      {
        error: "bad_request",
        message: e?.message || "error",
        allowed: ALLOWED_STATUS,
      },
      { status: 400 }
    );
  }
}
