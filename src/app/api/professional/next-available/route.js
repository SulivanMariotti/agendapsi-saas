import { NextResponse } from "next/server";
import { getProfessionalApiSession } from "@/lib/server/getProfessionalApiSession";
import { findNextAvailableSlots } from "@/lib/server/agendapsiData";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const session = await getProfessionalApiSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const fromIsoDate = String(searchParams.get("fromDate") || "").trim();
  const fromTime = String(searchParams.get("fromTime") || "").trim();
  const blocks = searchParams.get("blocks");
  const limit = searchParams.get("limit");

  try {
    const res = await findNextAvailableSlots({
      tenantId: session.tenantId,
      fromIsoDate,
      fromTime,
      durationBlocks: blocks,
      maxDays: 30,
      limit,
    });

    // Backward compatible fields (first slot)
    const first = res?.slots?.[0] || null;
    return NextResponse.json({
      ok: true,
      found: !!first,
      isoDate: first?.isoDate || null,
      startTime: first?.startTime || null,
      durationBlocks: res?.durationBlocks,
      slots: res?.slots || [],
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "bad_request", message: e?.message || "error" }, { status: 400 });
  }
}
