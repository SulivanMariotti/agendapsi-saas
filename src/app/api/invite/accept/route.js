// src/app/api/invite/accept/route.js
import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { enforceSameOrigin } from "@/lib/server/originGuard";
import { readJsonObjectBody, getString } from "@/lib/server/payloadSchema";
import { getTenantInviteByToken, isInviteExpired, maskEmail } from "@/lib/server/tenantInvites";
import { upsertUserTenantIndex } from "@/lib/server/tenantMembership";
import { ensureTenantActive } from "@/lib/server/tenantStatus";
import { logAdminAudit } from "@/lib/server/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function norm(v) {
  return String(v ?? "").trim();
}

function safeDisplayName({ email, userRecord, fallback = "Owner" }) {
  const dn = String(userRecord?.displayName || "").trim();
  if (dn) return dn.slice(0, 80);
  const e = String(email || "").trim();
  if (e && e.includes("@")) return e.split("@")[0].slice(0, 80);
  return String(fallback).slice(0, 80);
}

export async function POST(req) {
  let decoded = null;
  try {
    const og = enforceSameOrigin(req, { allowNoOrigin: false });
    if (!og.ok) return og.res;

    const rl = await rateLimit(req, {
      bucket: "invite:accept:post",
      limit: 30,
      windowMs: 60_000,
      useGlobalLimiter: true,
    });
    if (!rl.ok) return rl.res;

    const bodyRes = await readJsonObjectBody(req, {
      allowedKeys: ["token", "idToken"],
      label: "InviteAccept",
    });
    if (!bodyRes.ok) {
      return NextResponse.json({ ok: false, error: bodyRes.error }, { status: 400 });
    }
    const body = bodyRes.value || {};

    const tokenRes = getString(body, "token", { required: true, min: 10, max: 500, label: "token" });
    if (!tokenRes.ok) return NextResponse.json({ ok: false, error: tokenRes.error }, { status: 400 });
    const token = norm(tokenRes.value);

    const idTokenRes = getString(body, "idToken", { required: true, min: 50, max: 20_000, label: "idToken" });
    if (!idTokenRes.ok) return NextResponse.json({ ok: false, error: idTokenRes.error }, { status: 400 });
    const idToken = norm(idTokenRes.value);

    decoded = await admin.auth().verifyIdToken(idToken);
    const uid = norm(decoded?.uid);
    const email = String(decoded?.email || "").trim().toLowerCase();

    if (!uid) return NextResponse.json({ ok: false, error: "Token inválido." }, { status: 401 });
    if (!email) return NextResponse.json({ ok: false, error: "Conta sem e-mail." }, { status: 400 });

    const inv = await getTenantInviteByToken(token);
    if (!inv?.data) {
      return NextResponse.json({ ok: false, error: "Convite inválido ou expirado." }, { status: 404 });
    }

    const data = inv.data || {};
    const status = String(data?.status || "pending");
    const tenantId = norm(data?.tenantId);

    if (isInviteExpired(data) || status === "expired") {
      // best-effort mark as expired
      try {
        await inv.ref.set({ status: "expired", updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      } catch (_) {}
      return NextResponse.json({ ok: false, error: "Convite expirado." }, { status: 410 });
    }
    if (status === "revoked") {
      return NextResponse.json({ ok: false, error: "Convite revogado." }, { status: 410 });
    }
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "Convite inválido." }, { status: 400 });
    }

    // Tenant suspension should block usage
    const tenantCheck = await ensureTenantActive(tenantId);
    if (!tenantCheck.ok) {
      return NextResponse.json(
        { ok: false, error: "tenant-suspended", code: "TENANT_SUSPENDED" },
        { status: 403 }
      );
    }

    const expectedEmail = String(data?.emailLower || "").trim().toLowerCase();
    if (!expectedEmail || expectedEmail !== email) {
      return NextResponse.json(
        { ok: false, error: "E-mail não corresponde ao convite.", code: "EMAIL_MISMATCH" },
        { status: 403 }
      );
    }

    const db = admin.firestore();
    const inviteRef = inv.ref;
    const tenantRef = db.collection("tenants").doc(tenantId);
    const memberRef = tenantRef.collection("users").doc(uid);

    const userRecord = await admin.auth().getUser(uid).catch(() => null);
    const displayName = safeDisplayName({ email, userRecord, fallback: "Owner" });

    await db.runTransaction(async (tx) => {
      const inviteSnap = await tx.get(inviteRef);
      const inviteData = inviteSnap.data() || {};
      const curStatus = String(inviteData?.status || "pending");

      if (curStatus === "accepted") return;
      if (curStatus === "revoked") throw new Error("invite-revoked");
      if (isInviteExpired(inviteData) || curStatus === "expired") throw new Error("invite-expired");

      // Ensure tenant exists
      const tenantSnap = await tx.get(tenantRef);
      if (!tenantSnap.exists) throw new Error("tenant-not-found");

      const now = admin.firestore.FieldValue.serverTimestamp();

      // Upsert membership
      const memberSnap = await tx.get(memberRef);
      const baseMember = {
        uid,
        role: "owner",
        displayName,
        isActive: true,
        updatedAt: now,
      };
      if (!memberSnap.exists) tx.set(memberRef, { ...baseMember, createdAt: now }, { merge: true });
      else tx.set(memberRef, baseMember, { merge: true });

      // Set ownerUid only if absent
      const tData = tenantSnap.data() || {};
      if (!tData.ownerUid) {
        tx.set(tenantRef, { ownerUid: uid, updatedAt: now, updatedBy: uid }, { merge: true });
      } else {
        tx.set(tenantRef, { updatedAt: now, updatedBy: uid }, { merge: true });
      }

      // Mark invite accepted
      tx.set(
        inviteRef,
        {
          status: "accepted",
          acceptedByUid: uid,
          acceptedEmailLower: email,
          acceptedAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
    });

    await upsertUserTenantIndex({
      uid,
      tenantId,
      role: "owner",
      isActive: true,
      displayName,
    });

    await logAdminAudit({
      req,
      actorUid: uid,
      actorEmail: maskEmail(email) || null,
      action: "TENANT_OWNER_INVITE_ACCEPT",
      target: tenantId,
      status: "success",
      meta: { tenantId, email: maskEmail(email) || null },
    });

    return NextResponse.json({
      ok: true,
      tenantId,
      role: "owner",
    });
  } catch (e) {
    const code = String(e?.message || "");
    if (code === "invite-revoked") {
      return NextResponse.json({ ok: false, error: "Convite revogado." }, { status: 410 });
    }
    if (code === "invite-expired") {
      return NextResponse.json({ ok: false, error: "Convite expirado." }, { status: 410 });
    }
    if (code === "tenant-not-found") {
      return NextResponse.json({ ok: false, error: "Tenant não encontrado." }, { status: 404 });
    }
    // eslint-disable-next-line no-console
    console.error("/api/invite/accept error", e);
    return NextResponse.json({ ok: false, error: "Falha ao aceitar convite." }, { status: 500 });
  }
}
