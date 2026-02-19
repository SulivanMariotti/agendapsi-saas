// src/app/api/admin/patient/pair-code/route.js
import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import crypto from "crypto";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { logAdminAudit } from "@/lib/server/auditLog";
import { adminError } from "@/lib/server/adminError";
import { writeHistory } from "@/lib/server/historyLog";
import { asPlainObject, enforceAllowedKeys, getString, readJsonBody } from "@/lib/server/payloadSchema";

export const runtime = "nodejs";

/**
 * POST /api/admin/patient/pair-code
 *
 * Gera um código único (não armazenado em texto puro) para o paciente vincular o aparelho.
 */

function getServiceAccount() {
  const b64 = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_B64;
  if (b64) return JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
  if (!raw) throw new Error("Missing FIREBASE_ADMIN_SERVICE_ACCOUNT(_B64) env var");
  return JSON.parse(raw);
}

function initAdmin() {
  if (admin.apps?.length) return;
  admin.initializeApp({ credential: admin.credential.cert(getServiceAccount()) });
}

function generateReadableCode() {
  // 80 bits de entropia: suficiente para evitar brute force.
  // Formato amigável: XXXX-XXXX-XXXX (A-Z0-9).
  const raw = crypto.randomBytes(10).toString("base64");
  const clean = raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const s = (clean + "000000000000").slice(0, 12);
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

function sha256Hex(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function POST(req) {
  let auth = null;
  try {
    auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const rl = await rateLimit(req, {
      bucket: "admin:patient:pair-code",
      uid: auth.uid,
      limit: 30,
      windowMs: 60_000,
    });
    if (!rl.ok) return rl.res;

    const rb = await readJsonBody(req, { maxBytes: 6_000 });
    if (!rb.ok) {
      return NextResponse.json({ ok: false, error: rb.error }, { status: 400 });
    }

    const po = asPlainObject(rb.value);
    if (!po.ok) {
      return NextResponse.json({ ok: false, error: po.error }, { status: 400 });
    }

    const ek = enforceAllowedKeys(po.value, ["uid"], { label: "PairCode" });
    if (!ek.ok) {
      return NextResponse.json({ ok: false, error: ek.error }, { status: 400 });
    }

    const uidRes = getString(po.value, "uid", {
      required: true,
      trim: true,
      max: 160,
      maxBytes: 220,
      label: "uid",
    });
    if (!uidRes.ok) {
      return NextResponse.json({ ok: false, error: uidRes.error }, { status: 400 });
    }

    const uid = String(uidRes.value || "").trim();

    initAdmin();
    const db = admin.firestore();

    const userRef = db.collection("users").doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "Paciente não encontrado." }, { status: 404 });
    }

    const d = snap.data() || {};
    const role = String(d?.role || "").toLowerCase();
    if (role && role !== "patient") {
      return NextResponse.json({ ok: false, error: "Usuário não é paciente." }, { status: 400 });
    }

    const pairCode = generateReadableCode();
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = sha256Hex(`${salt}:${pairCode}`);

    const now = admin.firestore.FieldValue.serverTimestamp();

    await userRef.set(
      {
        pairCodeHash: hash,
        pairCodeSalt: salt,
        pairCodeStatus: "active", // active|used|revoked
        pairCodeCreatedAt: now,
        pairCodeUsedAt: null,
        pairCodeLast4: pairCode.slice(-4),
        updatedAt: now,
      },
      { merge: true }
    );

    // Auditoria (histórico)
    await writeHistory(db, {
      type: "patient_pair_code_issued",
      createdAt: now,
      payload: {
        uid,
        patientExternalId: d?.patientExternalId ?? null,
        phoneCanonical: d?.phoneCanonical ?? null,
        last4: pairCode.slice(-4),
      },
    });

    await logAdminAudit({
      req,
      actorUid: auth.uid,
      actorEmail: auth.decoded?.email || null,
      action: "patient_pair_code_issued",
      target: uid,
      meta: {
        patientExternalId: d?.patientExternalId ?? null,
        phoneCanonical: d?.phoneCanonical ?? null,
        last4: pairCode.slice(-4),
      },
    });

    return NextResponse.json({ ok: true, uid, pairCode, last4: pairCode.slice(-4) });
  } catch (err) {
    return adminError({ req, auth: auth?.ok ? auth : null, action: "patient_pair_code", err });
  }
}
