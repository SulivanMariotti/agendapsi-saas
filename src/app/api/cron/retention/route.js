import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { logAdminAudit } from "@/lib/server/auditLog";
import { requireCron } from "@/lib/server/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/cron/retention
// Purges expired docs from history and audit_logs.
// Security: header-only in production.
//  - Authorization: Bearer <secret>
//  - or x-cron-secret: <secret>
// Legacy query (?key=) is disabled in production unless ALLOW_CRON_QUERY_KEY=true.

function toInt(v, defVal) {
  const n = parseInt(String(v || ""), 10);
  return Number.isFinite(n) ? n : defVal;
}

function daysToMs(days) {
  return Math.max(1, days) * 24 * 60 * 60 * 1000;
}

function getHistoryRetentionDays() {
  return Math.max(7, toInt(process.env.HISTORY_RETENTION_DAYS, 180));
}

function getAuditRetentionDays() {
  return Math.max(30, toInt(process.env.AUDIT_RETENTION_DAYS, 365));
}

async function purgeByField(db, collectionName, fieldName, cutoffTs, limit = 400) {
  let deleted = 0;

  while (true) {
    const snap = await db.collection(collectionName).where(fieldName, "<=", cutoffTs).limit(limit).get();

    if (snap.empty) break;

    const batch = db.batch();
    for (const d of snap.docs) batch.delete(d.ref);
    await batch.commit();

    deleted += snap.size;

    // Safety stop (avoid runaway)
    if (deleted >= 5000) break;
  }

  return deleted;
}

export async function GET(req) {
  const guard = requireCron(req);
  if (guard) return guard;

  try {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.fromDate(new Date());

    const historyCutoff = admin.firestore.Timestamp.fromDate(new Date(Date.now() - daysToMs(getHistoryRetentionDays())));
    const auditCutoff = admin.firestore.Timestamp.fromDate(new Date(Date.now() - daysToMs(getAuditRetentionDays())));

    // 1) Prefer TTL field expireAt
    const deletedHistoryExpire = await purgeByField(db, "history", "expireAt", now);
    const deletedAuditExpire = await purgeByField(db, "audit_logs", "expireAt", now);

    // 2) Fallback for older docs without expireAt
    const deletedHistoryCreated = await purgeByField(db, "history", "createdAt", historyCutoff);
    const deletedAuditCreated = await purgeByField(db, "audit_logs", "createdAt", auditCutoff);

    const totalHistory = deletedHistoryExpire + deletedHistoryCreated;
    const totalAudit = deletedAuditExpire + deletedAuditCreated;

    // Audit the purge (do NOT write into history to avoid self-noise)
    await logAdminAudit({
      req,
      actorUid: "cron",
      actorEmail: null,
      action: "retention_purge",
      target: null,
      meta: {
        history: { deletedExpire: deletedHistoryExpire, deletedCreated: deletedHistoryCreated, total: totalHistory },
        audit: { deletedExpire: deletedAuditExpire, deletedCreated: deletedAuditCreated, total: totalAudit },
        historyRetentionDays: getHistoryRetentionDays(),
        auditRetentionDays: getAuditRetentionDays(),
      },
    });

    return NextResponse.json({
      ok: true,
      history: { deletedExpire: deletedHistoryExpire, deletedCreated: deletedHistoryCreated, total: totalHistory },
      audit_logs: { deletedExpire: deletedAuditExpire, deletedCreated: deletedAuditCreated, total: totalAudit },
      note: "If Firestore TTL is enabled on expireAt, this route can be optional.",
    });
  } catch {
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
