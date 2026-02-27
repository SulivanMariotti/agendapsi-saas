import { NextResponse } from 'next/server';
import admin from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/server/requireAdmin';
import { rateLimit } from '@/lib/server/rateLimit';
import { adminError } from '@/lib/server/adminError';
import { logAdminAudit } from '@/lib/server/auditLog';
import { writeHistory } from '@/lib/server/historyLog';
import { makeBatchId } from '@/lib/server/batchId';
import { parseNFSeXMLBatch } from '@/lib/server/nfseXmlParser';

export const runtime = 'nodejs';

const MAX_FILES = 20;
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB
const MAX_TOTAL_BYTES = 60 * 1024 * 1024; // 60MB
const MAX_NOTES = 8000;

const COLL_INVOICES = 'fat_nfse_invoices';
const COLL_BATCHES = 'fat_nfse_import_batches';

function toInt(v, defVal) {
  const n = parseInt(String(v || ''), 10);
  return Number.isFinite(n) ? n : defVal;
}

function safeDocId(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  // Firestore docId: forbid '/' and keep it readable
  const out = s.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  return out.slice(0, 700);
}

function tsFromIso(iso) {
  const s = String(iso || '').trim();
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return null;
  return admin.firestore.Timestamp.fromDate(d);
}

function buildInvoiceId(n, idx = 0) {
  const nfseId = safeDocId(n?.nfseId);
  if (nfseId) return nfseId;
  const emit = safeDocId(n?.emitCNPJ);
  const num = safeDocId(n?.nNFSe || n?.nDPS);
  const ymd = safeDocId(n?.emissionDate || n?.competenceDate);
  const serie = safeDocId(n?.serie);
  const key = [emit, serie, num, ymd].filter(Boolean).join('_');
  return key || `nfse_${idx}`;
}

function mapNoteToDoc(n, batchId) {
  const emissionAt = tsFromIso(n?.emissionIso);
  return {
    kind: 'nfse',
    nfseId: String(n?.nfseId || ''),
    nNFSe: String(n?.nNFSe || ''),
    serie: String(n?.serie || ''),
    nDPS: String(n?.nDPS || ''),

    emitCNPJ: String(n?.emitCNPJ || ''),
    emitName: String(n?.emitName || ''),

    tomadorDoc: String(n?.tomadorDoc || ''),
    tomadorName: String(n?.tomadorName || ''),

    emissionIso: String(n?.emissionIso || ''),
    emissionDate: String(n?.emissionDate || ''), // YYYY-MM-DD (string)
    emissionMonth: String(n?.emissionMonth || ''), // YYYY-MM
    emissionAt,

    competenceDate: String(n?.competenceDate || ''),
    competenceMonth: String(n?.competenceMonth || ''),

    gross: Number(n?.gross || 0),
    net: Number(n?.net || 0),
    iss: Number(n?.iss || 0),
    pis: Number(n?.pis || 0),
    cofins: Number(n?.cofins || 0),
    irrf: Number(n?.irrf || 0),
    csll: Number(n?.csll || 0),
    totalRet: Number(n?.totalRet || 0),

    calcV: 2,

    totTribFed: Number(n?.totTribFed || 0),
    totTribEst: Number(n?.totTribEst || 0),
    totTribMun: Number(n?.totTribMun || 0),

    importBatchId: String(batchId || ''),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

export async function POST(req) {
  let auth = null;
  try {
    auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const rl = await rateLimit(req, {
      bucket: 'admin:fat-analysis:import',
      uid: auth.uid,
      limit: 20,
      windowMs: 60_000,
    });
    if (!rl.ok) return rl.res;

    const fd = await req.formData();
    const files = fd.getAll('files') || [];

    if (!files.length) {
      return NextResponse.json({ ok: false, error: 'Envie 1 ou mais arquivos XML no campo "files".' }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json({ ok: false, error: `Muitos arquivos: máximo ${MAX_FILES}.` }, { status: 400 });
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
        return NextResponse.json({ ok: false, error: `Total de upload excede ${Math.round(MAX_TOTAL_BYTES / 1024 / 1024)}MB.` }, { status: 413 });
      }
      xmlTexts.push(await f.text());
    }

    const parsed = parseNFSeXMLBatch(xmlTexts);
    const notes = Array.isArray(parsed?.notes) ? parsed.notes : [];
    if (!notes.length) {
      return NextResponse.json(
        { ok: false, error: 'Nenhuma NFS-e encontrada no(s) XML enviado(s). Confirme se o arquivo é NFS-e (SPED NFS-e).' },
        { status: 400 }
      );
    }
    if (notes.length > MAX_NOTES) {
      return NextResponse.json(
        { ok: false, error: `Muitas notas no lote (${notes.length}). Máximo: ${MAX_NOTES}.` },
        { status: 413 }
      );
    }

    const batchId = makeBatchId('fat_import');
    const db = admin.firestore();

    // De-dup dentro do próprio upload (mesmo invoiceId repetido)
    const uniqueById = new Map();
    notes.forEach((n, idx) => {
      const id = buildInvoiceId(n, idx);
      if (!uniqueById.has(id)) uniqueById.set(id, { note: n, idx });
    });

    const ids = Array.from(uniqueById.keys());
    const refs = ids.map((id) => db.collection(COLL_INVOICES).doc(id));

    // Verifica existentes em um único round-trip (mais barato e consistente)
    const snaps = refs.length ? await db.getAll(...refs) : [];
    const existing = new Set();
    snaps.forEach((s, i) => {
      if (s?.exists) existing.add(ids[i]);
    });

    const importedIds = [];
    const duplicateIds = [];
    const batch = db.batch();

    ids.forEach((id) => {
      if (existing.has(id)) {
        duplicateIds.push(id);
        return;
      }
      const payload = uniqueById.get(id);
      const docData = mapNoteToDoc(payload.note, batchId);
      batch.set(db.collection(COLL_INVOICES).doc(id), docData, { merge: false });
      importedIds.push(id);
    });

    // Import batch record (sem XML bruto)
    batch.set(db.collection(COLL_BATCHES).doc(batchId), {
      batchId,
      kind: 'nfse',
      filesCount: files.length,
      notesFound: notes.length,
      uniqueNotes: ids.length,
      imported: importedIds.length,
      duplicated: duplicateIds.length,
      months: (parsed?.months || []).slice(0, 60),
      totals: parsed?.totals || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: auth.uid,
    });

    await batch.commit();

    await writeHistory(db, {
      type: 'FAT_ANALYSIS_IMPORT',
      uid: auth.uid,
      batchId,
      files: files.length,
      notes: notes.length,
      unique: ids.length,
      imported: importedIds.length,
      duplicated: duplicateIds.length,
      months: (parsed?.months || []).slice(0, 24),
      totals: parsed?.totals || null,
    });

    await logAdminAudit({
      req,
      actorUid: auth.uid,
      action: 'fat_analysis_import',
      status: 'success',
      meta: {
        batchId,
        files: files.length,
        notes: notes.length,
        unique: ids.length,
        imported: importedIds.length,
        duplicated: duplicateIds.length,
        months: (parsed?.months || []).slice(0, 24),
      },
    });

    return NextResponse.json({
      ok: true,
      batchId,
      imported: importedIds.length,
      duplicated: duplicateIds.length,
      unique: ids.length,
      notesFound: notes.length,
      months: parsed?.months || [],
      summaryByMonth: parsed?.summaryByMonth || {},
      byTomador: parsed?.byTomador || {},
      totals: parsed?.totals || null,
      meta: {
        countNotes: notes.length,
      },
    });
  } catch (e) {
    try {
      await logAdminAudit({
        req,
        actorUid: auth?.uid || null,
        action: 'fat_analysis_import',
        status: 'error',
        meta: { error: String(e?.message || e) },
      });
    } catch (_) {
      // ignore
    }
    return adminError(e);
  }
}
