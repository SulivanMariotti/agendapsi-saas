import { NextResponse } from 'next/server';
import admin from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { rateLimit } from "@/lib/server/rateLimit";
import { logAdminAudit } from "@/lib/server/auditLog";
import { adminError } from "@/lib/server/adminError";
import { writeHistory } from "@/lib/server/historyLog";
export const runtime = "nodejs";
// POST /api/admin/users/repair-roles
// Corrige docs legados em users/{uid} que ficaram com role ausente (null/undefined),
// definindo role:"patient" quando o registro aparenta ser um paciente válido.
function getDb() {
  return admin.firestore();
}

function isTruthy(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

export async function POST(req) {
  let auth = null;
  try {
    auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const rl = await rateLimit(req, { bucket: "admin:users:repair-roles", uid: auth.uid, limit: 5, windowMs: 10 * 60_000 });
    if (!rl.ok) return rl.res;


    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body?.limit || 500), 1), 2000);
    const dryRun = Boolean(body?.dryRun);

    const db = getDb();

    const snap = await db.collection('users').limit(limit).get();
    const docs = snap.docs;

    let scanned = 0;
    let updated = 0;
    let skipped = 0;

    const updates = [];
    const now = admin.firestore.FieldValue.serverTimestamp();

    for (const d of docs) {
      scanned += 1;
      const data = d.data() || {};

      const role = data?.role;
      const hasRole = typeof role === 'string' && role.trim().length > 0;
      if (hasRole) {
        skipped += 1;
        continue;
      }

      const status = String(data?.status || 'active').toLowerCase();
      if (status === 'inactive') {
        skipped += 1;
        continue;
      }

      const name = String(data?.name || '').trim();
      const phoneCanonical = String(data?.phoneCanonical || data?.phone || '').trim();
      const patientExternalId = String(data?.patientExternalId || '').trim();

      // Considera "paciente válido" quando tem os identificadores essenciais.
      if (!isTruthy(name) || !isTruthy(phoneCanonical) || !isTruthy(patientExternalId)) {
        skipped += 1;
        continue;
      }

      updated += 1;

      if (!dryRun) {
        updates.push(
          d.ref.set(
            {
              role: 'patient',
              // manter compatibilidade
              phoneCanonical,
              phone: phoneCanonical,
              updatedAt: now,
            },
            { merge: true }
          )
        );
      }
    }

    if (!dryRun && updates.length) {
      // Executa updates com concorrência simples (Promise.all ok para até ~2k)
      await Promise.all(updates);
    }

    // Log em history
    try {
      if (!dryRun) {
        await writeHistory(db, {
          action: 'repair_roles',
          scope: 'users',
          scanned,
          updated,
          skipped,
          createdAt: now,
        });
      }
    } catch (e) {
      console.warn('[repair-roles] failed to write history log', e);
    }

    await logAdminAudit({
      req,
      actorUid: auth.uid,
      actorEmail: auth.decoded?.email || null,
      action: "users_repair_roles",
      meta: { dryRun, limit, scanned, updated, skipped },
    });

    return NextResponse.json({
      ok: true,
      dryRun,
      scanned,
      updated,
      skipped,
    });
  } catch (e) {
    return adminError({ req, auth: auth?.ok ? auth : null, action: 'users_repair_roles', err: e });
  }
}