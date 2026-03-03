import { NextResponse } from "next/server";
import { getProfessionalApiSession } from "@/lib/server/getProfessionalApiSession";
import { getProfessionalWeekData, resolveIsoDate } from "@/lib/server/agendapsiData";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const session = await getProfessionalApiSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const isoDate = resolveIsoDate({ date: searchParams.get("date") });

  const data = await getProfessionalWeekData({ tenantId: session.tenantId, isoDate });
  return NextResponse.json(data);
}
