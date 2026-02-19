import React from 'react';
import { CalendarCheck, UserMinus, Activity, Copy, AlertTriangle } from 'lucide-react';
import { Card, StatCard } from '../DesignSystem';
import AdminAttendanceImportCard from './AdminAttendanceImportCard';
import AdminAttendanceFollowupsCard from './AdminAttendanceFollowupsCard';

/**
 * Aba Presença/Faltas (Constância Terapêutica)
 * - Não permite cancelamento/reagendamento pelo paciente.
 * - Serve como ferramenta clínica de sustentação do vínculo (constância).
 */
export default function AdminAttendanceTab({
  attendancePeriodDays,
  setAttendancePeriodDays,
  attendanceError,
  attendanceLoading,
  attendanceStats,
  patientNameByPhone = {},
  attendanceImportSource,
  setAttendanceImportSource,
  attendanceImportDefaultStatus,
  setAttendanceImportDefaultStatus,
  attendanceImportMode,
  setAttendanceImportMode,
  attendanceImportColumnMap,
  setAttendanceImportColumnMap,
  attendanceImportText,
  setAttendanceImportText,
  attendanceImportLoading,
  attendanceImportResult,
  attendanceImportDryRunResult,
  attendanceImportValidatedHash,
  attendanceImportCurrentHash,
  handleAttendanceImportValidate,
  handleAttendanceImportCommit,
  handleAttendanceImportClear,
  showToast,
}) {
  const resolvePatientName = (phoneCanonical) => {
    const key = String(phoneCanonical || '').replace(/\D/g, '');
    return patientNameByPhone?.[key] || null;
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(String(text || ''));
      showToast?.('Telefone copiado');
    } catch (e) {
      // ignore
    }
  };

  const safeNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const total = safeNum(attendanceStats?.total);
  const rate = safeNum(attendanceStats?.rate);
  const byDay = Array.isArray(attendanceStats?.byDay) ? attendanceStats.byDay : [];
  const attention = Array.isArray(attendanceStats?.attention) ? attendanceStats.attention : [];

  const formatIsoDateBR = (iso) => {
    if (!iso) return '—';
    try {
      const d = new Date(`${iso}T12:00:00.000Z`);
      return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(d);
    } catch (_) {
      return iso;
    }
  };

  const formatComputedAt = (iso) => {
    if (!iso) return null;
    try {
      const d = new Date(iso);
      return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(d);
    } catch (_) {
      return null;
    }
  };

  const signal = (() => {
    if (total < 5) {
      return {
        tone: 'neutral',
        title: 'Dados insuficientes',
        desc: 'Ainda há pouco volume no período para inferências. Use o import para registrar o histórico.',
      };
    }
    if (rate >= 85) {
      return {
        tone: 'good',
        title: 'Vínculo sustentado',
        desc: 'A presença está consistente. Reforços breves ajudam a manter o compromisso e a continuidade.',
      };
    }
    if (rate >= 70) {
      return {
        tone: 'watch',
        title: 'Em atenção leve',
        desc: 'Há sinais pontuais de oscilação. Vale acolher o contexto e reforçar o “comparecer como parte do cuidado”.',
      };
    }
    return {
      tone: 'risk',
      title: 'Sinal de afastamento',
      desc: 'A taxa sugere quebra de continuidade. Não é moral: é um dado para cuidado ativo e retomada do vínculo.',
    };
  })();

  const pillClass =
    signal.tone === 'good'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
      : signal.tone === 'watch'
      ? 'bg-amber-50 text-amber-700 border-amber-100'
      : signal.tone === 'risk'
      ? 'bg-red-50 text-red-700 border-red-100'
      : 'bg-slate-50 text-slate-700 border-slate-100';

  const lastBars = byDay.slice(Math.max(0, byDay.length - 14));
  const maxTotalDay = Math.max(1, ...lastBars.map((d) => safeNum(d?.total)));

  return (
    <>
      {/* STEP43: Constância Terapêutica (Presença/Faltas) */}
      <Card className="p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Constância Terapêutica</h3>
            <p className="text-sm text-slate-500">
              A cura acontece na continuidade. Este painel ajuda a monitorar presença e faltas para apoiar o vínculo.
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
            value={attendanceLoading ? '...' : attendanceStats.present}
            icon={CalendarCheck}
          />
          <StatCard
            title={`Faltas (${attendancePeriodDays} dias)`}
            value={attendanceLoading ? '...' : attendanceStats.absent}
            icon={UserMinus}
          />
          <StatCard
            title="Taxa de Comparecimento"
            value={attendanceLoading ? '...' : `${attendanceStats.rate}%`}
            icon={Activity}
          />
        </div>

        {/* Insights clínicos (sem moralismo) */}
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Sinal geral</p>
                <h4 className="mt-1 text-base font-semibold text-slate-800">{signal.title}</h4>
              </div>
              <span className={`px-3 py-1 rounded-full text-[11px] font-semibold border ${pillClass}`}>
                {rate}%
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-600">{signal.desc}</p>
            {attendanceStats?.computedAt && (
              <p className="mt-3 text-[11px] text-slate-400">Atualizado: {formatComputedAt(attendanceStats.computedAt)}</p>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Últimos 14 dias (volume)</p>
            <div className="mt-3 flex items-end gap-1 h-16">
              {lastBars.length === 0 ? (
                <div className="text-sm text-slate-500">Sem dados ainda.</div>
              ) : (
                lastBars.map((d) => {
                  const h = Math.round((safeNum(d?.total) / maxTotalDay) * 64);
                  const hasAbs = safeNum(d?.absent) > 0;
                  return (
                    <div
                      key={d.isoDate}
                      title={`${formatIsoDateBR(d.isoDate)} • total: ${safeNum(d.total)} • pres: ${safeNum(d.present)} • falt: ${safeNum(d.absent)}`}
                      className="w-2 rounded-full"
                      style={{ height: `${Math.max(6, h)}px` }}
                    >
                      <div className={`w-2 h-full rounded-full ${hasAbs ? 'bg-red-200' : 'bg-emerald-200'}`} />
                    </div>
                  );
                })
              )}
            </div>
            <p className="mt-3 text-[11px] text-slate-500">
              Verde = dias sem faltas registradas; vermelho = houve pelo menos uma falta no dia.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Cobertura do período</p>
            <div className="mt-2 text-sm text-slate-700">
              <div className="flex items-center justify-between">
                <span>Dias com dados</span>
                <span className="font-semibold">{safeNum(attendanceStats?.daysWithData)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span>Dias sem dados</span>
                <span className="font-semibold">{safeNum(attendanceStats?.daysWithoutData)}</span>
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="text-slate-500 mt-0.5" />
                <p className="text-xs text-slate-600">
                  A constância é mais confiável quando o histórico está completo. Se o relatório vier “seco”,
                  o import aceita apenas <b>ID/DATA/HORA</b> (demais colunas são opcionais).
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-800">Faltas mais frequentes</h4>
            <span className="text-xs text-slate-500">Top 8 por paciente</span>
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
                {!attendanceLoading && attendanceStats.topAbsent.length === 0 ? (
                  <tr>
                    <td className="px-4 py-3 text-slate-500" colSpan={2}>
                      Sem dados de faltas no período.
                    </td>
                  </tr>
                ) : (
                  attendanceStats.topAbsent.map((row) => (
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

          <p className="mt-3 text-xs text-slate-500">
            Importante: este painel não oferece cancelamento/reagendamento. A ausência deve ser tratada com contato ativo com a clínica,
            criando uma barreira saudável contra resistências momentâneas.
          </p>
        </div>

        {/* Atenção clínica (heurística) */}
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-800">Atenção clínica (sinais de afastamento)</h4>
            <span className="text-xs text-slate-500">Top 8 (por sequência/volume)</span>
          </div>

          <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left">
                  <th className="px-4 py-2 font-semibold text-slate-600">Paciente</th>
                  <th className="px-4 py-2 font-semibold text-slate-600">Última</th>
                  <th className="px-4 py-2 font-semibold text-slate-600">Seq. faltas</th>
                  <th className="px-4 py-2 font-semibold text-slate-600">Taxa</th>
                </tr>
              </thead>
              <tbody>
                {!attendanceLoading && attention.length === 0 ? (
                  <tr>
                    <td className="px-4 py-3 text-slate-500" colSpan={4}>
                      Sem sinais relevantes no período (ou ainda sem histórico suficiente).
                    </td>
                  </tr>
                ) : (
                  attention.slice(0, 8).map((row) => (
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
                      <td className="px-4 py-2 text-slate-700">
                        <div className="text-xs">
                          {formatIsoDateBR(row.lastIsoDate)}
                          <div className="text-[11px] text-slate-500">{row.lastStatus === 'absent' ? 'falta' : 'presença'}</div>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-slate-700">{safeNum(row.absentStreak)}</td>
                      <td className="px-4 py-2 text-slate-700">{safeNum(row.rate)}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Leitura clínica: “atenção” não é rótulo. É um convite a sustentar o vínculo — retomar também é parte do processo.
          </p>
        </div>
      </Card>

      {/* STEP44: Importar Presença/Faltas */}
      <div id="attendance-import" className="scroll-mt-24">
      <AdminAttendanceImportCard
        attendanceImportSource={attendanceImportSource}
        setAttendanceImportSource={setAttendanceImportSource}
        attendanceImportDefaultStatus={attendanceImportDefaultStatus}
        setAttendanceImportDefaultStatus={setAttendanceImportDefaultStatus}
        attendanceImportMode={attendanceImportMode}
        setAttendanceImportMode={setAttendanceImportMode}
        attendanceImportColumnMap={attendanceImportColumnMap}
        setAttendanceImportColumnMap={setAttendanceImportColumnMap}
        attendanceImportText={attendanceImportText}
        setAttendanceImportText={setAttendanceImportText}
        attendanceImportLoading={attendanceImportLoading}
        attendanceImportResult={attendanceImportResult}
        attendanceImportDryRunResult={attendanceImportDryRunResult}
        attendanceImportValidatedHash={attendanceImportValidatedHash}
        attendanceImportCurrentHash={attendanceImportCurrentHash}
        handleAttendanceImportValidate={handleAttendanceImportValidate}
        handleAttendanceImportCommit={handleAttendanceImportCommit}
        handleAttendanceImportClear={handleAttendanceImportClear}
      />
      </div>


      {/* STEP45: Disparos por constância */}
      <div id="attendance-followups" className="scroll-mt-24">
        <AdminAttendanceFollowupsCard showToast={showToast} />
      </div>
    </>
  );
}
