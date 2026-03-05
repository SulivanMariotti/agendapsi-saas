import { NextResponse } from "next/server";
import { requireProfessionalApi } from "@/lib/server/requireProfessionalApi";
import { getProfessionalWeekData, resolveIsoDate } from "@/lib/server/agendapsiData";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await requireProfessionalApi(request, { bucket: "professional:week", limit: 240, windowMs: 60_000 });
  if (!auth.ok) return auth.res;
  const session = auth.session;
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const isoDate = resolveIsoDate({ date: searchParams.get("date") });

  const data = await getProfessionalWeekData({ tenantId: session.tenantId, isoDate });
  return NextResponse.json(data);
}
