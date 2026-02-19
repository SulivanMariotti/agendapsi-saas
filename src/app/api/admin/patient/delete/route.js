// src/app/api/admin/patient/delete/route.js
import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { logAdminAudit } from "@/lib/server/auditLog";
import { adminError } from "@/lib/server/adminError";
import { writeHistory } from "@/lib/server/historyLog";
import { asPlainObject, enforceAllowedKeys, getString, readJsonBody } from "@/lib/server/payloadSchema";
export const runtime = "nodejs";
/**
 * Admin server-side: desativar (soft-delete) paciente
 *
 * Endpoint: POST /api/admin/patient/delete
 * Proteção: Authorization Bearer (idToken) + role admin
 *
 * BUGFIX URGENTE:
 * - Antes, o endpoint criava um NOVO doc em users/{p_base64(email)} ao invés de atualizar
 *   o doc real (uid do Firebase Auth / docId existente), gerando "2 registros" no users:
 *   1) o doc real continua status=active
 *   2) o doc "p_base64" fica inactive
 *   Resultado: o paciente NÃO some da lista.
 *
 * Agora, o endpoint:
 * - Atualiza SEMPRE o doc real:
 *   1) Se body.uid vier, usa esse docId
 *   2) Senão, tenta localizar por email / phoneCanonical / patientExternalId (query) e atualiza TODOS os matches
 * - Também marca subscribers/{phoneCanonical} como inactive
 * - Loga em history
 *
 * Observação:
 * - Não deleta docs para preservar histórico (appointments, attendance_logs, patient_notes).
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

  // Try by email
  if (email) {
    const q = await db
      .collection("users")
      .where("role", "==", "patient")
      .where("email", "==", email)
      .get();
    q.forEach((d) => ids.add(d.id));
  }

  // Try by phoneCanonical
  if (phoneCanonical) {
    const q = await db
      .collection("users")
      .where("role", "==", "patient")
      .where("phoneCanonical", "==", phoneCanonical)
      .get();
    q.forEach((d) => ids.add(d.id));
  }

  // Try by patientExternalId
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
      bucket: "admin:patient:delete",
      uid: auth.uid,
      limit: 20,
      windowMs: 60_000,
    });
    if (!rl.ok) return rl.res;


    const rb = await readJsonBody(req, { maxBytes: 20_000 });
    if (!rb.ok) {
      return NextResponse.json({ ok: false, error: rb.error }, { status: 400 });
    }

    const po = asPlainObject(rb.value);
    if (!po.ok) {
      return NextResponse.json({ ok: false, error: po.error }, { status: 400 });
    }

    const ek = enforceAllowedKeys(po.value, ["uid", "email", "patientExternalId", "phoneCanonical", "phone", "reason"], {
      label: "PatientDelete",
    });
    if (!ek.ok) {
      return NextResponse.json({ ok: false, error: ek.error }, { status: 400 });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    const uidRes = getString(po.value, "uid", {
      required: false,
      trim: true,
      max: 160,
      defaultValue: "",
      label: "uid",
    });
    if (!uidRes.ok) return NextResponse.json({ ok: false, error: uidRes.error }, { status: 400 });

    const emailRes = getString(po.value, "email", {
      required: false,
      trim: true,
      toLower: true,
      max: 160,
      pattern: emailPattern,
      defaultValue: "",
      label: "email",
    });
    if (!emailRes.ok) return NextResponse.json({ ok: false, error: emailRes.error }, { status: 400 });

    const extRes = getString(po.value, "patientExternalId", {
      required: false,
      trim: true,
      max: 120,
      defaultValue: "",
      label: "patientExternalId",
    });
    if (!extRes.ok) return NextResponse.json({ ok: false, error: extRes.error }, { status: 400 });

    const phoneRes = getString(po.value, "phoneCanonical", {
      required: false,
      trim: true,
      max: 40,
      defaultValue: "",
      label: "phoneCanonical",
    });
    if (!phoneRes.ok) return NextResponse.json({ ok: false, error: phoneRes.error }, { status: 400 });

    const phoneRawRes = getString(po.value, "phone", {
      required: false,
      trim: true,
      max: 40,
      defaultValue: "",
      label: "phone",
    });
    if (!phoneRawRes.ok) return NextResponse.json({ ok: false, error: phoneRawRes.error }, { status: 400 });

    const reasonRes = getString(po.value, "reason", {
      required: false,
      trim: true,
      max: 80,
      defaultValue: "admin_ui_remove",
      label: "reason",
    });
    if (!reasonRes.ok) return NextResponse.json({ ok: false, error: reasonRes.error }, { status: 400 });

    const uid = String(uidRes.value || "").trim() || null;
    const email = String(emailRes.value || "").trim() || null;
    const patientExternalId = String(extRes.value || "").trim() || null;

    const phoneCanonical =
      normalizePhoneCanonical(phoneRes.value || phoneRawRes.value || "") || null;

    const reason = String(reasonRes.value || "admin_ui_remove").trim();

    if (!uid && !phoneCanonical && !email && !patientExternalId) {
      return NextResponse.json(
        { ok: false, error: "Missing uid or phoneCanonical or email or patientExternalId" },
        { status: 400 }
      );
    }

    const db = admin.firestore();
    const now = admin.firestore.FieldValue.serverTimestamp();

    // 1) Soft-delete subscriber
    if (phoneCanonical) {
      await db.collection("subscribers").doc(phoneCanonical).set(
        {
          status: "inactive",
          inactiveReason: reason,
          deletedAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
    }

    // 2) Soft-delete user(s) REAL doc(s)
    const userDocIds = await findUserDocIds(db, { uid, email, phoneCanonical, patientExternalId });

    if (!userDocIds.length) {
      // No match found; still log so you can track the attempt
      await writeHistory(db, {
        type: "patient_deactivate_not_found",
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
        action: "patient_deactivate_not_found",
        meta: { uid, email, phoneCanonical, patientExternalId, reason },
      });

      return NextResponse.json(
        { ok: false, error: "User not found in users collection", userDocIds: [] },
        { status: 404 }
      );
    }

    // Update all matches (handles duplicates)
    await Promise.all(
      userDocIds.map((docId) =>
        db.collection("users").doc(docId).set(
          {
            status: "inactive",
            inactiveReason: reason,
            deletedAt: now,
            updatedAt: now,
          },
          { merge: true }
        )
      )
    );

    await writeHistory(db, {
      type: "patient_deactivate",
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
      action: "patient_deactivate",
      target: userDocIds.join(","),
      meta: { uid, email, phoneCanonical, patientExternalId, reason, updatedDocs: userDocIds.length },
    });

    return NextResponse.json({ ok: true, userDocIds, phoneCanonical, email, patientExternalId });
  } catch (e) {
    return adminError({ req, auth: auth?.ok ? auth : null, action: "patient_delete", err: e });
  }
}
