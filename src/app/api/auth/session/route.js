import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import admin from "@/lib/firebaseAdmin";
import { resolveMembershipByUid, upsertUserTenantIndex } from "@/lib/server/tenantMembership";
import { ensureTenantActive } from "@/lib/server/tenantStatus";
import { computeBillingStateFromTenantData } from "@/lib/server/tenantBilling";
import { enforceSameOrigin } from "@/lib/server/originGuard";
import { rateLimit } from "@/lib/server/rateLimit";

const SESSION_COOKIE_NAME = "__session";
const EXPIRES_IN_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

export async function POST(req) {
  const originCheck = enforceSameOrigin(req, { allowNoOrigin: false, allowNoOriginWithAuth: false });
  if (!originCheck.ok) return originCheck.res;

  const rl = await rateLimit(req, { bucket: "auth:session", limit: 20, windowMs: 60_000, uid: null, global: true });
  if (!rl.ok) return rl.res;

  try {
    const body = await req.json().catch(() => ({}));
    const idToken = String(body?.idToken || "");
    if (!idToken) {
      return NextResponse.json({ ok: false, error: "Token ausente." }, { status: 400 });
    }

    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded?.uid;
    if (!uid) {
      return NextResponse.json({ ok: false, error: "Token inválido." }, { status: 401 });
    }

    // Tenant isolation: user must be explicitly linked
    const membership = await resolveMembershipByUid(uid);
    if (!membership?.tenantId) {
      return NextResponse.json(
        { ok: false, error: "Usuário não vinculado a nenhum tenant." },
        { status: 403 }
      );
    }

    const isActive = membership?.isActive !== false;
    if (!isActive) {
      return NextResponse.json({ ok: false, error: "Usuário inativo." }, { status: 403 });
    }

    const role = String(membership?.role || "");
    if (!role || !["owner", "professional", "admin"].includes(role)) {
      return NextResponse.json({ ok: false, error: "Acesso não autorizado." }, { status: 403 });
    }

    const tenantCheck = await ensureTenantActive(membership.tenantId);
    if (!tenantCheck.ok) {
      return NextResponse.json(
        { ok: false, error: "tenant-suspended", code: "TENANT_SUSPENDED" },
        { status: 403 }
      );
    }

    // Create Firebase session cookie (httpOnly)
    const sessionCookie = await admin.auth().createSessionCookie(idToken, { expiresIn: EXPIRES_IN_MS });

    const cookieStore = await cookies();
    cookieStore.set({
      name: SESSION_COOKIE_NAME,
      value: sessionCookie,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: Math.floor(EXPIRES_IN_MS / 1000),
    });

    // Ensure index exists/updated (produção-safe)
    await upsertUserTenantIndex({ uid, ...membership });

    const tenantData = tenantCheck?.data || {};
    const billing = computeBillingStateFromTenantData(tenantData);
    const planId = String(tenantData?.planId || "").trim().toLowerCase() || "pro";

    return NextResponse.json({ ok: true, tenantId: membership.tenantId, role, planId, billing });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("/api/auth/session error", e);
    const detail = process.env.NODE_ENV !== "production" ? String(e?.message || e) : undefined;
    return NextResponse.json(
      { ok: false, error: "Falha ao iniciar sessão.", ...(detail ? { detail } : {}) },
      { status: 500 }
    );
  }
}
