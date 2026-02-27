import { NextResponse } from 'next/server';
import admin from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/server/requireAdmin';
import { rateLimit } from '@/lib/server/rateLimit';
import { adminError } from '@/lib/server/adminError';
import { logAdminAudit } from '@/lib/server/auditLog';

export const runtime = 'nodejs';

const COLL_INVOICES = 'fat_nfse_invoices';

function clampInt(v, defVal, min, max) {
  const n = parseInt(String(v || ''), 10);
  if (!Number.isFinite(n)) return defVal;
  return Math.max(min, Math.min(max, n));
}

function normDigits(v) {
  return String(v || '').replace(/\D+/g, '');
}

function sum(items) {
  const out = {
    count: 0,
    gross: 0,
    net: 0,
    iss: 0,
    pis: 0,
    cofins: 0,
    irrf: 0,
    csll: 0,
    totalRet: 0,
    totTribFed: 0,
    totTribEst: 0,
    totTribMun: 0,
  };
  (items || []).forEach((n) => {
    out.count += 1;
    out.gross += Number(n?.gross || 0);
    out.net += Number(n?.net || 0);
    out.iss += Number(n?.iss || 0);
    out.pis += Number(n?.pis || 0);
    out.cofins += Number(n?.cofins || 0);
    out.irrf += Number(n?.irrf || 0);
    out.csll += Number(n?.csll || 0);
    out.totalRet += Number(n?.totalRet || 0);
    out.totTribFed += Number(n?.totTribFed || 0);
    out.totTribEst += Number(n?.totTribEst || 0);
    out.totTribMun += Number(n?.totTribMun || 0);
  });
  return out;
}

function groupByTomador(items) {
  const map = new Map();
  (items || []).forEach((n) => {
    const doc = String(n?.tomadorDoc || '').trim() || 'unknown';
    const name = String(n?.tomadorName || '').trim() || '—';
    const key = `${doc}::${name}`;
    if (!map.has(key)) map.set(key, { doc: doc === 'unknown' ? '' : doc, name, gross: 0, net: 0 });
    const cur = map.get(key);
    cur.gross += Number(n?.gross || 0);
    cur.net += Number(n?.net || 0);
  });
  const out = Array.from(map.values());
  out.sort((a, b) => (b.gross || 0) - (a.gross || 0));
  return out;
}

export async function GET(req) {
  let auth = null;
  try {
    auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const rl = await rateLimit(req, {
      bucket: 'admin:fat-analysis:query',
      uid: auth.uid,
      limit: 60,
      windowMs: 60_000,
    });
    if (!rl.ok) return rl.res;

    const url = new URL(req.url);
    const competenceMonth = String(url.searchParams.get('competenceMonth') || '').trim();
    const from = String(url.searchParams.get('from') || '').trim();
    const to = String(url.searchParams.get('to') || '').trim();
    const tomadorDoc = normDigits(url.searchParams.get('tomadorDoc') || '');
    const limit = clampInt(url.searchParams.get('limit'), 800, 50, 2500);

    const db = admin.firestore();
    let q = db.collection(COLL_INVOICES);

    // Escolhe o filtro primário para evitar necessidade de índices compostos
    if (competenceMonth) {
      q = q.where('competenceMonth', '==', competenceMonth).orderBy('emissionDate', 'asc');
    } else if (from || to) {
      const f = from || '0000-00-00';
      const t = to || '9999-12-31';
      q = q.where('emissionDate', '>=', f).where('emissionDate', '<=', t).orderBy('emissionDate', 'asc');
    } else {
      q = q.orderBy('emissionDate', 'desc');
    }

    const snap = await q.limit(limit).get();
    let notes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Filtros secundários em memória (evita índice composto)
    if (tomadorDoc) {
      notes = notes.filter((n) => String(n?.tomadorDoc || '') === tomadorDoc);
    }
    if (competenceMonth && (from || to)) {
      const f = from || '0000-00-00';
      const t = to || '9999-12-31';
      notes = notes.filter((n) => {
        const d = String(n?.emissionDate || '');
        return d >= f && d <= t;
      });
    }

    // Compatibilidade com UI (mesma shape do parser)
    const byMonthMap = {};
    notes.forEach((n) => {
      const m = String(n?.competenceMonth || 'unknown');
      if (!byMonthMap[m]) byMonthMap[m] = [];
      byMonthMap[m].push(n);
    });
    const months = Object.keys(byMonthMap).sort();
    const summaryByMonth = {};
    const byTomador = { all: groupByTomador(notes) };
    months.forEach((m) => {
      summaryByMonth[m] = sum(byMonthMap[m]);
      byTomador[m] = groupByTomador(byMonthMap[m]);
    });
    const totals = sum(notes);

    await logAdminAudit({
      req,
      actorUid: auth.uid,
      action: 'fat_analysis_query',
      status: 'success',
      meta: {
        competenceMonth: competenceMonth || null,
        from: from || null,
        to: to || null,
        tomadorDoc: tomadorDoc ? `***${tomadorDoc.slice(-4)}` : null,
        returned: notes.length,
        limit,
      },
    });

    return NextResponse.json({
      ok: true,
      notes,
      months,
      summaryByMonth,
      byTomador,
      totals,
      meta: { countNotes: notes.length },
    });
  } catch (e) {
    try {
      await logAdminAudit({
        req,
        actorUid: auth?.uid || null,
        action: 'fat_analysis_query',
        status: 'error',
        meta: { error: String(e?.message || e) },
      });
    } catch (_) {
      // ignore
    }
    return adminError(e);
  }
}
