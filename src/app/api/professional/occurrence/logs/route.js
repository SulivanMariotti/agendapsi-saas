import { NextResponse } from "next/server";
import { requireProfessionalApi } from "@/lib/server/requireProfessionalApi";
import { createOccurrenceLogForOccurrence, listOccurrenceLogsForOccurrence } from "@/lib/server/agendapsiData";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await requireProfessionalApi(request, { bucket: "professional:occurrence-logs", limit: 180, windowMs: 60_000 });
  if (!auth.ok) return auth.res;
  const session = auth.session;
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const occurrenceId = String(searchParams.get("occurrenceId") || "").trim();
  const limit = searchParams.get("limit");

  if (!occurrenceId) return NextResponse.json({ error: "missing_occurrenceId" }, { status: 400 });

  try {
    const logs = await listOccurrenceLogsForOccurrence({
      tenantId: session.tenantId,
      occurrenceId,
      limit,
    });
    return NextResponse.json({ ok: true, logs });
  } catch (e) {
    return NextResponse.json({ error: "bad_request", message: e?.message || "error" }, { status: 400 });
  }
}

export async function POST(request) {
  const auth = await requireProfessionalApi(request, { bucket: "professional:occurrence-logs", limit: 180, windowMs: 60_000 });
  if (!auth.ok) return auth.res;
  const session = auth.session;
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const occurrenceId = String(body?.occurrenceId || "").trim();
  const codeId = String(body?.codeId || "").trim();
  const description = String(body?.description || "");

  if (!occurrenceId) return NextResponse.json({ error: "missing_occurrenceId" }, { status: 400 });
  if (!codeId) return NextResponse.json({ error: "missing_codeId" }, { status: 400 });

  try {
    const result = await createOccurrenceLogForOccurrence({
      tenantId: session.tenantId,
      occurrenceId,
      codeId,
      description,
      actorUid: session.uid,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: "bad_request", message: e?.message || "error" }, { status: 400 });
  }
}
