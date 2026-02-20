// src/app/api/admin/patient/access/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { adminError } from "@/lib/server/adminError";
import { logAdminAudit } from "@/lib/server/auditLog";
import { writeHistory } from "@/lib/server/historyLog";
import { readJsonObjectBody, getString, getBoolean, enforceAllowedKeys } from "@/lib/server/payloadSchema";

function onlyDigits(v) {
  return String(v || "").replace(/\D/g, "");
}

function toPhoneCanonical(raw) {
  let d = onlyDigits(raw).replace(/^0+/, "");
  if (!d) return "";
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length === 10 || d.length === 11) return d;
  if (d.length > 11) return d.slice(-11);
  return d;
}

async function findPatientIds(db, { uid, email, phoneCanonical, patientExternalId }) {
  const ids = new Set();

  if (uid) ids.add(uid);

  // Single-field queries only (avoid composite index requirements).
  if (email) {
    const q = await db.collection("users").where("email", "==", email).limit(5).get();
    q.forEach((d) => {
      const role = String(d.data()?.role || "").toLowerCase();
      if (role === "patient") ids.add(d.id);
    });
  }

  if (phoneCanonical) {
    const q = await db.collection("users").where("phoneCanonical", "==", phoneCanonical).limit(5).get();
    q.forEach((d) => {
      const role = String(d.data()?.role || "").toLowerCase();
      if (role === "patient") ids.add(d.id);
    });
  }

  if (patientExternalId) {
    const q = await db.collection("users").where("patientExternalId", "==", String(patientExternalId)).limit(5).get();
    q.forEach((d) => {
      const role = String(d.data()?.role || "").toLowerCase();
      if (role === "patient") ids.add(d.id);
    });
  }

  return Array.from(ids);
}

function isAccessSuspended(data) {
  if (!data || typeof data !== "object") return false;

  if (data.accessDisabled === true) return true;
  if (data.securityHold === true) return true;

  if (data.access && typeof data.access === "object") {
    if (data.access.disabled === true) return true;
    const st = String(data.access.status || "").toLowerCase().trim();
    if (["disabled", "blocked", "suspended", "hold"].includes(st)) return true;
  }

  const accessStatus = String(data.accessStatus || "").toLowerCase().trim();
  if (["disabled", "blocked", "suspended", "hold"].includes(accessStatus)) return true;

  return false;
}

export async function POST(req) {
  let auth = null;
  try {
    auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const rl = await rateLimit(req, {
      bucket: "admin:patient:access",
      uid: auth.uid,
      limit: 30,
      windowMs: 60_000,
    });
    if (!rl.ok) return rl.res;

    const rb = await readJsonObjectBody(req, {
      maxBytes: 20_000,
      allowedKeys: ["uid", "email", "phoneCanonical", "phone", "patientExternalId", "accessDisabled", "reason"],
      label: "PatientAccess",
    });
    if (!rb.ok) return rb.res;

    // Defensive allow-list (belt & suspenders)
    const ek = enforceAllowedKeys(rb.value, ["uid", "email", "phoneCanonical", "phone", "patientExternalId", "accessDisabled", "reason"], {
      label: "PatientAccess",
    });
    if (!ek.ok) return NextResponse.json({ ok: false, error: ek.error }, { status: 400 });

    const uidRes = getString(rb.value, "uid", { required: false, trim: true, max: 200, defaultValue: "" });
    if (!uidRes.ok) return NextResponse.json({ ok: false, error: uidRes.error }, { status: 400 });

    const emailRes = getString(rb.value, "email", { required: false, trim: true, toLower: true, max: 200, defaultValue: "" });
    if (!emailRes.ok) return NextResponse.json({ ok: false, error: emailRes.error }, { status: 400 });

    const phoneRes = getString(rb.value, "phoneCanonical", { required: false, trim: true, max: 40, defaultValue: "" });
    if (!phoneRes.ok) return NextResponse.json({ ok: false, error: phoneRes.error }, { status: 400 });

    const phoneRawRes = getString(rb.value, "phone", { required: false, trim: true, max: 80, defaultValue: "" });
    if (!phoneRawRes.ok) return NextResponse.json({ ok: false, error: phoneRawRes.error }, { status: 400 });

    const extRes = getString(rb.value, "patientExternalId", { required: false, trim: true, max: 120, defaultValue: "" });
    if (!extRes.ok) return NextResponse.json({ ok: false, error: extRes.error }, { status: 400 });

    const accessRes = getBoolean(rb.value, "accessDisabled", { required: true });
    if (!accessRes.ok) return NextResponse.json({ ok: false, error: accessRes.error }, { status: 400 });

    const reasonRes = getString(rb.value, "reason", { required: false, trim: true, max: 200, defaultValue: "admin_ui_access_toggle" });
    if (!reasonRes.ok) return NextResponse.json({ ok: false, error: reasonRes.error }, { status: 400 });

    const uid = uidRes.value || "";
    const email = emailRes.value || "";
    const phoneCanonical = toPhoneCanonical(phoneRes.value || phoneRawRes.value || "");
    const patientExternalId = extRes.value || "";
    const accessDisabled = Boolean(accessRes.value);
    const reason = reasonRes.value;

    if (!uid && !email && !phoneCanonical && !patientExternalId) {
      return NextResponse.json({ ok: false, error: "Informe uid, email, telefone ou patientExternalId." }, { status: 400 });
    }

    const db = admin.firestore();

    const ids = await findPatientIds(db, { uid, email, phoneCanonical, patientExternalId });

    if (ids.length === 0) {
      await logAdminAudit({
        req,
        actorUid: auth.uid,
        actorEmail: auth.decoded?.email || null,
        action: "patient_access_not_found",
        target: uid || email || phoneCanonical || patientExternalId || null,
        status: "error",
        meta: { uid, email, phoneCanonical, patientExternalId, accessDisabled, reason },
      });
      return NextResponse.json({ ok: false, error: "Paciente não encontrado." }, { status: 404 });
    }

    if (ids.length > 1) {
      await logAdminAudit({
        req,
        actorUid: auth.uid,
        actorEmail: auth.decoded?.email || null,
        action: "patient_access_ambiguous",
        target: uid || email || phoneCanonical || patientExternalId || null,
        status: "error",
        meta: { matches: ids.slice(0, 10), uid, email, phoneCanonical, patientExternalId, accessDisabled, reason },
      });
      return NextResponse.json({ ok: false, error: "Busca ambígua. Use o uid do paciente." }, { status: 409 });
    }

    const targetUid = ids[0];
    const ref = db.collection("users").doc(targetUid);
    const snap = await ref.get();

    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "Paciente não encontrado." }, { status: 404 });
    }

    const data = snap.data() || {};
    const role = String(data?.role || "").toLowerCase();
    if (role !== "patient") {
      return NextResponse.json({ ok: false, error: "Registro não é paciente." }, { status: 400 });
    }

    const prevSuspended = isAccessSuspended(data);

    const patch = {
      accessDisabled,
      accessStatus: accessDisabled ? "disabled" : "active",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (accessDisabled) {
      patch.accessDisabledAt = admin.firestore.FieldValue.serverTimestamp();
    } else {
      patch.accessDisabledAt = admin.firestore.FieldValue.delete();
      // if securityHold existed, keep it as-is (explicit security workflow)
    }

    await ref.set(patch, { merge: true });

    await logAdminAudit({
      req,
      actorUid: auth.uid,
      actorEmail: auth.decoded?.email || null,
      action: "patient_access_update",
      target: targetUid,
      status: "success",
      meta: {
        accessDisabled,
        prevSuspended,
        reason,
        email: data?.email || null,
        phoneTail: phoneCanonical ? phoneCanonical.slice(-4) : null,
        patientExternalId: data?.patientExternalId || null,
      },
    });

    await writeHistory(db, {
      type: "patient_access_update",
      actorUid: auth.uid,
      targetUid,
      accessDisabled,
      prevSuspended,
      reason,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      ok: true,
      uid: targetUid,
      accessDisabled,
    });
  } catch (err) {
    return adminError({ req, auth, action: "admin_patient_access", err });
  }
}
