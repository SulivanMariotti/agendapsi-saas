import { NextResponse } from 'next/server';
import admin from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/server/requireAdmin';
import { rateLimit } from '@/lib/server/rateLimit';
import { adminError } from '@/lib/server/adminError';
import { logAdminAudit } from '@/lib/server/auditLog';
import { writeHistory } from '@/lib/server/historyLog';

export const runtime = 'nodejs';

const MAX_MATCHES = 50;

function norm(v) {
  return String(v || '').trim();
}

function digitsOnly(v) {
  return String(v || '').replace(/\D+/g, '');
}

export async function POST(req) {
  let auth = null;
  try {
    auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const rl = await rateLimit(req, {
      bucket: 'admin:fat-analysis:delete',
      uid: auth.uid,
      limit: 20,
      windowMs: 60_000,
    });
    if (!rl.ok) return rl.res;

    const body = await req.json().catch(() => ({}));
    const numberRaw = norm(body?.number);
    const competenceMonth = norm(body?.competenceMonth);
    const dryRun = Boolean(body?.dryRun);
    const confirm = norm(body?.confirm);

    const number = digitsOnly(numberRaw);
    if (!number) {
      return NextResponse.json({ ok: false, error: 'Informe o número da NFS-e.' }, { status: 400 });
    }

    if (!dryRun && confirm !== 'EXCLUIR') {
      return NextResponse.json(
        { ok: false, error: 'Confirmação inválida. Para excluir, digite EXCLUIR.' },
        { status: 400 }
      );
    }

    const db = admin.firestore();
    let q = db.collection('fat_nfse_invoices').where('nNFSe', '==', number);
    if (competenceMonth) q = q.where('competenceMonth', '==', competenceMonth);

    const snap = await q.limit(MAX_MATCHES).get();
    const matches = snap.docs.map((d) => {
      const x = d.data() || {};
      return {
        id: d.id,
        nNFSe: x.nNFSe || null,
        competenceMonth: x.competenceMonth || null,
        issueAt: x.issueAt || null,
        tomadorDoc: x.tomadorDoc || null,
        tomadorName: x.tomadorName || null,
        gross: Number(x.gross || 0),
        net: Number(x.net || 0),
      };
    });

    if (dryRun) {
      await writeHistory(db, {
        type: 'FAT_ANALYSIS_DELETE_DRYRUN',
        uid: auth.uid,
        number,
        competenceMonth: competenceMonth || null,
        matches: matches.length,
      });

      return NextResponse.json({ ok: true, dryRun: true, number, competenceMonth: competenceMonth || '', matches });
    }

    // delete
    const batch = db.batch();
    for (const d of snap.docs) batch.delete(d.ref);
    await batch.commit();

    await writeHistory(db, {
      type: 'FAT_ANALYSIS_DELETE',
      uid: auth.uid,
      number,
      competenceMonth: competenceMonth || null,
      deleted: matches.length,
    });

    await logAdminAudit({
      req,
      actorUid: auth.uid,
      action: 'fat_analysis_delete',
      status: 'success',
      meta: {
        number,
        competenceMonth: competenceMonth || null,
        deleted: matches.length,
      },
    });

    return NextResponse.json({ ok: true, deleted: matches.length, number, competenceMonth: competenceMonth || '' });
  } catch (e) {
    try {
      await logAdminAudit({
        req,
        actorUid: auth?.uid || null,
        action: 'fat_analysis_delete',
        status: 'error',
        meta: { error: String(e?.message || e) },
      });
    } catch (_) {
      // ignore
    }
    return adminError(e);
  }
}
