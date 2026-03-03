import { NextResponse } from "next/server";
import { getProfessionalApiSession } from "@/lib/server/getProfessionalApiSession";
import { listPatientOccurrenceLogs } from "@/lib/server/agendapsiData";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const session = await getProfessionalApiSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const patientId = String(searchParams.get("patientId") || "").trim();
  const limit = searchParams.get("limit");

  if (!patientId) return NextResponse.json({ error: "missing_patientId" }, { status: 400 });

  try {
    const logs = await listPatientOccurrenceLogs({
      tenantId: session.tenantId,
      patientId,
      limit,
    });
    return NextResponse.json({ ok: true, logs });
  } catch (e) {
    return NextResponse.json({ error: "bad_request", message: e?.message || "error" }, { status: 400 });
  }
}
