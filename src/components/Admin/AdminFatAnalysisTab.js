import React, { useMemo, useState } from 'react';
import { Upload, Download, FileText, AlertTriangle } from 'lucide-react';
import { adminFetch } from '../../services/adminApi';

function moneyBRL(v) {
  const n = Number(v || 0);
  try {
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch (_) {
    return `R$ ${n.toFixed(2)}`;
  }
}

function safeText(v, max = 160) {
  const s = String(v || '').trim();
  if (!s) return '';
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function downloadTextFile(filename, text, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toCSV(rows, headers) {
  const esc = (v) => {
    const s = String(v ?? '');
    if (s.includes('"') || s.includes(';') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const head = headers.map((h) => esc(h.label)).join(';');
  const body = rows
    .map((r) => headers.map((h) => esc(r[h.key])).join(';'))
    .join('\n');

  return head + '\n' + body + (body ? '\n' : '');
}

function monthToRange(ym) {
  // ym: YYYY-MM
  const s = String(ym || '').trim();
  if (!/^\d{4}-\d{2}$/.test(s)) return null;
  const [yStr, mStr] = s.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;

  // last day of month (UTC-safe)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const from = `${s}-01`;
  const to = `${yStr}-${mStr}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

export default function AdminFatAnalysisTab({ showToast }) {
  const [view, setView] = useState('import'); // import | history | delete
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState('');

  const [importMeta, setImportMeta] = useState(null);

  // History filters
  const [qCompetenceMonth, setQCompetenceMonth] = useState('');
  const [qFrom, setQFrom] = useState('');
  const [qTo, setQTo] = useState('');
  const [qTomadorDoc, setQTomadorDoc] = useState('');

  // Delete (by NFS-e number)
  const [delNumber, setDelNumber] = useState('');
  const [delCompetenceMonth, setDelCompetenceMonth] = useState('');
  const [delConfirm, setDelConfirm] = useState('');
  const [delMatches, setDelMatches] = useState([]);

  const months = useMemo(() => {
    const m = result?.months || [];
    return Array.isArray(m) ? m : [];
  }, [result]);

  const monthSummary = useMemo(() => {
    if (!result || !selectedMonth) return null;
    return result?.summaryByMonth?.[selectedMonth] || null;
  }, [result, selectedMonth]);

  const filteredNotes = useMemo(() => {
    const all = result?.notes || [];
    if (!Array.isArray(all)) return [];
    if (!selectedMonth) return all;
    return all.filter((n) => String(n?.competenceMonth || '') === String(selectedMonth));
  }, [result, selectedMonth]);

  const byTomador = useMemo(() => {
    const map = result?.byTomador?.[selectedMonth] || result?.byTomador?.all || null;
    if (!map || !Array.isArray(map)) return [];
    return map;
  }, [result, selectedMonth]);

  const onPickFiles = (e) => {
    const list = Array.from(e?.target?.files || []);
    setFiles(list);
    setError(null);
    setResult(null);
    setSelectedMonth('');
    setImportMeta(null);
    setDelMatches([]);
  };

  const runParse = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!files || files.length === 0) {
        setError('Selecione 1 ou mais arquivos XML.');
        return;
      }

      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));

      const res = await adminFetch('/api/admin/fat-analysis/parse', {
        method: 'POST',
        body: fd,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'Falha ao analisar XML.');
      }

      setResult(data);
      const firstMonth = (data?.months || [])[0] || '';
      setSelectedMonth(firstMonth);
      setImportMeta(null);
      showToast?.('Análise concluída ✅');
    } catch (e) {
      setError(e?.message || 'Falha ao analisar XML.');
      showToast?.(e?.message || 'Falha ao analisar XML.');
    } finally {
      setLoading(false);
    }
  };

  const runImport = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!files || files.length === 0) {
        setError('Selecione 1 ou mais arquivos XML.');
        return;
      }

      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));

      const res = await adminFetch('/api/admin/fat-analysis/import', {
        method: 'POST',
        body: fd,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Falha ao importar XML.');

      setResult(data);
      const firstMonth = (data?.months || [])[0] || '';
      setSelectedMonth(firstMonth);
      setImportMeta({
        batchId: data?.batchId || '',
        imported: Number(data?.imported || 0),
        duplicated: Number(data?.duplicated || 0),
        unique: Number(data?.unique || 0),
        notesFound: Number(data?.notesFound || 0),
      });
      showToast?.('Importado e salvo ✅');
    } catch (e) {
      setError(e?.message || 'Falha ao importar XML.');
      showToast?.(e?.message || 'Falha ao importar XML.');
    } finally {
      setLoading(false);
    }
  };

  const runQuery = async () => {
    try {
      setLoading(true);
      setError(null);

      const qs = new URLSearchParams();

      // ✅ Compat/robustez: quando o usuário filtra por "Competência (YYYY-MM)",
      // fazemos a consulta pelo intervalo de emissão do mês.
      // Motivo: alguns backends/índices podem falhar no filtro direto por competenceMonth.
      let from = qFrom;
      let to = qTo;
      if (qCompetenceMonth && !from && !to) {
        const r = monthToRange(qCompetenceMonth);
        if (r) {
          from = r.from;
          to = r.to;
        }
      }

      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      if (qTomadorDoc) qs.set('tomadorDoc', qTomadorDoc);
      qs.set('limit', '2500');

      const res = await adminFetch(`/api/admin/fat-analysis/query?${qs.toString()}`, { method: 'GET' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Falha ao consultar histórico.');

      setResult(data);
      const firstMonth = (data?.months || [])[0] || '';
      setSelectedMonth(firstMonth);
      setImportMeta(null);
      showToast?.('Consulta carregada ✅');
    } catch (e) {
      setError(e?.message || 'Falha ao consultar histórico.');
      showToast?.(e?.message || 'Falha ao consultar histórico.');
    } finally {
      setLoading(false);
    }
  };

  const runDeleteDryRun = async () => {
    try {
      setLoading(true);
      setError(null);
      setDelMatches([]);

      const number = String(delNumber || '').trim();
      if (!number) {
        setError('Informe o número da NFS-e para verificar/excluir.');
        return;
      }

      const res = await adminFetch('/api/admin/fat-analysis/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number,
          competenceMonth: String(delCompetenceMonth || '').trim(),
          dryRun: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Falha ao verificar exclusão.');

      setDelMatches(Array.isArray(data?.matches) ? data.matches : []);
      showToast?.('Verificação concluída ✅');
    } catch (e) {
      setError(e?.message || 'Falha ao verificar exclusão.');
      showToast?.(e?.message || 'Falha ao verificar exclusão.');
    } finally {
      setLoading(false);
    }
  };

  const runDeleteCommit = async () => {
    try {
      setLoading(true);
      setError(null);

      const number = String(delNumber || '').trim();
      if (!number) {
        setError('Informe o número da NFS-e para excluir.');
        return;
      }
      if (String(delConfirm || '').trim() !== 'EXCLUIR') {
        setError('Confirmação inválida. Para excluir, digite EXCLUIR.');
        return;
      }

      const res = await adminFetch('/api/admin/fat-analysis/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number,
          competenceMonth: String(delCompetenceMonth || '').trim(),
          dryRun: false,
          confirm: 'EXCLUIR',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Falha ao excluir NFS-e.');

      // Atualiza a lista local (se estiver mostrando um resultado de consulta/importação)
      if (result?.notes && Array.isArray(result.notes)) {
        const idsToRemove = new Set((delMatches || []).map((m) => String(m?.id || '')).filter(Boolean));
        if (idsToRemove.size) {
          const nextNotes = result.notes.filter((n) => !idsToRemove.has(String(n?.id || '')));
          const byMonthMap = {};
          nextNotes.forEach((n) => {
            const m = String(n?.competenceMonth || 'unknown');
            if (!byMonthMap[m]) byMonthMap[m] = [];
            byMonthMap[m].push(n);
          });
          const nextMonths = Object.keys(byMonthMap).sort();
          const nextSummaryByMonth = {};
          const nextByTomador = { all: groupByTomador(nextNotes) };
          nextMonths.forEach((m) => {
            nextSummaryByMonth[m] = sum(byMonthMap[m]);
            nextByTomador[m] = groupByTomador(byMonthMap[m]);
          });
          setResult({
            ...result,
            notes: nextNotes,
            months: nextMonths,
            summaryByMonth: nextSummaryByMonth,
            byTomador: nextByTomador,
            meta: { ...(result?.meta || {}), countNotes: nextNotes.length },
          });
          if (selectedMonth && !nextMonths.includes(selectedMonth)) {
            setSelectedMonth(nextMonths[0] || '');
          }
        }
      }

      setDelConfirm('');
      setDelMatches([]);
      showToast?.(`Excluídas: ${Number(data?.deleted || 0)} ✅`);
    } catch (e) {
      setError(e?.message || 'Falha ao excluir NFS-e.');
      showToast?.(e?.message || 'Falha ao excluir NFS-e.');
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    const rows = filteredNotes.map((n) => ({
      emissao: n.emissionDate || '',
      competencia: n.competenceMonth || '',
      competenciaData: n.competenceDate || '',
      nNFSe: n.nNFSe || '',
      serie: n.serie || '',
      nDPS: n.nDPS || '',
      emitCNPJ: n.emitCNPJ || '',
      emitNome: n.emitName || '',
      tomadorNome: n.tomadorName || '',
      tomadorDoc: n.tomadorDoc || '',
      bruto: n.gross || 0,
      liquido: n.net || 0,
      iss: n.iss || 0,
      pis: n.pis || 0,
      cofins: n.cofins || 0,
      irrf: n.irrf || 0,
      csll: n.csll || 0,
      totalRet: n.totalRet || 0,
      totTribFed: n.totTribFed || 0,
      totTribEst: n.totTribEst || 0,
      totTribMun: n.totTribMun || 0,
    }));

    const headers = [
      { key: 'emissao', label: 'Emissão (YYYY-MM-DD)' },
      { key: 'competencia', label: 'Competência (YYYY-MM)' },
      { key: 'competenciaData', label: 'Competência (data)' },
      { key: 'nNFSe', label: 'Nº NFS-e' },
      { key: 'serie', label: 'Série (DPS)' },
      { key: 'nDPS', label: 'Nº DPS' },
      { key: 'emitCNPJ', label: 'Emitente (CNPJ)' },
      { key: 'emitNome', label: 'Emitente (Nome)' },
      { key: 'tomadorNome', label: 'Tomador (Nome)' },
      { key: 'tomadorDoc', label: 'Tomador (CNPJ/CPF)' },
      { key: 'bruto', label: 'Valor Faturado (Bruto)' },
      { key: 'liquido', label: 'Valor Líquido' },
      { key: 'iss', label: 'ISS' },
      { key: 'pis', label: 'PIS' },
      { key: 'cofins', label: 'COFINS' },
      { key: 'irrf', label: 'IRRF' },
      { key: 'csll', label: 'CSLL' },
      { key: 'totalRet', label: 'Total Retido' },
      { key: 'totTribFed', label: 'Tributos Federais (Total)' },
      { key: 'totTribEst', label: 'Tributos Estaduais (Total)' },
      { key: 'totTribMun', label: 'Tributos Municipais (Total)' },
    ];

    const csv = toCSV(rows, headers);
    const suffix = selectedMonth ? `_${selectedMonth}` : '';
    downloadTextFile(`analise_fat${suffix}.csv`, csv, 'text/csv;charset=utf-8');
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-lg font-extrabold text-slate-900">ANÁLISE FAT (XML de NFS-e)</div>
            <div className="text-sm text-slate-600 mt-1">
              Importação e análise de NFS-e para BI interno: <b>faturado</b>, <b>líquido</b>, <b>tributos separados</b> e{' '}
              <b>Tomador (CNPJ/CPF + Nome)</b>. Ideal para constância operacional e fechamento mensal.
            </div>
          </div>

          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              onClick={() => setView('import')}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                view === 'import' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Importar
            </button>
            <button
              onClick={() => setView('history')}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                view === 'history' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Consultar
            </button>
            <button
              onClick={() => setView('delete')}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                view === 'delete' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Excluir
            </button>
          </div>
        </div>

        <div className="mt-4 text-xs text-slate-500">
          <b>Dica:</b> use <b>Emissão</b> para fechamento mensal. Competência pode vir inconsistente dependendo do emissor.
        </div>
      </div>

      {view === 'import' ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-slate-900">Importar XML</div>
              <div className="text-xs text-slate-600 mt-1">
                Selecione 1 ou mais XMLs. Você pode <b>analisar sem salvar</b> ou <b>importar e salvar</b> no histórico.
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 text-sm font-semibold hover:bg-slate-100 cursor-pointer">
                <Upload size={16} className="text-violet-700" /> Selecionar XML
                <input
                  type="file"
                  accept=".xml,text/xml,application/xml"
                  multiple
                  className="hidden"
                  onChange={onPickFiles}
                />
              </label>

              <button
                onClick={runParse}
                disabled={loading || !files || files.length === 0}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  loading || !files || files.length === 0
                    ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                    : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <FileText size={16} className="text-violet-700" /> {loading ? 'Analisando…' : 'Analisar (sem salvar)'}
              </button>

              <button
                onClick={runImport}
                disabled={loading || !files || files.length === 0}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  loading || !files || files.length === 0
                    ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                    : 'bg-violet-600 text-white hover:bg-violet-700 shadow-lg shadow-violet-200'
                }`}
              >
                <FileText size={16} /> {loading ? 'Importando…' : 'Importar e salvar'}
              </button>
            </div>
          </div>

          <div className="mt-3 text-xs text-slate-500">
            {files?.length ? (
              <span>
                Selecionados: <b>{files.length}</b> arquivo(s)
              </span>
            ) : (
              <span>Nenhum arquivo selecionado.</span>
            )}
          </div>

          {importMeta?.batchId ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <div className="font-extrabold">Lote salvo</div>
              <div className="text-xs mt-1">
                BatchId: <b>{importMeta.batchId}</b> • Importadas: <b>{importMeta.imported}</b> • Duplicadas: <b>{importMeta.duplicated}</b> •
                Únicas no upload: <b>{importMeta.unique}</b>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {view === 'history' ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-slate-900">Consultar histórico</div>
              <div className="text-xs text-slate-600 mt-1">Use pelo menos um filtro (Competência ou Emissão ou Tomador).</div>
            </div>

            <button
              onClick={runQuery}
              disabled={loading}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                loading
                  ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                  : 'bg-violet-600 text-white hover:bg-violet-700 shadow-lg shadow-violet-200'
              }`}
            >
              <FileText size={16} /> {loading ? 'Buscando…' : 'Buscar'}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-bold text-slate-700">Competência</div>
              <input
                value={qCompetenceMonth}
                onChange={(e) => setQCompetenceMonth(e.target.value)}
                placeholder="YYYY-MM"
                className="mt-1 w-full text-sm rounded-xl border border-slate-200 bg-white px-3 py-2"
              />
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-bold text-slate-700">Emissão (de)</div>
              <input
                type="date"
                value={qFrom}
                onChange={(e) => setQFrom(e.target.value)}
                className="mt-1 w-full text-sm rounded-xl border border-slate-200 bg-white px-3 py-2"
              />
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-bold text-slate-700">Emissão (até)</div>
              <input
                type="date"
                value={qTo}
                onChange={(e) => setQTo(e.target.value)}
                className="mt-1 w-full text-sm rounded-xl border border-slate-200 bg-white px-3 py-2"
              />
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-bold text-slate-700">Tomador (CNPJ/CPF)</div>
              <input
                value={qTomadorDoc}
                onChange={(e) => setQTomadorDoc(e.target.value)}
                placeholder="somente números"
                className="mt-1 w-full text-sm rounded-xl border border-slate-200 bg-white px-3 py-2"
              />
            </div>
          </div>
        </div>
      ) : null}

      {view === 'delete' ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-slate-900">Excluir NFS-e (por número)</div>
              <div className="text-xs text-slate-600 mt-1">
                Use <b>Verificar</b> para listar as notas encontradas. Para excluir, digite <b>EXCLUIR</b>.
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={runDeleteDryRun}
                disabled={loading}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  loading
                    ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                    : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <AlertTriangle size={16} className="text-amber-600" /> {loading ? 'Verificando…' : 'Verificar'}
              </button>

              <button
                onClick={runDeleteCommit}
                disabled={loading}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  loading
                    ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                    : 'bg-rose-600 text-white hover:bg-rose-700 shadow-lg shadow-rose-200'
                }`}
              >
                <AlertTriangle size={16} /> {loading ? 'Excluindo…' : 'Excluir'}
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-bold text-slate-700">Número da NFS-e</div>
              <input
                value={delNumber}
                onChange={(e) => setDelNumber(e.target.value)}
                placeholder="ex.: 47632"
                className="mt-1 w-full text-sm rounded-xl border border-slate-200 bg-white px-3 py-2"
              />
              <div className="text-[11px] text-slate-500 mt-1">Pode colar com caracteres; o sistema normaliza.</div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-bold text-slate-700">Competência (opcional)</div>
              <input
                value={delCompetenceMonth}
                onChange={(e) => setDelCompetenceMonth(e.target.value)}
                placeholder="YYYY-MM"
                className="mt-1 w-full text-sm rounded-xl border border-slate-200 bg-white px-3 py-2"
              />
              <div className="text-[11px] text-slate-500 mt-1">Use se houver risco de número repetir em outro mês.</div>
            </div>

            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
              <div className="text-xs font-bold text-rose-800">Confirmação (obrigatória)</div>
              <input
                value={delConfirm}
                onChange={(e) => setDelConfirm(e.target.value)}
                placeholder="Digite EXCLUIR"
                className="mt-1 w-full text-sm rounded-xl border border-rose-200 bg-white px-3 py-2"
              />
              <div className="text-[11px] text-rose-700 mt-1">
                Excluir é irreversível. Sempre clique <b>Verificar</b> antes.
              </div>
            </div>
          </div>

          <div className="mt-5">
            {Array.isArray(delMatches) && delMatches.length ? (
              <div className="space-y-2">
                <div className="text-xs text-slate-600">
                  Encontradas: <b>{delMatches.length}</b>
                </div>

                <div className="overflow-auto">
                  <table className="min-w-[820px] w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-600 border-b border-slate-200">
                        <th className="text-left py-2 pr-3">NFS-e</th>
                        <th className="text-left py-2 pr-3">Competência</th>
                        <th className="text-left py-2 pr-3">Emissão</th>
                        <th className="text-left py-2 pr-3">Tomador</th>
                        <th className="text-left py-2 pr-3">CNPJ/CPF</th>
                        <th className="text-right py-2 pl-3">Bruto</th>
                        <th className="text-right py-2 pl-3">Líquido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {delMatches.map((m, idx) => (
                        <tr key={m.id || idx} className="border-b border-slate-100">
                          <td className="py-2 pr-3 font-semibold text-slate-900">{m.nNFSe || '-'}</td>
                          <td className="py-2 pr-3 text-slate-700">{m.competenceMonth || '-'}</td>
                          <td className="py-2 pr-3 text-slate-700">{m.issueAt || '-'}</td>
                          <td className="py-2 pr-3 text-slate-700">{safeText(m.tomadorName || '-', 60)}</td>
                          <td className="py-2 pr-3 text-slate-700">{m.tomadorDoc || '-'}</td>
                          <td className="py-2 pl-3 text-right text-slate-900">{moneyBRL(m.gross || 0)}</td>
                          <td className="py-2 pl-3 text-right text-slate-900">{moneyBRL(m.net || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-500">Nenhuma nota listada. Informe o número e clique em Verificar.</div>
            )}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex gap-2 items-start">
          <AlertTriangle className="w-4 h-4 mt-0.5" />
          <div className="min-w-0">{safeText(error, 400)}</div>
        </div>
      ) : null}


      {result ? (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="text-sm font-extrabold text-slate-900">Resumo do Período</div>
                <div className="text-xs text-slate-600 mt-1">
                  Total de notas: <b>{result?.meta?.countNotes || 0}</b>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="text-sm rounded-xl border border-slate-200 bg-white px-3 py-2"
                >
                  {(months || []).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>

                <button
                  onClick={exportCSV}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 text-sm font-semibold hover:bg-slate-100"
                >
                  <Download size={16} className="text-violet-700" /> Baixar CSV
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-600">Valor faturado</div>
                <div className="text-lg font-extrabold text-slate-900 mt-1">{moneyBRL(monthSummary?.gross || 0)}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-600">Valor líquido</div>
                <div className="text-lg font-extrabold text-slate-900 mt-1">{moneyBRL(monthSummary?.net || 0)}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-600">ISS</div>
                <div className="text-lg font-extrabold text-slate-900 mt-1">{moneyBRL(monthSummary?.iss || 0)}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-600">Total retido</div>
                <div className="text-lg font-extrabold text-slate-900 mt-1">{moneyBRL(monthSummary?.totalRet || 0)}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs text-slate-600">PIS</div>
                <div className="text-base font-extrabold text-slate-900 mt-1">{moneyBRL(monthSummary?.pis || 0)}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs text-slate-600">COFINS</div>
                <div className="text-base font-extrabold text-slate-900 mt-1">{moneyBRL(monthSummary?.cofins || 0)}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs text-slate-600">IRRF (retido)</div>
                <div className="text-base font-extrabold text-slate-900 mt-1">{moneyBRL(monthSummary?.irrf || 0)}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs text-slate-600">CSLL (retida)</div>
                <div className="text-base font-extrabold text-slate-900 mt-1">{moneyBRL(monthSummary?.csll || 0)}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 overflow-hidden">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm font-extrabold text-slate-900">Notas do mês ({selectedMonth})</div>
                <div className="text-xs text-slate-500">Mostrando: {filteredNotes.length}</div>
              </div>

              <div className="mt-4 overflow-auto">
                <table className="min-w-[980px] w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-600 border-b border-slate-200">
                      <th className="text-left py-2 pr-3">NFS-e</th>
                      <th className="text-left py-2 pr-3">Competência</th>
                      <th className="text-left py-2 pr-3">Tomador</th>
                      <th className="text-left py-2 pr-3">CNPJ/CPF</th>
                      <th className="text-right py-2 pl-3">Bruto</th>
                      <th className="text-right py-2 pl-3">Líquido</th>
                      <th className="text-right py-2 pl-3">ISS</th>
                      <th className="text-right py-2 pl-3">PIS</th>
                      <th className="text-right py-2 pl-3">COFINS</th>
                      <th className="text-right py-2 pl-3">IRRF</th>
                      <th className="text-right py-2 pl-3">CSLL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredNotes.map((n, idx) => (
                      <tr key={n.id || idx} className="border-b border-slate-100">
                        <td className="py-2 pr-3 font-semibold text-slate-900">{n.nNFSe || '-'}</td>
                        <td className="py-2 pr-3 text-slate-700">{n.competenceDate || n.competenceMonth || '-'}</td>
                        <td className="py-2 pr-3 text-slate-700">{safeText(n.tomadorName || '-', 60)}</td>
                        <td className="py-2 pr-3 text-slate-700">{n.tomadorDoc || '-'}</td>
                        <td className="py-2 pl-3 text-right text-slate-900">{moneyBRL(n.gross || 0)}</td>
                        <td className="py-2 pl-3 text-right text-slate-900">{moneyBRL(n.net || 0)}</td>
                        <td className="py-2 pl-3 text-right text-slate-900">{moneyBRL(n.iss || 0)}</td>
                        <td className="py-2 pl-3 text-right text-slate-900">{moneyBRL(n.pis || 0)}</td>
                        <td className="py-2 pl-3 text-right text-slate-900">{moneyBRL(n.cofins || 0)}</td>
                        <td className="py-2 pl-3 text-right text-slate-900">{moneyBRL(n.irrf || 0)}</td>
                        <td className="py-2 pl-3 text-right text-slate-900">{moneyBRL(n.csll || 0)}</td>
                      </tr>
                    ))}
                    {filteredNotes.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="py-6 text-center text-sm text-slate-500">
                          Nenhuma nota encontrada para este mês.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="text-sm font-extrabold text-slate-900">Top Tomadores (controle)</div>
              <div className="text-xs text-slate-600 mt-1">
                Mostra quem recebeu as notas (CNPJ/CPF + Nome) e o total faturado no mês.
              </div>

              <div className="mt-4 space-y-2">
                {byTomador.slice(0, 12).map((t, idx) => (
                  <div key={t.doc || idx} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">{t.doc || '-'}</div>
                    <div className="text-sm font-bold text-slate-900 mt-0.5">{safeText(t.name || '-', 48)}</div>
                    <div className="text-xs text-slate-600 mt-1">
                      Faturado: <b>{moneyBRL(t.gross || 0)}</b> • Líquido: <b>{moneyBRL(t.net || 0)}</b>
                    </div>
                  </div>
                ))}

                {byTomador.length === 0 ? (
                  <div className="text-sm text-slate-500">Sem dados de tomador para este mês.</div>
                ) : null}
              </div>
            </div>
          </div>
        </>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
        <b>Nota:</b> esta aba é para conferência administrativa. Não aparece no painel do paciente.
      </div>
    </div>
  );
}
