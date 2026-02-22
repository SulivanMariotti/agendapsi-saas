import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Users,
  Mail,
  CheckCircle,
  CalendarCheck,
  UserMinus,
  AlertTriangle,
  Upload,
  Send,
  ArrowRight,
  Copy,
  ShieldCheck,
  Database,
} from 'lucide-react';
import { Card, StatCard, Button } from '../DesignSystem';
import { adminFetch } from '../../services/adminApi';

export default function AdminDashboardTab({
  activeUsersCount = 0,
  subscribersCount = 0,
  totalMessagesSent = 0,

  // Constância Terapêutica
  attendancePeriodDays = 30,
  setAttendancePeriodDays = () => {},
  attendanceLoading = false,
  attendanceError = null,
  attendanceStats = { present: 0, absent: 0, total: 0, rate: 0, topAbsent: [] },
  patientNameByPhone = {},

  // Ações rápidas
  onGoToAttendance = () => {},
  onGoToAttendanceImport = () => {},
  onGoToAttendanceFollowups = () => {},

  // Histórico (para saúde do sistema)
  historyLogs = [],

  // Jump para Histórico filtrado por batchId
  onGoToHistoryBatch = () => {},
}) {
  const atRisk = useMemo(() => {
    const rows = Array.isArray(attendanceStats?.topAbsent) ? attendanceStats.topAbsent : [];
    return rows.filter((r) => Number(r?.count || 0) >= 2);
  }, [attendanceStats]);

  const resolvePatientName = (phoneCanonical) => {
    const key = String(phoneCanonical || '').replace(/\D/g, '');
    return patientNameByPhone?.[key] || null;
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(String(text || ''));
    } catch (e) {
      // ignore
    }
  };

  // -------- Saúde do sistema (backup + operações recentes) --------
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState(null);
  const [health, setHealth] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setHealthLoading(true);
      setHealthError(null);
      try {
        const res = await adminFetch('/api/admin/system/health', { method: 'GET' });
        const data = await res.json().catch(() => ({}));
        if (!mounted) return;
        if (!res.ok || !data?.ok) {
          setHealth(null);
          setHealthError(data?.error || 'Falha ao carregar saúde do sistema.');
        } else {
          setHealth(data?.health || null);
        }
      } catch (e) {
        if (!mounted) return;
        setHealth(null);
        setHealthError('Falha ao carregar saúde do sistema.');
      } finally {
        if (mounted) setHealthLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const formatDT = (iso) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(d);
    } catch (_) {
      return iso;
    }
  };

  const formatFromMillis = (ms) => {
    if (!ms) return '—';
    try {
      const d = new Date(Number(ms));
      return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(d);
    } catch (_) {
      return '—';
    }
  };

  const lastAttendanceImport = useMemo(() => {
    const logs = Array.isArray(historyLogs) ? historyLogs : [];
    return logs.find((l) => String(l?.type || '').trim() === 'attendance_import_summary') || null;
  }, [historyLogs]);

  const lastAgendaSync = useMemo(() => {
    const logs = Array.isArray(historyLogs) ? historyLogs : [];
    return logs.find((l) => String(l?.type || '').trim() === 'appointments_sync_summary') || null;
  }, [historyLogs]);

  const getBatchId = (log) => {
    const direct = log && typeof log.batchId === 'string' ? log.batchId : '';
    const meta = log?.meta && typeof log.meta.batchId === 'string' ? log.meta.batchId : '';
    const payload = log?.payload && typeof log.payload.batchId === 'string' ? log.payload.batchId : '';
    return String(direct || meta || payload || '').trim();
  };

  const readNum = (log, keys = []) => {
    for (const k of keys) {
      if (!k) continue;
      const parts = String(k).split('.');
      let cur = log;
      for (const p of parts) {
        cur = cur?.[p];
      }
      const n = Number(cur);
      if (Number.isFinite(n)) return n;
    }
    return 0;
  };

  const lastBatches = useMemo(() => {
    const logs = Array.isArray(historyLogs) ? historyLogs : [];
    const map = new Map();

    for (const l of logs) {
      const bid = getBatchId(l);
      if (!bid) continue;
      const at = Number(l?.__sortAt || 0);
      const type = String(l?.type || l?.action || '').trim();
      const summary = String(l?.summary || '').trim();
      const isSummary = /summary/i.test(type) || summary.toLowerCase().startsWith('resumo');

      const prev = map.get(bid) || { batchId: bid, at: 0, best: null };
      prev.at = Math.max(prev.at || 0, at || 0);

      // Preferir logs de resumo (para números prontos)
      if (isSummary) {
        if (!prev.best || (at || 0) >= Number(prev.best?.__sortAt || 0)) {
          prev.best = l;
        }
      } else if (!prev.best) {
        prev.best = l;
      }

      map.set(bid, prev);
    }

    const rows = Array.from(map.values())
      .sort((a, b) => (b.at || 0) - (a.at || 0))
      .slice(0, 5)
      .map((g) => {
        const l = g.best || {};
        const type = String(l?.type || l?.action || '').trim();
        return {
          batchId: g.batchId,
          at: g.at,
          type,
          sent: readNum(l, ['sentCount', 'sent', 'meta.sentCount', 'meta.sent']),
          fails: readNum(l, ['failCount', 'fails', 'meta.failCount', 'meta.fails']),
          noToken: readNum(l, ['blockedNoToken', 'skippedNoToken', 'meta.blockedNoToken', 'meta.skippedNoToken']),
          inactive: readNum(l, [
            'blockedInactive',
            'skippedInactivePatient',
            'meta.blockedInactive',
            'meta.skippedInactivePatient',
          ]),
          blocked: readNum(l, ['blocked', 'meta.blocked']),
          summary: String(l?.summary || '').trim(),
        };
      });

    return rows;
  }, [historyLogs]);

  const pushFails24h = useMemo(() => {
    const logs = Array.isArray(historyLogs) ? historyLogs : [];
    const now = Date.now();
    const since = now - 24 * 60 * 60 * 1000;
    return logs.filter((l) => {
      const t = Number(l?.__sortAt || 0);
      return t >= since && String(l?.type || '').trim() === 'push_reminder_failed';
    }).length;
  }, [historyLogs]);

  return (
    <>
      {/* Saúde do Sistema */}
      <Card title="Saúde do Sistema" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start gap-3">
              <Database size={18} className="text-slate-600 mt-0.5" />
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-500 uppercase">Último backup</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {healthLoading ? 'Carregando…' : formatDT(health?.lastBackup?.atIso)}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {healthLoading
                    ? '—'
                    : health?.lastBackup
                    ? health?.lastBackup?.ok
                      ? `OK • ${Number(health.lastBackup.documentsTotal || 0)} docs`
                      : `Atenção • ${Number(health.lastBackup.collectionsError || 0)} coleção(ões) com falha`
                    : 'Ainda não registrado. Rode: npm run backup:local'}
                </div>
                {healthError && <div className="mt-1 text-xs text-red-600">{healthError}</div>}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck size={18} className="text-slate-600 mt-0.5" />
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-500 uppercase">Risco + Operações</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  Risco (2+ faltas): {atRisk.length}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Falhas de lembretes (24h): {pushFails24h}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Leitura clínica: risco sugere ruptura/evitação; falhas de envio indicam problema operacional.
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start gap-3">
              <Upload size={18} className="text-slate-600 mt-0.5" />
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-500 uppercase">Importações recentes</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  Presença/Faltas: {lastAttendanceImport ? formatFromMillis(lastAttendanceImport?.__sortAt) : '—'}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Agenda: {lastAgendaSync ? formatFromMillis(lastAgendaSync?.__sortAt) : '—'}
                </div>
                <div className="mt-2">
                  <Button variant="secondary" onClick={onGoToAttendanceImport} icon={ArrowRight} className="w-full">
                    Abrir importação
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Últimos lotes de envio (batchId) */}
      <Card
        title="Últimos lotes (batchId)"
        className="animate-in fade-in slide-in-from-bottom-4 duration-500"
      >
        <div className="text-sm text-slate-500">
          Use lotes para auditar: você abre o Histórico já filtrado e confere enviados, bloqueios (sem token / inativo) e falhas.
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white overflow-hidden">
          {lastBatches.length === 0 ? (
            <div className="p-4 text-sm text-slate-600">Ainda não há lote registrado com batchId no Histórico.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {lastBatches.map((r) => (
                <div key={r.batchId} className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold text-slate-900 truncate">{r.batchId}</div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(r.batchId)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200"
                        title="Copiar batchId"
                      >
                        <Copy size={14} /> Copiar
                      </button>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {formatFromMillis(r.at)}{r.type ? ` • ${r.type}` : ''}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700">Enviados: {r.sent}</span>
                      <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700">Sem token: {r.noToken}</span>
                      <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700">Inativo: {r.inactive}</span>
                      <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700">Falhas: {r.fails}</span>
                    </div>
                  </div>

                  <div className="shrink-0">
                    <Button
                      variant="secondary"
                      onClick={() => onGoToHistoryBatch(r.batchId)}
                      icon={ArrowRight}
                      className="w-full md:w-auto"
                    >
                      Abrir no Histórico
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Constância Terapêutica (centro do dashboard) */}
      <Card title="Constância Terapêutica" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">
              A evolução acontece na continuidade. Este painel te dá visão rápida de presença e faltas no período.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 mr-2">Período:</span>
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setAttendancePeriodDays(d)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  attendancePeriodDays === d
                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-200'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {attendanceError && <div className="mt-4 text-sm text-red-600">{attendanceError}</div>}

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            title={`Presenças (${attendancePeriodDays} dias)`}
            value={attendanceLoading ? '...' : Number(attendanceStats?.present || 0)}
            icon={CalendarCheck}
          />
          <StatCard
            title={`Faltas (${attendancePeriodDays} dias)`}
            value={attendanceLoading ? '...' : Number(attendanceStats?.absent || 0)}
            icon={UserMinus}
          />
          <StatCard
            title="Taxa de Comparecimento"
            value={attendanceLoading ? '...' : `${Number(attendanceStats?.rate || 0)}%`}
            icon={Activity}
          />
        </div>

        {/* Mini alerta: risco de ruptura (>=2 faltas) */}
        {!attendanceLoading && atRisk.length > 0 && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
            <AlertTriangle className="text-amber-600 mt-0.5" size={18} />
            <div className="flex-1">
              <div className="text-sm font-semibold text-slate-800">
                Atenção: {atRisk.length} paciente(s) com 2+ faltas no período
              </div>
              <div className="text-xs text-slate-600 mt-1">
                {atRisk
                  .slice(0, 3)
                  .map((r) => {
                    const nm = resolvePatientName(r.phoneCanonical);
                    return nm ? `${nm} • ${r.phoneCanonical} (${r.count})` : `${r.phoneCanonical} (${r.count})`;
                  })
                  .join(' • ')}
                {atRisk.length > 3 ? ' • ...' : ''}
              </div>
            </div>
            <button
              onClick={onGoToAttendance}
              className="text-xs font-semibold text-violet-700 hover:text-violet-900 flex items-center gap-1"
            >
              Ver <ArrowRight size={14} />
            </button>
          </div>
        )}

        {/* Top faltas */}
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-800">Faltas mais frequentes</h4>
            <span className="text-xs text-slate-500">Top 5</span>
          </div>

          <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left">
                  <th className="px-4 py-2 font-semibold text-slate-600">Paciente</th>
                  <th className="px-4 py-2 font-semibold text-slate-600">Faltas</th>
                </tr>
              </thead>
              <tbody>
                {!attendanceLoading && (!attendanceStats?.topAbsent || attendanceStats.topAbsent.length === 0) ? (
                  <tr>
                    <td className="px-4 py-3 text-slate-500" colSpan={2}>
                      Sem dados de faltas no período.
                    </td>
                  </tr>
                ) : (
                  (attendanceStats?.topAbsent || []).slice(0, 5).map((row) => (
                    <tr key={row.phoneCanonical} className="border-t border-slate-200">
                      <td className="px-4 py-2 text-slate-700">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium text-slate-800 truncate">
                              {resolvePatientName(row.phoneCanonical) || '—'}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">{row.phoneCanonical}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(row.phoneCanonical)}
                            className="shrink-0 p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600"
                            title="Copiar telefone"
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-slate-700">{row.count}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-xs text-slate-500">
              Leitura clínica: faltas repetidas podem sinalizar resistência, sobrecarga ou risco de ruptura do vínculo.
            </p>
            <Button variant="secondary" onClick={onGoToAttendance} icon={ArrowRight} className="sm:w-auto w-full">
              Ver detalhes
            </Button>
          </div>
        </div>
      </Card>

      {/* Ações rápidas + métricas operacionais */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Card title="Ações rápidas" className="lg:col-span-4">
          <div className="space-y-3">
            <Button variant="secondary" onClick={onGoToAttendance} icon={CalendarCheck} className="w-full">
              Presença/Faltas
            </Button>
            <Button variant="secondary" onClick={onGoToAttendanceImport} icon={Upload} className="w-full">
              Importar presença/faltas
            </Button>
            <Button variant="secondary" onClick={onGoToAttendanceFollowups} icon={Send} className="w-full">
              Disparar follow-ups
            </Button>

            <div className="pt-2 text-xs text-slate-500">
              Dica: use o Histórico para auditar envios e o painel de Constância para orientar intervenções.
            </div>
          </div>
        </Card>

        <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard title="Pacientes Ativos (30 dias)" value={activeUsersCount} icon={Activity} />
          <StatCard title="Pacientes Cadastrados" value={subscribersCount} icon={Users} />
          <StatCard title="Mensagens Enviadas" value={totalMessagesSent} icon={Mail} />
        </div>
      </div>

      <Card title="Resumo" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="text-sm text-slate-600 space-y-2">
          <p className="flex items-center gap-2">
            <CheckCircle size={16} className="text-violet-500" />
            Carregue a planilha, clique em <b>Verificar</b> e dispare os lembretes.
          </p>
          <p className="flex items-center gap-2">
            <CheckCircle size={16} className="text-violet-500" />
            Cadastre pacientes na aba <b>Pacientes</b> para autorizá-los no app.
          </p>
          <p className="flex items-center gap-2">
            <CheckCircle size={16} className="text-violet-500" />
            Ajuste modelos de mensagem e contrato em <b>Configurações</b>.
          </p>
        </div>
      </Card>
    </>
  );
}
