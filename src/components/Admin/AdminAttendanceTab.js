import React, { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, UserMinus, Activity, Copy, AlertTriangle } from 'lucide-react';
import { Card, StatCard, Button } from '../DesignSystem';
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
  attendanceFilters,
  setAttendanceFilters,
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
  const [draftFilters, setDraftFilters] = useState({
    professional: '',
    service: '',
    location: '',
    patientId: '',
    phone: '',
  });

  const canonicalPhone = (raw) => {
    const digits = String(raw || '').replace(/\D+/g, '');
    if (!digits) return '';
    // aceita com/sem +55
    if (digits.length >= 12 && digits.startsWith('55')) return digits.slice(2);
    return digits;
  };

  useEffect(() => {
    setDraftFilters({
      professional: String(attendanceFilters?.professional || ''),
      service: String(attendanceFilters?.service || ''),
      location: String(attendanceFilters?.location || ''),
      patientId: String(attendanceFilters?.patientId || ''),
      phone: String(attendanceFilters?.phone || ''),
    });
  }, [attendanceFilters]);

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
  const segments = attendanceStats?.segments || { stable: 0, watch: 0, risk: 0, insufficient: 0 };
  const cohort = attendanceStats?.cohort || null;
  const trend = attendanceStats?.trend || null;

  const appliedFilters = useMemo(() => {
    const f = attendanceStats?.filtersApplied || null;
    if (f && Object.values(f).some((v) => String(v || '').trim())) {
      return {
        professional: f.professional || '',
        service: f.service || '',
        location: f.location || '',
        patientId: f.patientId || '',
        phone: f.phoneCanonical || '',
      };
    }
    // fallback (caso o backend ainda não retorne filtersApplied)
    const ff = attendanceFilters || {};
    return {
      professional: String(ff.professional || ''),
      service: String(ff.service || ''),
      location: String(ff.location || ''),
      patientId: String(ff.patientId || ''),
      phone: String(ff.phone || ''),
    };
  }, [attendanceStats?.filtersApplied, attendanceFilters]);

  const hasActiveFilters = useMemo(() => {
    return Object.values(appliedFilters || {}).some((v) => String(v || '').trim());
  }, [appliedFilters]);

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
        desc: hasActiveFilters
          ? 'No recorte atual, ainda há pouco volume no período para inferências. Ajuste filtros ou importe mais histórico.'
          : 'Ainda há pouco volume no período para inferências. Use o import para registrar o histórico.',
      };
    }
    if (rate >= 85) {
      return {
        tone: 'good',
        title: 'Vínculo sustentado',
        desc: hasActiveFilters
          ? 'Neste recorte, a presença está consistente. Reforços breves ajudam a manter o compromisso e a continuidade.'
          : 'A presença está consistente. Reforços breves ajudam a manter o compromisso e a continuidade.',
      };
    }
    if (rate >= 70) {
      return {
        tone: 'watch',
        title: 'Em atenção leve',
        desc: 'Há sinais pontuais de oscilação. Vale acolher o contexto, revisar barreiras práticas e reforçar o “comparecer como parte do cuidado”.',
      };
    }
    return {
      tone: 'risk',
      title: 'Sinal de afastamento',
      desc: 'A taxa sugere quebra de continuidade. Não é moral: é um dado para cuidado ativo, convite ao retorno e sustentação do vínculo.',
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

  const applyFilters = () => {
    const normalizedPhone = canonicalPhone(draftFilters?.phone);
    const next = {
      professional: String(draftFilters?.professional || '').trim(),
      service: String(draftFilters?.service || '').trim(),
      location: String(draftFilters?.location || '').trim(),
      patientId: String(draftFilters?.patientId || '').trim(),
      // telefone: normaliza para bater com `phoneCanonical` do backend
      phone: normalizedPhone,
    };
    // também reflete no input para diminuir confusão (sem +55, só dígitos)
    if (String(draftFilters?.phone || '').trim() && normalizedPhone) {
      setDraftFilters((p) => ({ ...p, phone: normalizedPhone }));
    }
    setAttendanceFilters?.(next);
    showToast?.(normalizedPhone ? 'Filtros aplicados (telefone normalizado)' : 'Filtros aplicados');
  };

  const clearFilters = () => {
    const empty = { professional: '', service: '', location: '', patientId: '', phone: '' };
    setDraftFilters(empty);
    setAttendanceFilters?.(empty);
    showToast?.('Filtros limpos');
  };

  const formatTrend = (t) => {
    if (!t || t.prevRate === null || t.recentRate === null) return null;
    const delta = Number(t.delta || 0);
    const sign = delta > 0 ? '+' : '';
    const label = t.label === 'melhorando' ? 'melhorando' : t.label === 'piorando' ? 'piorando' : 'estável';
    return { label, text: `${t.prevRate}% → ${t.recentRate}% (${sign}${delta}pp)` };
  };

  const attentionSorted = useMemo(() => {
    const arr = Array.isArray(attention) ? [...attention] : [];
    // prioridade clínica (sem moralismo):
    // 1) sequência de faltas (quebra de continuidade)
    // 2) última sessão como falta
    // 3) taxa mais baixa
    // 4) volume de faltas
    // 5) mais recente
    arr.sort((a, b) => {
      const as = safeNum(a?.absentStreak);
      const bs = safeNum(b?.absentStreak);
      if (bs !== as) return bs - as;

      const al = a?.lastStatus === 'absent' ? 1 : 0;
      const bl = b?.lastStatus === 'absent' ? 1 : 0;
      if (bl !== al) return bl - al;

      const ar = safeNum(a?.rate);
      const br = safeNum(b?.rate);
      if (ar !== br) return ar - br;

      const aa = safeNum(a?.absent);
      const ba = safeNum(b?.absent);
      if (ba !== aa) return ba - aa;

      const ad = String(a?.lastIsoDate || '');
      const bd = String(b?.lastIsoDate || '');
      if (bd !== ad) return bd.localeCompare(ad);

      return String(a?.phoneCanonical || '').localeCompare(String(b?.phoneCanonical || ''));
    });
    return arr;
  }, [attention]);

  const priorityLabel = (row) => {
    const streak = safeNum(row?.absentStreak);
    const lastAbsent = row?.lastStatus === 'absent';
    const rate = safeNum(row?.rate);
    if (streak >= 2) return { label: 'alta', cls: 'bg-red-50 text-red-700 border-red-100' };
    if (lastAbsent || rate < 70) return { label: 'média', cls: 'bg-amber-50 text-amber-700 border-amber-100' };
    return { label: 'leve', cls: 'bg-slate-50 text-slate-700 border-slate-100' };
  };

  const trendFmt = formatTrend(trend);

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

        {/* Filtros (apenas Admin) */}
        <div className="mt-4 bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div>
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Filtros (opcional)</p>
              <p className="mt-1 text-sm text-slate-600">
                Use filtros para ler a constância por recortes (profissional, serviço, local ou paciente). Não é julgamento: é um termômetro do vínculo para orientar cuidado ativo.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={clearFilters} className="px-4 py-2">
                Limpar
              </Button>
              <Button onClick={applyFilters} className="px-4 py-2">
                Aplicar
              </Button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="text-xs text-slate-500">Profissional</label>
              <input
                value={draftFilters.professional}
                onChange={(e) => setDraftFilters((p) => ({ ...p, professional: e.target.value }))}
                placeholder="ex: Luana"
                className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-violet-200"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Serviço</label>
              <input
                value={draftFilters.service}
                onChange={(e) => setDraftFilters((p) => ({ ...p, service: e.target.value }))}
                placeholder="ex: Psicoterapia"
                className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-violet-200"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Local / Modalidade</label>
              <input
                value={draftFilters.location}
                onChange={(e) => setDraftFilters((p) => ({ ...p, location: e.target.value }))}
                placeholder="ex: Penha / Online"
                className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-violet-200"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">PatientId</label>
              <input
                value={draftFilters.patientId}
                onChange={(e) => setDraftFilters((p) => ({ ...p, patientId: e.target.value }))}
                placeholder="(opcional)"
                className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-violet-200"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Telefone</label>
              <input
                value={draftFilters.phone}
                onChange={(e) => setDraftFilters((p) => ({ ...p, phone: e.target.value }))}
                placeholder="com/sem +55, DDD + número"
                className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-violet-200"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Dica: pode colar com parênteses/hífen/+55 — ao aplicar, o sistema normaliza para dígitos.
              </p>
            </div>
          </div>

          {hasActiveFilters && (
            <div className="mt-3 flex flex-wrap gap-2">
              {appliedFilters.professional ? (
                <span className="px-3 py-1 rounded-full text-[11px] font-semibold border bg-violet-50 text-violet-700 border-violet-100">
                  Profissional: {appliedFilters.professional}
                </span>
              ) : null}
              {appliedFilters.service ? (
                <span className="px-3 py-1 rounded-full text-[11px] font-semibold border bg-slate-50 text-slate-700 border-slate-100">
                  Serviço: {appliedFilters.service}
                </span>
              ) : null}
              {appliedFilters.location ? (
                <span className="px-3 py-1 rounded-full text-[11px] font-semibold border bg-slate-50 text-slate-700 border-slate-100">
                  Local: {appliedFilters.location}
                </span>
              ) : null}
              {appliedFilters.patientId ? (
                <span className="px-3 py-1 rounded-full text-[11px] font-semibold border bg-slate-50 text-slate-700 border-slate-100">
                  PatientId: {appliedFilters.patientId}
                </span>
              ) : null}
              {appliedFilters.phone ? (
                <span className="px-3 py-1 rounded-full text-[11px] font-semibold border bg-slate-50 text-slate-700 border-slate-100">
                  Telefone: {appliedFilters.phone}
                </span>
              ) : null}
            </div>
          )}
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

            {trendFmt && (
              <p className="mt-3 text-xs text-slate-600">
                Tendência: <span className="font-semibold">{trendFmt.label}</span> • <span className="text-slate-500">{trendFmt.text}</span>
              </p>
            )}

            {trendFmt?.label === 'piorando' ? (
              <p className="mt-2 text-[11px] text-slate-500">
                Sugestão clínica: acolher o contexto, mapear barreiras práticas e reforçar que a presença sustenta o processo.
              </p>
            ) : null}

            {trendFmt?.label === 'melhorando' ? (
              <p className="mt-2 text-[11px] text-slate-500">
                Sugestão clínica: reconhecer o avanço e convidar a manter a regularidade como parte do cuidado.
              </p>
            ) : null}

            {cohort?.patientsTracked !== undefined && (
              <p className="mt-2 text-[11px] text-slate-400">
                Pacientes no recorte: <span className="font-semibold">{Number(cohort.patientsTracked || 0)}</span>
                {hasActiveFilters ? ' (com filtros)' : ''}
              </p>
            )}
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

            <div className="mt-4">
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Segmentos (pacientes)</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="px-3 py-1 rounded-full text-[11px] font-semibold border bg-emerald-50 text-emerald-700 border-emerald-100">
                  Estável: {safeNum(segments.stable)}
                </span>
                <span className="px-3 py-1 rounded-full text-[11px] font-semibold border bg-amber-50 text-amber-700 border-amber-100">
                  Atenção: {safeNum(segments.watch)}
                </span>
                <span className="px-3 py-1 rounded-full text-[11px] font-semibold border bg-red-50 text-red-700 border-red-100">
                  Risco: {safeNum(segments.risk)}
                </span>
                <span className="px-3 py-1 rounded-full text-[11px] font-semibold border bg-slate-50 text-slate-700 border-slate-100">
                  Pouco histórico: {safeNum(segments.insufficient)}
                </span>
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
            <span className="text-xs text-slate-500">Top 8 (prioridade por continuidade)</span>
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
                  attentionSorted.slice(0, 8).map((row) => {
                    const pr = priorityLabel(row);
                    const streak = safeNum(row.absentStreak);
                    const rowTone = streak >= 2 ? 'bg-red-50/40' : row.lastStatus === 'absent' ? 'bg-amber-50/40' : '';
                    return (
                    <tr key={row.phoneCanonical} className={`border-t border-slate-200 ${rowTone}`}>
                      <td className="px-4 py-2 text-slate-700">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium text-slate-800 truncate">
                              {resolvePatientName(row.phoneCanonical) || '—'}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">{row.phoneCanonical}</div>
                            <span className={`inline-flex mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${pr.cls}`}>
                              prioridade {pr.label}
                            </span>
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
                          <div className="text-[11px] text-slate-500">
                            {row.lastStatus === 'absent' ? 'falta' : row.lastStatus === 'present' ? 'presença' : '—'}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-slate-700">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{streak}</span>
                          {streak >= 2 ? <AlertTriangle size={14} className="text-red-500" /> : null}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-slate-700">{safeNum(row.rate)}%</td>
                    </tr>
                  );
                  })
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
