import { NextResponse } from "next/server";
import { requireProfessionalApi } from "@/lib/server/requireProfessionalApi";
import { createHoldOccurrence } from "@/lib/server/agendapsiData";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const auth = await requireProfessionalApi(request, { bucket: "professional:hold", limit: 60, windowMs: 60_000 });
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

    return NextResponse.json({ error: "bad_request", message: e?.message || "error" }, { status: 400 });
  }
}
