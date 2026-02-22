import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { adminError } from "@/lib/server/adminError";
import { logAdminAudit } from "@/lib/server/auditLog";
import { writeHistory } from "@/lib/server/historyLog";
import {
  asPlainObject,
  enforceAllowedKeys,
  getBoolean,
  getNumber,
  readJsonBody,
} from "@/lib/server/payloadSchema";

export const runtime = "nodejs";

/**
 * Admin: Higienização — cancelar sessões futuras fora da janela operacional.
 * Endpoint: POST /api/admin/appointments/prune-future
 *
 * Motivação:
 * - Em testes, pode existir agenda gerada por meses.
 * - O sistema opera por janela rolante (ex.: hoje -> +30 dias).
 * - Para evitar resíduos e inconsistências, esta rotina cancela (NÃO apaga)
 *   sessões futuras além de X dias.
 *
 * Regras:
 * - Só afeta appointments com source === 'admin_sync'
 * - Não mexe em status 'done'/'cancelled'
 * - Marca como status 'cancelled' com cancelledReason 'pruned_outside_window'
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

function addDays(d, days) {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

function isTestToolsEnabled() {
  // Em produção, esta rota só deve existir se a clínica habilitar explicitamente.
  if (process.env.NODE_ENV !== "production") return true;
  const v = String(process.env.ENABLE_TEST_TOOLS || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export async function POST(req) {
  let auth = null;
  try {
    initAdmin();

    auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    if (!isTestToolsEnabled()) {
      return NextResponse.json({ ok: false, error: "test_tools_disabled" }, { status: 403 });
    }

    const rl = await rateLimit(req, {
      bucket: "admin:appointments:prune-future",
      uid: auth.uid,
      limit: 10,
      windowMs: 60_000,
    });
    if (!rl.ok) return rl.res;

    const rb = await readJsonBody(req, { maxBytes: 20_000 });
    if (!rb.ok) return NextResponse.json({ ok: false, error: rb.error }, { status: 400 });

    const po = asPlainObject(rb.value);
    if (!po.ok) return NextResponse.json({ ok: false, error: po.error }, { status: 400 });

    const ek = enforceAllowedKeys(po.value, ["daysAhead", "dryRun"], { label: "AppointmentsPruneFuture" });
    if (!ek.ok) return NextResponse.json({ ok: false, error: ek.error }, { status: 400 });

    const daysRes = getNumber(po.value, "daysAhead", {
      required: false,
      min: 7,
      max: 365,
      defaultValue: 32,
    });
    if (!daysRes.ok) return NextResponse.json({ ok: false, error: daysRes.error }, { status: 400 });

    const dryRes = getBoolean(po.value, "dryRun", { required: false, defaultValue: true });
    if (!dryRes.ok) return NextResponse.json({ ok: false, error: dryRes.error }, { status: 400 });

    const daysAhead = Number(daysRes.value || 32);
    const dryRun = !!dryRes.value;

    const db = admin.firestore();
    const now = new Date();
    const cutoff = addDays(now, daysAhead);
    const cutoffTs = admin.firestore.Timestamp.fromDate(cutoff);

    let scanned = 0;
    let matched = 0;
    let updated = 0;

    const PAGE_SIZE = 500;
    let last = null;

    while (true) {
      let q = db
        .collection("appointments")
        .where("startAt", ">", cutoffTs)
        .orderBy("startAt", "asc")
        .limit(PAGE_SIZE);
      if (last) q = q.startAfter(last);

      const snap = await q.get();
      if (snap.empty) break;

      scanned += snap.size || 0;

      const batch = db.batch();
      let batchWrites = 0;

      snap.docs.forEach((docSnap) => {
        const a = docSnap.data() || {};
        const status = String(a.status || "").toLowerCase();
        if (status === "cancelled" || status === "done") return;
        if (String(a.source || "") !== "admin_sync") return;

        matched += 1;
        if (dryRun) return;

        batch.update(docSnap.ref, {
          status: "cancelled",
          cancelledBy: "maintenance",
          cancelledReason: "pruned_outside_window",
          cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        batchWrites += 1;
      });

      if (!dryRun && batchWrites > 0) {
        await batch.commit();
        updated += batchWrites;
      }

      last = snap.docs[snap.docs.length - 1];
      if ((snap.size || 0) < PAGE_SIZE) break;
    }

    await writeHistory(db, {
      type: "appointments_prune_future",
      dryRun,
      daysAhead,
      cutoffISO: cutoff.toISOString(),
      scanned,
      matched,
      updated,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await logAdminAudit({
      req,
      actorUid: auth.uid,
      actorEmail: auth.decoded?.email || null,
      action: "appointments_prune_future",
      target: `cutoff:${cutoff.toISOString()}`,
      meta: { dryRun, daysAhead, scanned, matched, updated },
    });

    return NextResponse.json({
      ok: true,
      dryRun,
      daysAhead,
      cutoffISO: cutoff.toISOString(),
      scanned,
      matched,
      updated,
    });
  } catch (e) {
    return adminError({ req, auth: auth?.ok ? auth : null, action: "appointments_prune_future", err: e });
  }
}
