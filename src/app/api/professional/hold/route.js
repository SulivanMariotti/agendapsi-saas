import { NextResponse } from "next/server";
import { getProfessionalApiSession } from "@/lib/server/getProfessionalApiSession";
import { createHoldOccurrence } from "@/lib/server/agendapsiData";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const session = await getProfessionalApiSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    const res = await createHoldOccurrence({
      tenantId: session.tenantId,
      isoDate: body.isoDate,
      startTime: body.startTime,
      leadName: body.leadName,
      leadMobile: body.leadMobile,
      durationBlocks: body.durationBlocks,
      durationMin: body.durationMin,
      replicateDays: body.replicateDays,
      plannedTotalSessions: body.plannedTotalSessions,
      repeatFrequency: body.repeatFrequency,
    });
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    return NextResponse.json({ error: "bad_request", message: e?.message || "error" }, { status: 400 });
  }
}
