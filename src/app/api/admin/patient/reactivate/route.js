// src/app/api/admin/patient/reactivate/route.js
import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { logAdminAudit } from "@/lib/server/auditLog";
import { adminError } from "@/lib/server/adminError";
import { writeHistory } from "@/lib/server/historyLog";
import {
  asPlainObject,
  enforceAllowedKeys,
  getString,
  readJsonBody,
} from "@/lib/server/payloadSchema";

export const runtime = "nodejs";

/**
 * Admin server-side: reativar (undo soft-delete) paciente
 * Endpoint: POST /api/admin/patient/reactivate
 *
 * O paciente pode ter sido "desativado" anteriormente (status inactive + deletedAt).
 * Este endpoint reverte isso sem exigir novo cadastro:
 * - users/{uid}: status -> active, remove deletedAt/inactiveReason
 * - subscribers/{phoneCanonical}: status -> active, remove deletedAt/inactiveReason
 */

function getServiceAccount() {
  const b64 = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_B64;
  if (b64) {
    const json = Buffer.from(b64, "base64").toString("utf-8");
    return JSON.parse(json);
  }
  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
  if (!raw) throw new Error("Missing FIREBASE_ADMIN_SERVICE_ACCOUNT(_B64) env var");
  return JSON.parse(raw);
}

function initAdmin() {
  if (admin.apps?.length) return;
  const serviceAccount = getServiceAccount();
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizePhoneCanonical(input) {
  let d = onlyDigits(input).replace(/^0+/, "");
  if (!d) return "";
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  return d;
}

async function findUserDocIds(db, { uid, email, phoneCanonical, patientExternalId }) {
  const ids = new Set();
  if (uid) ids.add(uid);

  if (email) {
    const q = await db
      .collection("users")
      .where("role", "==", "patient")
      .where("email", "==", email)
      .get();
    q.forEach((d) => ids.add(d.id));
  }

  if (phoneCanonical) {
    const q = await db
      .collection("users")
      .where("role", "==", "patient")
      .where("phoneCanonical", "==", phoneCanonical)
      .get();
    q.forEach((d) => ids.add(d.id));
  }

  if (patientExternalId) {
    const q = await db
      .collection("users")
      .where("role", "==", "patient")
      .where("patientExternalId", "==", String(patientExternalId))
      .get();
    q.forEach((d) => ids.add(d.id));
  }

  return Array.from(ids);
}

export async function POST(req) {
  let auth = null;
  try {
    initAdmin();

    auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const rl = await rateLimit(req, {
      bucket: "admin:patient:reactivate",
      uid: auth.uid,
      limit: 20,
      windowMs: 60_000,
    });
    if (!rl.ok) return rl.res;

    const rb = await readJsonBody(req, { maxBytes: 20_000 });
    if (!rb.ok) return NextResponse.json({ ok: false, error: rb.error }, { status: 400 });

    const po = asPlainObject(rb.value);
    if (!po.ok) return NextResponse.json({ ok: false, error: po.error }, { status: 400 });

    const ek = enforceAllowedKeys(
      po.value,
      ["uid", "email", "patientExternalId", "phoneCanonical", "phone", "reason"],
      { label: "PatientReactivate" }
    );
    if (!ek.ok) return NextResponse.json({ ok: false, error: ek.error }, { status: 400 });

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    const uidRes = getString(po.value, "uid", { required: false, trim: true, max: 160, defaultValue: "" });
    if (!uidRes.ok) return NextResponse.json({ ok: false, error: uidRes.error }, { status: 400 });

    const emailRes = getString(po.value, "email", {
      required: false,
      trim: true,
      toLower: true,
      max: 160,
      pattern: emailPattern,
      defaultValue: "",
    });
    if (!emailRes.ok) return NextResponse.json({ ok: false, error: emailRes.error }, { status: 400 });

    const extRes = getString(po.value, "patientExternalId", { required: false, trim: true, max: 120, defaultValue: "" });
    if (!extRes.ok) return NextResponse.json({ ok: false, error: extRes.error }, { status: 400 });

    const phoneRes = getString(po.value, "phoneCanonical", { required: false, trim: true, max: 40, defaultValue: "" });
    if (!phoneRes.ok) return NextResponse.json({ ok: false, error: phoneRes.error }, { status: 400 });

    const phoneRawRes = getString(po.value, "phone", { required: false, trim: true, max: 40, defaultValue: "" });
    if (!phoneRawRes.ok) return NextResponse.json({ ok: false, error: phoneRawRes.error }, { status: 400 });

    const reasonRes = getString(po.value, "reason", { required: false, trim: true, max: 80, defaultValue: "admin_ui_reactivate" });
    if (!reasonRes.ok) return NextResponse.json({ ok: false, error: reasonRes.error }, { status: 400 });

    const uid = String(uidRes.value || "").trim() || null;
    const email = String(emailRes.value || "").trim() || null;
    const patientExternalId = String(extRes.value || "").trim() || null;
    const phoneCanonical = normalizePhoneCanonical(phoneRes.value || phoneRawRes.value || "") || null;
    const reason = String(reasonRes.value || "admin_ui_reactivate").trim();

    if (!uid && !phoneCanonical && !email && !patientExternalId) {
      return NextResponse.json(
        { ok: false, error: "Missing uid or phoneCanonical or email or patientExternalId" },
        { status: 400 }
      );
    }

    const db = admin.firestore();
    const now = admin.firestore.FieldValue.serverTimestamp();
    const del = admin.firestore.FieldValue.delete();

    // 1) Reactivate subscriber
    if (phoneCanonical) {
      await db.collection("subscribers").doc(phoneCanonical).set(
        {
          status: "active",
          inactiveReason: del,
          deletedAt: del,
          updatedAt: now,
        },
        { merge: true }
      );
    }

    // 2) Reactivate user(s)
    const userDocIds = await findUserDocIds(db, { uid, email, phoneCanonical, patientExternalId });
    if (!userDocIds.length) {
      await writeHistory(db, {
        type: "patient_reactivate_not_found",
        uid: uid || null,
        email: email || null,
        phoneCanonical: phoneCanonical || null,
        patientExternalId: patientExternalId || null,
        reason,
        createdAt: now,
      });

      await logAdminAudit({
        req,
        actorUid: auth.uid,
        actorEmail: auth.decoded?.email || null,
        action: "patient_reactivate_not_found",
        meta: { uid, email, phoneCanonical, patientExternalId, reason },
      });

      return NextResponse.json({ ok: false, error: "User not found in users collection", userDocIds: [] }, { status: 404 });
    }

    await Promise.all(
      userDocIds.map((docId) =>
        db.collection("users").doc(docId).set(
          {
            status: "active",
            inactiveReason: del,
            deletedAt: del,
            updatedAt: now,
          },
          { merge: true }
        )
      )
    );

    await writeHistory(db, {
      type: "patient_reactivate",
      userDocIds,
      uid: uid || null,
      email: email || null,
      phoneCanonical: phoneCanonical || null,
      patientExternalId: patientExternalId || null,
      reason,
      createdAt: now,
    });

    await logAdminAudit({
      req,
      actorUid: auth.uid,
      actorEmail: auth.decoded?.email || null,
      action: "patient_reactivate",
      target: userDocIds.join(","),
      meta: { uid, email, phoneCanonical, patientExternalId, reason, updatedDocs: userDocIds.length },
    });

    return NextResponse.json({ ok: true, userDocIds, phoneCanonical, email, patientExternalId });
  } catch (e) {
    return adminError({ req, auth: auth?.ok ? auth : null, action: "patient_reactivate", err: e });
  }
}
