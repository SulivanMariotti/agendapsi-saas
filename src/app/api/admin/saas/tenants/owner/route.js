import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { adminError } from "@/lib/server/adminError";
import { logAdminAudit } from "@/lib/server/auditLog";
import { readJsonObjectBody, getString } from "@/lib/server/payloadSchema";
import { upsertUserTenantIndex } from "@/lib/server/tenantMembership";
import { createTenantInvite, buildInviteLink, maskEmail } from "@/lib/server/tenantInvites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function norm(v) {
  return String(v ?? "").trim();
}

function safeEmailFromUserRecord(userRecord) {
  const e = String(userRecord?.email || "").trim().toLowerCase();
  return e || "";
}

function safeDisplayName({ userRecord, email, fallback = "Owner" }) {
  const dn = String(userRecord?.displayName || "").trim();
  if (dn) return dn.slice(0, 80);

  const e = String(email || "").trim();
  if (e && e.includes("@")) return e.split("@")[0].slice(0, 80);

  return String(fallback || "Owner").slice(0, 80);
}

async function loadTenant(db, tenantId) {
  const tid = norm(tenantId);
  if (!tid) return null;
  const ref = db.collection("tenants").doc(tid);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return { ref, data: snap.data() || {} };
}

export async function POST(req) {
  let auth = null;
  try {
    auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const rl = await rateLimit(req, {
      bucket: "admin:saas:tenants:owner:post",
      uid: auth.uid,
      limit: 60,
      windowMs: 60_000,
    });
    if (!rl.ok) return rl.res;

    const bodyRes = await readJsonObjectBody(req, {
      allowedKeys: ["tenantId", "email", "uid", "displayName"],
      label: "LinkOwner",
    });
    if (!bodyRes.ok) {
      return NextResponse.json({ ok: false, error: bodyRes.error }, { status: 400 });
    }

    const body = bodyRes.value || {};

    const tenantIdRes = getString(body, "tenantId", { required: true, min: 3, max: 80, label: "tenantId" });
    if (!tenantIdRes.ok) return NextResponse.json({ ok: false, error: tenantIdRes.error }, { status: 400 });
    const tenantId = tenantIdRes.value;

    const uidRes = getString(body, "uid", { required: false, min: 6, max: 128, label: "UID" });
    if (!uidRes.ok) return NextResponse.json({ ok: false, error: uidRes.error }, { status: 400 });
    const uid = norm(uidRes.value);

    const emailRes = getString(body, "email", {
      required: false,
      trim: true,
      toLower: true,
      min: 6,
      max: 180,
      label: "Email",
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      defaultValue: "",
    });
    if (!emailRes.ok) return NextResponse.json({ ok: false, error: emailRes.error }, { status: 400 });
    const email = norm(emailRes.value);

    const displayNameRes = getString(body, "displayName", { required: false, min: 0, max: 80, label: "Nome (displayName)" });
    if (!displayNameRes.ok) return NextResponse.json({ ok: false, error: displayNameRes.error }, { status: 400 });
    const displayNameOverride = norm(displayNameRes.value);

    if (!uid && !email) {
      return NextResponse.json(
        { ok: false, error: "Informe uid ou email do usuário (owner)." },
        { status: 400 }
      );
    }

    const db = admin.firestore();

    const tenant = await loadTenant(db, tenantId);
    if (!tenant) {
      return NextResponse.json({ ok: false, error: "Tenant não encontrado." }, { status: 404 });
    }

    // Resolve user (Auth)
    let userRecord = null;
    let resolvedUid = uid;
    let mode = "uid";

    try {
      if (email && !uid) {
        mode = "email";
        userRecord = await admin.auth().getUserByEmail(email);
        resolvedUid = userRecord?.uid || "";
      } else {
        userRecord = await admin.auth().getUser(uid);
        resolvedUid = userRecord?.uid || uid;
      }
    } catch (e) {
      const code = String(e?.code || "");
      if (code.includes("user-not-found")) {
        // Se email foi informado e ainda não existe no Auth, criamos um convite de owner (MVP+).
        if (mode === "email" && email && !uid) {
          const invite = await createTenantInvite({
            tenantId,
            email,
            role: "owner",
            createdByUid: auth.uid,
          });

          const link = buildInviteLink({ token: invite.token });

          await logAdminAudit({
            req,
            actorUid: auth.uid,
            actorEmail: auth?.decoded?.email || null,
            action: "TENANT_OWNER_INVITE_CREATE",
            target: tenantId,
            status: "success",
            meta: {
              mode: "email",
              email: maskEmail(email) || null,
              expiresAtIso: invite.expiresAt?.toDate?.().toISOString?.() || null,
            },
          });

          return NextResponse.json({
            ok: true,
            mode: "invite",
            tenantId,
            invite: {
              link,
              token: process.env.NODE_ENV !== "production" ? invite.token : undefined,
              emailMasked: maskEmail(email) || null,
              expiresAtIso: invite.expiresAt?.toDate?.().toISOString?.() || null,
            },
          });
        }

        return NextResponse.json({ ok: false, error: "Usuário não encontrado no Auth." }, { status: 404 });
      }
      if (code.includes("invalid-uid")) {
        return NextResponse.json({ ok: false, error: "UID inválido." }, { status: 400 });
      }
      if (code.includes("invalid-email")) {
        return NextResponse.json({ ok: false, error: "Email inválido." }, { status: 400 });
      }
      throw e;
    }

    if (!resolvedUid) {
      return NextResponse.json({ ok: false, error: "Usuário não encontrado no Auth." }, { status: 404 });
    }

    const resolvedEmail = safeEmailFromUserRecord(userRecord) || email || "";
    const displayName = displayNameOverride || safeDisplayName({ userRecord, email: resolvedEmail, fallback: "Owner" });

    const tenantRef = tenant.ref;
    const memberRef = tenantRef.collection("users").doc(resolvedUid);

    // Transaction ensures we don't clobber createdAt if doc already exists.
    await db.runTransaction(async (tx) => {
      const memberSnap = await tx.get(memberRef);
      const now = admin.firestore.FieldValue.serverTimestamp();

      const baseMember = {
        uid: resolvedUid,
        role: "owner",
        displayName,
        isActive: true,
        updatedAt: now,
      };

      if (!memberSnap.exists) {
        tx.set(memberRef, { ...baseMember, createdAt: now }, { merge: true });
      } else {
        tx.set(memberRef, baseMember, { merge: true });
      }

      // Set ownerUid on tenant only if absent (do not overwrite).
      const tenantSnap = await tx.get(tenantRef);
      const tData = tenantSnap.data() || {};
      if (!tData.ownerUid) {
        tx.set(tenantRef, { ownerUid: resolvedUid, updatedAt: now, updatedBy: auth.uid }, { merge: true });
      } else {
        tx.set(tenantRef, { updatedAt: now, updatedBy: auth.uid }, { merge: true });
      }
    });

    // Index for login resolution (best-effort)
    await upsertUserTenantIndex({
      uid: resolvedUid,
      tenantId,
      role: "owner",
      isActive: true,
      displayName,
    });

    await logAdminAudit({
      req,
      actorUid: auth.uid,
      actorEmail: auth?.decoded?.email || null,
      action: "TENANT_OWNER_LINK",
      target: tenantId,
      status: "success",
      meta: {
        mode,
        ownerUid: resolvedUid,
        ownerEmail: resolvedEmail ? `***${resolvedEmail.slice(-8)}` : null,
      },
    });

    return NextResponse.json({
      ok: true,
      mode: "linked",
      tenantId,
      owner: {
        uid: resolvedUid,
        email: resolvedEmail || null,
        displayName,
      },
    });
  } catch (err) {
    return await adminError({
      req,
      auth,
      action: "saas_tenant_owner_link",
      err,
      meta: null,
    });
  }
}
