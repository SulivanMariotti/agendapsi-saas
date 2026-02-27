import { NextResponse } from 'next/server';
import admin from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/server/requireAdmin';
import { rateLimit } from '@/lib/server/rateLimit';
import { adminError } from '@/lib/server/adminError';
import { logAdminAudit } from '@/lib/server/auditLog';
import { writeHistory } from '@/lib/server/historyLog';
import { parseNFSeXMLBatch } from '@/lib/server/nfseXmlParser';

export const runtime = 'nodejs';

const MAX_FILES = 15;
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB
const MAX_TOTAL_BYTES = 40 * 1024 * 1024; // 40MB

function toInt(v, defVal) {
  const n = parseInt(String(v || ''), 10);
  return Number.isFinite(n) ? n : defVal;
}

export async function POST(req) {
  let auth = null;
  try {
    auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const rl = await rateLimit(req, {
      bucket: 'admin:fat-analysis:parse',
      uid: auth.uid,
      limit: 30,
      windowMs: 60_000,
    });
    if (!rl.ok) return rl.res;

    const fd = await req.formData();
    const files = fd.getAll('files') || [];

    if (!files.length) {
      return NextResponse.json({ ok: false, error: 'Envie 1 ou mais arquivos XML no campo "files".' }, { status: 400 });
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { ok: false, error: `Muitos arquivos: máximo ${MAX_FILES}.` },
        { status: 400 }
      );
    }

    let totalBytes = 0;
    const xmlTexts = [];

    for (const f of files) {
      const size = toInt(f?.size, 0);
      if (size <= 0) continue;
      if (size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { ok: false, error: `Arquivo muito grande (${Math.round(size / 1024 / 1024)}MB). Máximo: ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB.` },
          { status: 413 }
        );
      }
      totalBytes += size;
      if (totalBytes > MAX_TOTAL_BYTES) {
        return NextResponse.json(
          { ok: false, error: `Total de upload excede ${Math.round(MAX_TOTAL_BYTES / 1024 / 1024)}MB.` },
          { status: 413 }
        );
      }

      const text = await f.text();
      xmlTexts.push(text);
    }

    const parsed = parseNFSeXMLBatch(xmlTexts);

    if (!parsed?.meta?.countNotes) {
      return NextResponse.json(
        { ok: false, error: 'Nenhuma NFS-e encontrada no(s) XML enviado(s). Confirme se o arquivo é NFS-e (SPED NFS-e) e não NF-e (modelo 55).' },
        { status: 400 }
      );
    }

    // Minimal logging (no raw XML)
    const db = admin.firestore();
    await writeHistory(db, {
      type: 'FAT_ANALYSIS_PARSE',
      uid: auth.uid,
      files: files.length,
      notes: parsed?.meta?.countNotes || 0,
      months: (parsed?.months || []).slice(0, 24),
      totals: parsed?.totals || null,
    });

    await logAdminAudit({
      req,
      actorUid: auth.uid,
      action: 'fat_analysis_parse',
      status: 'success',
      meta: {
        files: files.length,
        notes: parsed?.meta?.countNotes || 0,
        months: (parsed?.months || []).slice(0, 24),
      },
    });

    return NextResponse.json({ ok: true, ...parsed });
  } catch (e) {
    try {
      await logAdminAudit({
        req,
        actorUid: auth?.uid || null,
        action: 'fat_analysis_parse',
        status: 'error',
        meta: { error: String(e?.message || e) },
      });
    } catch (_) {
      // ignore
    }

    return adminError(e);
  }
}
