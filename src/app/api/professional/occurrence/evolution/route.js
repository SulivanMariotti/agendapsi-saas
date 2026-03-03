import { NextResponse } from "next/server";
import { getProfessionalApiSession } from "@/lib/server/getProfessionalApiSession";
import { getSessionEvolutionForOccurrence, upsertSessionEvolutionForOccurrence } from "@/lib/server/agendapsiData";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const session = await getProfessionalApiSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const occurrenceId = String(searchParams.get("occurrenceId") || "").trim();
  if (!occurrenceId) return NextResponse.json({ error: "missing_occurrenceId" }, { status: 400 });

  try {
    const result = await getSessionEvolutionForOccurrence({
      tenantId: session.tenantId,
      occurrenceId,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: "bad_request", message: e?.message || "error" },
      { status: 400 }
    );
  }
}

export async function PUT(request) {
  const session = await getProfessionalApiSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const occurrenceId = String(body?.occurrenceId || "").trim();
  if (!occurrenceId) return NextResponse.json({ error: "missing_occurrenceId" }, { status: 400 });

  const text = String(body?.text ?? body?.evolutionText ?? "");

  try {
    const result = await upsertSessionEvolutionForOccurrence({
      tenantId: session.tenantId,
      occurrenceId,
      text,
      actorUid: session.uid,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: "bad_request", message: e?.message || "error" },
      { status: 400 }
    );
  }
}
