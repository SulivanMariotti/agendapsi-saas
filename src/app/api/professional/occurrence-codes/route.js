import { NextResponse } from "next/server";
import { requireProfessionalApi } from "@/lib/server/requireProfessionalApi";
import { listOccurrenceCodes } from "@/lib/server/agendapsiData";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await requireProfessionalApi(request, { bucket: "professional:occurrence-codes", limit: 120, windowMs: 60_000 });
  if (!auth.ok) return auth.res;
  const session = auth.session;
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get("activeOnly") !== "0";

  try {
    const codes = await listOccurrenceCodes({ tenantId: session.tenantId, activeOnly });
    return NextResponse.json({ ok: true, codes });
  } catch (e) {
    return NextResponse.json(
      { error: "bad_request", message: e?.message || "error" },
      { status: 400 }
    );
  }
}
