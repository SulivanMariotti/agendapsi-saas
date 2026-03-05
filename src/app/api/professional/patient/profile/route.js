import { NextResponse } from "next/server";
import { requireProfessionalApi } from "@/lib/server/requireProfessionalApi";
import { readJsonObjectBody } from "@/lib/server/payloadSchema";
import { getPatientProfile, updatePatientProfile } from "@/lib/server/agendapsiData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await requireProfessionalApi(request, { bucket: "professional:patient-profile:get", limit: 240, windowMs: 60_000 });
  if (!auth.ok) return auth.res;

  const session = auth.session;
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const patientId = String(searchParams.get("patientId") || "").trim();
  if (!patientId) return NextResponse.json({ ok: false, error: "missing_patientId" }, { status: 400 });

  try {
    const patient = await getPatientProfile({ tenantId: session.tenantId, patientId });
    return NextResponse.json({ ok: true, patient }, { status: 200 });
  } catch (e) {
    const code = e?.code === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ ok: false, error: "bad_request", message: e?.message || "error" }, { status: code });
  }
}

export async function PUT(request) {
  const auth = await requireProfessionalApi(request, { bucket: "professional:patient-profile:put", limit: 120, windowMs: 60_000 });
  if (!auth.ok) return auth.res;

  const session = auth.session;
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const patientId = String(searchParams.get("patientId") || "").trim();
  if (!patientId) return NextResponse.json({ ok: false, error: "missing_patientId" }, { status: 400 });

  const bodyRes = await readJsonObjectBody(request, {
    maxBytes: 60_000,
    defaultValue: {},
    allowedKeys: [
      "fullName",
      "preferredName",
      "cpf",
      "birthDate",
      "gender",
      "phoneE164",
      "email",
      "address",
      "legalGuardian",
      "generalNotes",
    ],
    label: "professional-patient-profile-put",
    showKeys: true,
  });
  if (!bodyRes.ok) return NextResponse.json({ ok: false, error: bodyRes.error }, { status: 400 });

  try {
    const patient = await updatePatientProfile({
      tenantId: session.tenantId,
      patientId,
      patch: bodyRes.value || {},
      updatedByUid: session.uid,
    });
    return NextResponse.json({ ok: true, patient }, { status: 200 });
  } catch (e) {
    const code = e?.code === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ ok: false, error: "bad_request", message: e?.message || "error" }, { status: code });
  }
}
