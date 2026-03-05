import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { adminError } from "@/lib/server/adminError";
import { readJsonObjectBody } from "@/lib/server/payloadSchema";
import { deactivateOccurrenceCode, listOccurrenceCodes, upsertOccurrenceCode } from "@/lib/server/agendapsiData";

export const runtime = "nodejs";

function resolveTenantIdFromReq(req) {
  const { searchParams } = new URL(req.url);
  const fromQuery = String(searchParams.get("tenantId") || "").trim();
  const fromEnv = String(process.env.AGENDA_PSI_TENANT_ID || "").trim();
  return fromQuery || fromEnv || "tn_JnA5yU";
}

export async function GET(req) {
  try {
    await rateLimit(req, { limit: 120, windowMs: 60_000 });
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const tenantId = resolveTenantIdFromReq(req);

    const codes = await listOccurrenceCodes({ tenantId, activeOnly: false });
    return NextResponse.json({ ok: true, tenantId, codes });
  } catch (e) {
    return adminError(e);
  }
}

export async function PUT(req) {
  try {
    await rateLimit(req, { limit: 120, windowMs: 60_000 });
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const tenantId = resolveTenantIdFromReq(req);

    const body = await readJsonObjectBody(req);
    const codeId = String(body?.codeId || "").trim();
    const code = String(body?.code || "").trim();
    const description = String(body?.description || "").trim();
    const isActive = body?.isActive !== false;

    const result = await upsertOccurrenceCode({
      tenantId,
      codeId: codeId || "",
      code,
      description,
      isActive,
    });

    return NextResponse.json({ ok: true, tenantId, ...result });
  } catch (e) {
    return adminError(e);
  }
}

export async function DELETE(req) {
  try {
    await rateLimit(req, { limit: 120, windowMs: 60_000 });
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const tenantId = resolveTenantIdFromReq(req);
    const { searchParams } = new URL(req.url);
    const codeId = String(searchParams.get("codeId") || "").trim();
    if (!codeId) throw new Error("codeId obrigatório");

    const result = await deactivateOccurrenceCode({ tenantId, codeId });
    return NextResponse.json({ ok: true, tenantId, ...result });
  } catch (e) {
    return adminError(e);
  }
}
