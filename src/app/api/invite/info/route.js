// src/app/api/invite/info/route.js
import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { enforceSameOrigin } from "@/lib/server/originGuard";
import { getTenantInviteByToken, isInviteExpired, maskEmail } from "@/lib/server/tenantInvites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function norm(v) {
  return String(v ?? "").trim();
}

async function loadTenantName(db, tenantId) {
  const tid = norm(tenantId);
  if (!tid) return null;
  const snap = await db.collection("tenants").doc(tid).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  return String(data?.name || "").trim() || null;
}

export async function GET(req) {
  try {
    const og = enforceSameOrigin(req, { allowNoOrigin: true });
    if (!og.ok) return og.res;

    const rl = await rateLimit(req, {
      bucket: "invite:info:get",
      limit: 120,
      windowMs: 60_000,
      useGlobalLimiter: true,
    });
    if (!rl.ok) return rl.res;

    const url = new URL(req.url);
    const token = norm(url.searchParams.get("token"));
    if (!token) {
      return NextResponse.json({ ok: false, error: "Token ausente." }, { status: 400 });
    }

    const inv = await getTenantInviteByToken(token);
    if (!inv?.data) {
      return NextResponse.json({ ok: false, error: "Convite inválido ou expirado." }, { status: 404 });
    }

    const data = inv.data || {};
    const status = String(data?.status || "pending");
    if (isInviteExpired(data) || status === "expired") {
      return NextResponse.json({ ok: false, error: "Convite expirado." }, { status: 410 });
    }
    if (status === "revoked") {
      return NextResponse.json({ ok: false, error: "Convite revogado." }, { status: 410 });
    }

    const tenantId = norm(data?.tenantId);
    const db = admin.firestore();
    const tenantName = await loadTenantName(db, tenantId);

    const expIso = data?.expiresAt?.toDate?.()?.toISOString?.() || null;

    return NextResponse.json({
      ok: true,
      invite: {
        type: String(data?.type || "tenantOwner"),
        status,
        tenantId,
        tenantName,
        email: String(data?.emailLower || ""),
        emailMasked: maskEmail(data?.emailLower || "") || null,
        expiresAtIso: expIso,
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("/api/invite/info error", e);
    return NextResponse.json({ ok: false, error: "Falha ao carregar convite." }, { status: 500 });
  }
}
