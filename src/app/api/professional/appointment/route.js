import { NextResponse } from "next/server";
import { getProfessionalApiSession } from "@/lib/server/getProfessionalApiSession";
import { createAppointmentAtSlot } from "@/lib/server/agendapsiData";

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
    const res = await createAppointmentAtSlot({
      tenantId: session.tenantId,
      isoDate: body.isoDate,
      startTime: body.startTime,
      fullName: body.fullName,
      cpf: body.cpf,
      mobile: body.mobile,
      durationBlocks: body.durationBlocks,
      durationMin: body.durationMin,
      durationMin: body.durationMin,
    });
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    const code = e?.code === "SLOT_OCCUPIED" ? 409 : 400;
    return NextResponse.json({ error: "bad_request", message: e?.message || "error" }, { status: code });
  }
}
