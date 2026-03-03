import { NextResponse } from "next/server";
import { getProfessionalApiSession } from "@/lib/server/getProfessionalApiSession";
import { deleteOccurrence } from "@/lib/server/agendapsiData";

export const dynamic = "force-dynamic";

export async function DELETE(request) {
  const session = await getProfessionalApiSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    const result = await deleteOccurrence({
      tenantId: session.tenantId,
      occurrenceId: body.occurrenceId,
      scope: body.scope,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      {
        error: "bad_request",
        message: e?.message || "error",
      },
      { status: 400 }
    );
  }
}
