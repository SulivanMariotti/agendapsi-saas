import { NextResponse } from "next/server";
import { requireProfessionalApi } from "@/lib/server/requireProfessionalApi";
import { createAppointmentAtSlot } from "@/lib/server/agendapsiData";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const auth = await requireProfessionalApi(request, { bucket: "professional:appointment", limit: 60, windowMs: 60_000 });
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
    const res = await createAppointmentAtSlot({
      tenantId: session.tenantId,
      isoDate: body.isoDate,
      startTime: body.startTime,
      fullName: body.fullName,
      cpf: body.cpf,
      mobile: body.mobile,
      durationBlocks: body.durationBlocks,
      durationMin: body.durationMin,
      plannedTotalSessions: body.plannedTotalSessions,
      repeatFrequency: body.repeatFrequency,
      fromHoldOccurrenceId: body.fromHoldOccurrenceId,
    });
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    if (e?.code === "PLAN_LIMIT_EXCEEDED") {
      return NextResponse.json(
        {
          ok: false,
          error: e?.message || "Limite do plano atingido.",
          code: "PLAN_LIMIT_EXCEEDED",
          planId: e?.planId || null,
          limitKey: e?.limitKey || null,
          limit: e?.limit || null,
        },
        { status: 403 }
      );
    }

    const code = e?.code === "SLOT_OCCUPIED" ? 409 : 400;
    return NextResponse.json({ error: "bad_request", message: e?.message || "error" }, { status: code });
  }
}
