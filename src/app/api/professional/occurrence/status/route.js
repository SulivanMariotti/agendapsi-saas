import { NextResponse } from "next/server";
import { getProfessionalApiSession } from "@/lib/server/getProfessionalApiSession";
import { updateOccurrenceStatus, ALLOWED_STATUS } from "@/lib/server/agendapsiData";

export const dynamic = "force-dynamic";

export async function PATCH(request) {
  const session = await getProfessionalApiSession();
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
