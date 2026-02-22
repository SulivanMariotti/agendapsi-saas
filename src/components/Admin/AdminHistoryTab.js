import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck,
  Info,
  Search,
  X,
  AlertTriangle,
  Copy,
  ExternalLink,
  Send,
  Layers,
  Hash,
} from 'lucide-react';
import { Card } from '../DesignSystem';

const TYPE_LABELS = {
  // Agenda
  appointments_sync_summary: 'Sincronização da agenda (resumo)',

  // Lembretes
  appointment_reminder: 'Lembrete de sessão',
  push_reminder_send_summary: 'Disparo de lembretes (resumo)',
  push_reminder_sent: 'Lembrete enviado',
  push_reminder_failed: 'Falha no envio do lembrete',

  // Presença / Faltas
  attendance_import_summary: 'Importação de presença/faltas (resumo)',
  attendance_followups_send_summary: 'Disparos por constância (resumo)',
  attendance_followup_sent: 'Mensagem por constância enviada',

  // Push / Notificações
  push_enabled: 'Notificações ativas',

  // Pacientes / Admin
  patient_register: 'Cadastro de paciente',
  patient_deactivate: 'Desativação de paciente',
  patient_deactivate_not_found: 'Desativação (paciente não encontrado)',
};

const CAMPAIGN_LABELS = {
  slot1: '48h',
  slot2: '24h',
  slot3: 'Hoje',
  multi: 'Misto',
  summary: 'Disparo (resumo)',
  unknown: 'Sem slot',
  other: 'Outros',
};

const CAMPAIGN_ORDER = ['slot1', 'slot2', 'slot3', 'multi', 'summary', 'unknown', 'other'];

function typeToLabel(type) {
  if (!type) return 'Evento';
  if (TYPE_LABELS[type]) return TYPE_LABELS[type];

  // Fallback: humaniza o type caso apareça algo novo ainda não mapeado
  const human = String(type)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Title Case simples
  return human.replace(/\b\w/g, (m) => m.toUpperCase());
}

function uniq(arr) {
  return Array.from(new Set((arr || []).map(String).filter(Boolean)));
}

function canonicalSlotKey(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (!s) return null;
  if (s === 'multi' || s.includes('multi')) return 'multi';
  if (s.includes('slot1') || s.includes('48')) return 'slot1';
  if (s.includes('slot2') || s.includes('24')) return 'slot2';
  if (s.includes('slot3') || s.includes('manh') || s.includes('morning') || s.includes('today') || s.includes('hoje')) return 'slot3';
  return null;
}

function campaignFromReminderTypes(reminderTypes) {
  const keys = uniq(reminderTypes)
    .map(canonicalSlotKey)
    .filter(Boolean);

  const valid = keys.filter((k) => ['slot1', 'slot2', 'slot3'].includes(k));
  const u = uniq(valid);
  if (u.length === 0) return 'unknown';
  if (u.length > 1) return 'multi';
  return u[0];
}

function getCampaignKey(log) {
  const types = Array.isArray(log?.types) ? log.types.map(String) : [];

  // Resumo do disparo
  if (types.includes('push_reminder_send_summary')) return 'summary';

  // Tenta extrair slots normalizados de campos possíveis
  const rawSlots = [];
  if (Array.isArray(log?.reminderTypes)) rawSlots.push(...log.reminderTypes);
  if (log?.reminderType) rawSlots.push(log.reminderType);
  if (log?.slot) rawSlots.push(log.slot);

  // Alguns logs podem carregar info dentro do payload (mantemos defensivo)
  if (log?.payload?.reminderType) rawSlots.push(log.payload.reminderType);
  if (Array.isArray(log?.payload?.reminderTypes)) rawSlots.push(...log.payload.reminderTypes);

  // Lembrete enviado / lembrete de sessão / falha individual
  if (
    types.includes('push_reminder_sent') ||
    types.includes('appointment_reminder') ||
    types.includes('push_reminder_failed')
  ) {
    // Se vier 'multi' ou múltiplos slots, campaignFromReminderTypes lida
    const key = campaignFromReminderTypes(rawSlots);
    return key || 'unknown';
  }

  return 'other';
}


function getBatchId(log) {
  // batchId pode vir em diferentes lugares (defensivo)
  return (
    (log && typeof log.batchId === 'string' && log.batchId) ||
    (log?.meta && typeof log.meta.batchId === 'string' && log.meta.batchId) ||
    (log?.payload && typeof log.payload.batchId === 'string' && log.payload.batchId) ||
    ''
  );
}

function shortBatchId(id) {
  const s = String(id || '').trim();
  if (!s) return '';
  // pega sufixo para caber em UI
  return s.length > 10 ? `…${s.slice(-10)}` : s;
}

function isSendFailure(log) {
  const types = Array.isArray(log?.types) ? log.types.map(String) : [];
  const hasFailedType = types.some((t) => /failed/i.test(String(t)));
  const isReminderFail = types.includes('push_reminder_failed');
  const isSummaryWithFails = types.includes('push_reminder_send_summary') && Number(log?.failCount || 0) > 0;

  // Alguns logs legados podem marcar falha via fields
  const hasFailCount = Number(log?.failCount || 0) > 0;
  const hasErrorField = Boolean(log?.error) || Boolean(log?.payload?.error);
  const summaryMentionsFail = String(log?.summary || '').toLowerCase().includes('falha no envio');

  return isReminderFail || isSummaryWithFails || hasFailedType || hasFailCount || hasErrorField || summaryMentionsFail;
}

export default function AdminHistoryTab({ historyLogs = [], historyJump = null }) {
  const [range, setRange] = useState('30d'); // today | 7d | 30d | all
  const [category, setCategory] = useState('all'); // all | errors | sendFailures | reminders | attendance | appointments | patients | push
  const [q, setQ] = useState('');
  const [visible, setVisible] = useState(200);
  const [groupByCampaign, setGroupByCampaign] = useState(false);
  const [batchFilter, setBatchFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [copied, setCopied] = useState('');

  const tsToParts = (ts) => {
    if (!ts) return { label: '-', date: '-', time: '-' };
    let ms = 0;
    if (typeof ts?.toMillis === 'function') ms = ts.toMillis();
    else if (typeof ts?.seconds === 'number') ms = ts.seconds * 1000;
    else if (ts instanceof Date) ms = ts.getTime();
    else {
      const parsed = Date.parse(String(ts));
      ms = Number.isNaN(parsed) ? 0 : parsed;
    }
    if (!ms) return { label: '-', date: '-', time: '-' };
    const d = new Date(ms);
    const date = d.toLocaleDateString();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return { label: d.toLocaleString(), date, time };
  };

  const logs = useMemo(() => (Array.isArray(historyLogs) ? historyLogs : []), [historyLogs]);

  // Jump externo (Dashboard → Histórico filtrado por batchId)
  useEffect(() => {
    const bid = String(historyJump?.batchId || '').trim();
    if (!bid) return;
    // Garantia: lote aparece mesmo que seja antigo
    setRange('all');
    setBatchFilter(bid);
    setQ('');
    setSelected(null);
    setGroupByCampaign(false);
    setVisible(400);
    // Scroll para o topo para ver o resumo do lote
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (_) {
      // ignore
    }
  }, [historyJump?.ts]);

  const rangeStartMs = useMemo(() => {
    const now = Date.now();
    if (range === 'today') {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    if (range === '7d') return now - 7 * 24 * 60 * 60 * 1000;
    if (range === '30d') return now - 30 * 24 * 60 * 60 * 1000;
    return 0;
  }, [range]);

  const rangeLogs = useMemo(() => {
    // Importante: filtra a lista base (`logs`) pelo período selecionado.
    // (Bugfix) não pode referenciar `rangeLogs` aqui — isso causa ReferenceError.
    return (Array.isArray(logs) ? logs : []).filter((log) => {
      const at = Number(log?.__sortAt || 0);
      if (rangeStartMs && at && at < rangeStartMs) return false;
      return true;
    });
  }, [logs, rangeStartMs]);

  const batchOptions = useMemo(() => {
    const map = new Map();
    for (const log of rangeLogs) {
      const bid = getBatchId(log);
      if (!bid) continue;
      if (map.has(bid)) continue;

      const types = Array.isArray(log?.types) ? log.types : [];
      const primaryType = types.length ? String(types[0]) : String(log?.type || '');

      const { date, time } = tsToParts(log.sentAt || log.createdAt);
      const label = `${date} ${time} • ${typeToLabel(primaryType)} • ${shortBatchId(bid)}`;
      map.set(bid, { id: bid, label, at: Number(log?.__sortAt || 0) });
    }

    return Array.from(map.values())
      .sort((a, b) => (b.at || 0) - (a.at || 0))
      .slice(0, 50);
  }, [rangeLogs]);

  const batchStats = useMemo(() => {
    if (!batchFilter) return null;

    const bid = String(batchFilter);
    const list = rangeLogs.filter((log) => getBatchId(log) === bid);

    let reminderSummary = { sent: 0, fails: 0, noToken: 0, inactive: 0, inactiveSub: 0 };
    let followSummary = { sent: 0, fails: 0, blocked: 0, noToken: 0, inactive: 0 };

    let hasReminderSummary = false;
    let hasFollowSummary = false;

    let indivReminderSent = 0;
    let indivReminderFails = 0;
    let indivFollowSent = 0;
    let indivFollowFails = 0;

    for (const log of list) {
      const types = Array.isArray(log?.types) ? log.types.map(String) : [];

      if (types.includes('push_reminder_send_summary')) {
        hasReminderSummary = true;
        reminderSummary.sent += Number(log?.sentCount || 0);
        reminderSummary.fails += Number(log?.failCount || 0);
        reminderSummary.noToken += Number(log?.blockedNoToken || log?.skippedNoToken || 0);
        reminderSummary.inactive += Number(log?.blockedInactive || log?.skippedInactivePatient || 0);
        reminderSummary.inactiveSub += Number(log?.blockedInactiveSubscriber || log?.skippedInactive || 0);
      }

      if (types.includes('attendance_followups_send_summary')) {
        hasFollowSummary = true;
        followSummary.sent += Number(log?.sentCount || log?.sent || 0);
        followSummary.fails += Number(log?.failCount || log?.errors || 0);
        followSummary.blocked += Number(log?.blockedAlreadySent || log?.blocked || 0);
        followSummary.noToken += Number(log?.skippedNoToken || 0);
        followSummary.inactive += Number(log?.skippedInactivePatient || 0);
      }

      // Fallback individual (quando não existe summary no lote)
      if (types.includes('push_reminder_sent')) indivReminderSent += 1;
      if (types.includes('push_reminder_failed')) indivReminderFails += 1;
      if (types.includes('attendance_followup_sent')) indivFollowSent += 1;
      if (types.some((t) => /attendance_followup_failed|followup_failed/i.test(t))) indivFollowFails += 1;
    }

    const sent = (hasReminderSummary ? reminderSummary.sent : indivReminderSent) + (hasFollowSummary ? followSummary.sent : indivFollowSent);
    const fails = (hasReminderSummary ? reminderSummary.fails : indivReminderFails) + (hasFollowSummary ? followSummary.fails : indivFollowFails);

    const noToken = (hasReminderSummary ? reminderSummary.noToken : 0) + (hasFollowSummary ? followSummary.noToken : 0);
    const inactive = (hasReminderSummary ? reminderSummary.inactive : 0) + (hasFollowSummary ? followSummary.inactive : 0);
    const inactiveSub = hasReminderSummary ? reminderSummary.inactiveSub : 0;
    const blocked = hasFollowSummary ? followSummary.blocked : 0;

    return { total: list.length, sent, fails, noToken, inactive, inactiveSub, blocked };
  }, [batchFilter, rangeLogs]);

  const filtered = useMemo(() => {
    const needle = String(q || '').trim().toLowerCase();

    const batchNeedle = String(batchFilter || '').trim();

    const matchCategory = (log) => {
      const types = Array.isArray(log?.types) ? log.types.map(String) : [];
      const t = types.join(' ').toLowerCase();

      if (category === 'sendFailures') return isSendFailure(log);

      if (category === 'errors') {
        const hasTypeError = types.some((x) => /failed|error/i.test(String(x)));
        const hasErrorField = Boolean(log?.error) || Boolean(log?.payload?.error);
        const hasFailCount = Number(log?.failCount || 0) > 0;
        return hasTypeError || hasErrorField || hasFailCount;
      }

      if (category === 'reminders') return t.includes('reminder');
      if (category === 'attendance') return t.includes('attendance') || t.includes('followup');
      if (category === 'appointments') return t.includes('appointments');
      if (category === 'patients') return t.includes('patient');
      if (category === 'push') return t.includes('push');
      return true;
    };

    return (Array.isArray(rangeLogs) ? rangeLogs : [])
      .filter(matchCategory)
      .filter((log) => {
        if (!batchNeedle) return true;
        return getBatchId(log) === batchNeedle;
      })
      .filter((log) => {
        if (!needle) return true;
        const types = Array.isArray(log?.types) ? log.types.map(String) : [];
        const hay = [
          log?.summary,
          log?.phoneCanonical,
          log?.email,
          log?.patientId,
          getBatchId(log),
          ...(Array.isArray(log?.appointmentIds) ? log.appointmentIds : []),
          ...types,
          ...types.map(typeToLabel),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(needle);
      });
    }, [rangeLogs, q, category, batchFilter]);

  useEffect(() => {
    // Quando muda filtro/busca/período, volta para um “page size” leve.
    setVisible(200);
    }, [q, category, range, batchFilter]);

  const visibleLogs = useMemo(() => filtered.slice(0, visible), [filtered, visible]);

  const filteredCount = filtered.length;
  const totalCount = logs.length;

  const pillClass = (active) =>
    `px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors whitespace-nowrap ${
      active
        ? 'bg-violet-50 text-violet-700 border-violet-100'
        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
    }`;

  const clearAll = () => {
    setRange('30d');
    setCategory('all');
    setQ('');
    setBatchFilter('');
  };

  const safeJson = (obj) => {
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  };

  const copyText = async (label, text) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(String(text));
      setCopied(label);
      window.setTimeout(() => setCopied(''), 1200);
    } catch {
      setCopied('');
    }
  };

  const openDetails = (log) => {
    setSelected(log);
    setCopied('');
  };

  const closeDetails = () => {
    setSelected(null);
    setCopied('');
  };

  const grouped = useMemo(() => {
    if (!groupByCampaign) return null;

    const map = new Map();
    for (const log of visibleLogs) {
      const key = getCampaignKey(log);
      const arr = map.get(key) || [];
      arr.push(log);
      map.set(key, arr);
    }

    const keys = CAMPAIGN_ORDER.filter((k) => map.has(k));
    // Se aparecer algum key inesperado, coloca no fim
    for (const k of map.keys()) {
      if (!keys.includes(k)) keys.push(k);
    }

    return { map, keys };
  }, [visibleLogs, groupByCampaign]);

  const renderCampaignPill = (log) => {
    const key = getCampaignKey(log);
    if (!['slot1', 'slot2', 'slot3', 'multi'].includes(key)) return null;
    const label = CAMPAIGN_LABELS[key] || key;
    return (
      <span className="bg-slate-50 text-slate-700 border border-slate-100 px-2.5 py-1 rounded-full text-[11px] font-semibold">
        {label}
      </span>
    );
  };

  const renderLogCard = (log, idx) => {
    const { label, date, time } = tsToParts(log.sentAt || log.createdAt);

    const isError =
      (Array.isArray(log?.types) && log.types.some((t) => /failed|error/i.test(String(t)))) ||
      Boolean(log?.error) ||
      Boolean(log?.payload?.error) ||
      Number(log?.failCount || 0) > 0;

    const types = Array.isArray(log?.types) ? log.types : [];
    const shownTypes = types.slice(0, 2);
    const hiddenCount = Math.max(0, types.length - shownTypes.length);

    return (
      <div
        key={log.id || log._id || `${log.__sortAt || 'x'}-${idx}`}
        role="button"
        tabIndex={0}
        onClick={() => openDetails(log)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openDetails(log);
          }
        }}
        className={`p-4 border rounded-2xl bg-white shadow-sm hover:shadow-md transition-shadow cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-200 ${
          isError ? 'border-amber-100' : 'border-slate-100'
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-700" title={label}>
              {date} • {time}
            </div>

            <div
              className="text-xs text-slate-500 mt-1"
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {log.summary}
            </div>

            <div className="mt-2 text-[11px] text-slate-400 font-semibold inline-flex items-center gap-1">
              <ExternalLink size={12} /> Ver detalhes
            </div>
          </div>

          <div className="flex gap-2 flex-wrap justify-end max-w-[55%]">
            {isSendFailure(log) ? (
              <span className="bg-amber-50 text-amber-700 border border-amber-100 px-2.5 py-1 rounded-full text-[11px] font-semibold">
                Falha de envio
              </span>
            ) : isError ? (
              <span className="bg-amber-50 text-amber-700 border border-amber-100 px-2.5 py-1 rounded-full text-[11px] font-semibold">
                Erro
              </span>
            ) : null}

            {renderCampaignPill(log)}

            {shownTypes.map((t) => (
              <span
                key={t}
                title={t}
                className="bg-violet-50 text-violet-700 border border-violet-100 px-2.5 py-1 rounded-full text-[11px] font-semibold"
              >
                {typeToLabel(t)}
              </span>
            ))}

            {hiddenCount > 0 ? (
              <span className="bg-slate-50 text-slate-600 border border-slate-100 px-2.5 py-1 rounded-full text-[11px] font-semibold">
                +{hiddenCount}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  const showClear = q || category !== 'all' || range !== '30d' || batchFilter;

  return (
    <Card
      title="Histórico"
      className="h-[calc(100vh-220px)] min-h-[520px] animate-in fade-in slide-in-from-bottom-4 duration-500"
    >
      {/*
        Importante: o Card já é flex-col e tem overflow-hidden.
        Para a barra de rolagem aparecer, precisamos de um filho com min-h-0 e overflow-y-auto.
      */}
      <div className="h-full min-h-0 flex flex-col">
        {/* Barra fixa */}
        <div className="shrink-0 flex flex-col gap-3 pb-4 border-b border-slate-50">
          <div className="flex items-center gap-2 min-w-0">
            <CalendarCheck size={16} className="text-violet-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-slate-800 leading-tight">Histórico de envios</div>
              <div className="text-xs text-slate-500 leading-tight">
                {filteredCount} de {totalCount} registro{totalCount === 1 ? '' : 's'}
              </div>
            </div>

            <div className="ml-auto hidden sm:flex items-center gap-2 text-[11px] text-slate-500">
              <Info size={14} className="text-slate-400" />
              Role para ver o histórico completo
            </div>
          </div>
{batchFilter && batchStats ? (
  <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500">
    <span className="inline-flex items-center gap-1 bg-slate-50 text-slate-700 border border-slate-100 px-2.5 py-1 rounded-full">
      <Hash size={12} className="text-slate-500" /> Lote {shortBatchId(batchFilter)}
    </span>

    <span className="bg-white text-slate-600 border border-slate-200 px-2.5 py-1 rounded-full">
      Enviados: {batchStats.sent}
    </span>

    {batchStats.blocked ? (
      <span className="bg-white text-slate-600 border border-slate-200 px-2.5 py-1 rounded-full">
        Bloqueados: {batchStats.blocked}
      </span>
    ) : null}

    {batchStats.noToken ? (
      <span className="bg-white text-slate-600 border border-slate-200 px-2.5 py-1 rounded-full">
        Sem token: {batchStats.noToken}
      </span>
    ) : null}

    {batchStats.inactive || batchStats.inactiveSub ? (
      <span className="bg-white text-slate-600 border border-slate-200 px-2.5 py-1 rounded-full">
        Inativos: {batchStats.inactive + batchStats.inactiveSub}
      </span>
    ) : null}

    {batchStats.fails ? (
      <span className="bg-amber-50 text-amber-700 border border-amber-100 px-2.5 py-1 rounded-full">
        Erros: {batchStats.fails}
      </span>
    ) : null}

    <button
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
      onClick={() => copyText('BatchId', batchFilter)}
      title="Copiar batchId"
    >
      <Copy size={12} /> {copied === 'BatchId' ? 'Copiado' : 'Copiar lote'}
    </button>
  </div>
) : null}



          {/* Controles */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {/* Range */}
              <span className="text-[11px] font-semibold text-slate-400 mr-1">Período</span>
              <button className={pillClass(range === 'today')} onClick={() => setRange('today')}>
                Hoje
              </button>
              <button className={pillClass(range === '7d')} onClick={() => setRange('7d')}>
                7 dias
              </button>
              <button className={pillClass(range === '30d')} onClick={() => setRange('30d')}>
                30 dias
              </button>
              <button className={pillClass(range === 'all')} onClick={() => setRange('all')}>
                Tudo
              </button>

              <span className="mx-1 text-slate-200">•</span>

              {/* Category */}
              <span className="text-[11px] font-semibold text-slate-400 mr-1">Filtro</span>
              <button className={pillClass(category === 'all')} onClick={() => setCategory('all')}>
                Todos
              </button>
              <button className={pillClass(category === 'sendFailures')} onClick={() => setCategory('sendFailures')}>
                <span className="inline-flex items-center gap-1">
                  <Send size={12} className="text-amber-600" /> Falhas de envio
                </span>
              </button>
              <button className={pillClass(category === 'errors')} onClick={() => setCategory('errors')}>
                <span className="inline-flex items-center gap-1">
                  <AlertTriangle size={12} className="text-amber-500" /> Erros
                </span>
              </button>
              <button className={pillClass(category === 'reminders')} onClick={() => setCategory('reminders')}>
                Lembretes
              </button>
              <button className={pillClass(category === 'attendance')} onClick={() => setCategory('attendance')}>
                Constância
              </button>
              <button className={pillClass(category === 'appointments')} onClick={() => setCategory('appointments')}>
                Agenda
              </button>
              <button className={pillClass(category === 'patients')} onClick={() => setCategory('patients')}>
                Pacientes
              </button>
              <button className={pillClass(category === 'push')} onClick={() => setCategory('push')}>
                Push
              </button>

              <span className="mx-1 text-slate-200">•</span>

              <button className={pillClass(groupByCampaign)} onClick={() => setGroupByCampaign((v) => !v)}>
                <span className="inline-flex items-center gap-1">
                  <Layers size={12} className="text-slate-500" /> Campanhas
                </span>
              </button>

              <div className="inline-flex items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-400 inline-flex items-center gap-1">
                  <Hash size={12} className="text-slate-400" /> Lote
                </span>
                <select
                  value={batchFilter}
                  onChange={(e) => setBatchFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-xl text-[11px] font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  title="Filtrar por lote de envio (batchId)"
                  disabled={!batchOptions.length}
                >
                  <option value="">Todos</option>
                  {batchOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {showClear && (
                <button
                  className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-700"
                  onClick={clearAll}
                  title="Limpar filtros"
                >
                  <X size={14} /> Limpar
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
                <Search size={16} className="text-slate-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar por telefone, e-mail, tipo, appointmentId ou texto…"
                  className="w-full outline-none text-sm text-slate-700 placeholder:text-slate-400"
                />
                {q ? (
                  <button onClick={() => setQ('')} className="text-slate-400 hover:text-slate-600" title="Limpar busca">
                    <X size={16} />
                  </button>
                ) : null}
              </div>

              <div className="hidden md:flex text-[11px] text-slate-400 font-semibold whitespace-nowrap">
                Mostrando {filteredCount}
              </div>
            </div>
          </div>
        </div>

        {/* Lista com rolagem */}
        <div className="min-h-0 flex-1 overflow-y-auto pr-2 pt-4">
          {filtered.length === 0 ? (
            <div className="text-center py-20 text-slate-300">Nenhum envio registado ainda.</div>
          ) : groupByCampaign && grouped ? (
            <div className="space-y-5">
              {grouped.keys.map((key) => {
                const list = grouped.map.get(key) || [];
                const label = CAMPAIGN_LABELS[key] || key;

                const groupFailCount = list.filter(isSendFailure).length;

                return (
                  <div key={key} className="space-y-2">
                    <div className="sticky top-0 z-10 bg-white/85 backdrop-blur border border-slate-100 rounded-2xl px-4 py-2 flex items-center justify-between">
                      <div className="text-xs font-extrabold text-slate-800">Campanha: {label}</div>
                      <div className="text-[11px] font-semibold text-slate-500">
                        {list.length} registro{list.length === 1 ? '' : 's'}
                        {groupFailCount ? (
                          <span className="ml-2 text-amber-700">• {groupFailCount} falha{groupFailCount === 1 ? '' : 's'}</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-2">
                      {list.map((log, idx) => renderLogCard(log, idx))}
                    </div>
                  </div>
                );
              })}

              {filtered.length > visibleLogs.length ? (
                <div className="pt-3 flex items-center justify-center">
                  <button
                    className="px-4 py-2 rounded-xl text-sm font-bold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                    onClick={() => setVisible((v) => Math.min(filtered.length, v + 200))}
                  >
                    Carregar mais ({visibleLogs.length}/{filtered.length})
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2">
              {visibleLogs.map((log, idx) => renderLogCard(log, idx))}

              {filtered.length > visibleLogs.length ? (
                <div className="pt-3 flex items-center justify-center">
                  <button
                    className="px-4 py-2 rounded-xl text-sm font-bold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                    onClick={() => setVisible((v) => Math.min(filtered.length, v + 200))}
                  >
                    Carregar mais ({visibleLogs.length}/{filtered.length})
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Modal de detalhes */}
      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={closeDetails} />

          <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-start gap-3">
              <div className="min-w-0">
                <div className="text-sm font-extrabold text-slate-800">Detalhes do registro</div>
                <div className="text-xs text-slate-500 mt-0.5">{tsToParts(selected.sentAt || selected.createdAt).label}</div>
              </div>

              <div className="ml-auto flex items-center gap-2">
                <button
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold border border-slate-200 hover:bg-slate-50"
                  onClick={() => copyText('Resumo', selected.summary)}
                  title="Copiar resumo"
                >
                  <Copy size={14} /> {copied === 'Resumo' ? 'Copiado' : 'Copiar resumo'}
                </button>
                <button
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold border border-slate-200 hover:bg-slate-50"
                  onClick={() => copyText('JSON', safeJson(selected))}
                  title="Copiar JSON completo"
                >
                  <Copy size={14} /> {copied === 'JSON' ? 'Copiado' : 'Copiar JSON'}
                </button>
                <button
                  className="px-3 py-2 rounded-xl text-[12px] font-extrabold text-slate-600 hover:text-slate-800"
                  onClick={closeDetails}
                  title="Fechar"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="p-5 max-h-[75vh] overflow-y-auto">
              {(() => {
                const types = Array.isArray(selected?.types) ? selected.types : [];
                const isError =
                  types.some((t) => /failed|error/i.test(String(t))) ||
                  Boolean(selected?.error) ||
                  Boolean(selected?.payload?.error) ||
                  Number(selected?.failCount || 0) > 0;

                const campaignKey = getCampaignKey(selected);
                const campaignLabel = CAMPAIGN_LABELS[campaignKey] || campaignKey;

                return (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {isSendFailure(selected) ? (
                        <span className="bg-amber-50 text-amber-700 border border-amber-100 px-2.5 py-1 rounded-full text-[11px] font-semibold">
                          Falha de envio
                        </span>
                      ) : isError ? (
                        <span className="bg-amber-50 text-amber-700 border border-amber-100 px-2.5 py-1 rounded-full text-[11px] font-semibold">
                          Erro
                        </span>
                      ) : (
                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 px-2.5 py-1 rounded-full text-[11px] font-semibold">
                          OK
                        </span>
                      )}

                      {['slot1', 'slot2', 'slot3', 'multi', 'summary'].includes(campaignKey) ? (
                        <span className="bg-slate-50 text-slate-700 border border-slate-100 px-2.5 py-1 rounded-full text-[11px] font-semibold">
                          Campanha: {campaignLabel}
                        </span>
                      ) : null}

                      {types.map((t) => (
                        <span
                          key={t}
                          title={t}
                          className="bg-violet-50 text-violet-700 border border-violet-100 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                        >
                          {typeToLabel(t)}
                        </span>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="p-4 border border-slate-100 rounded-2xl bg-white">
                        <div className="text-[11px] font-bold text-slate-400">Telefone (canônico)</div>
                        <div className="text-sm font-extrabold text-slate-800 mt-1 break-all">
                          {selected.phoneCanonical || '-'}
                        </div>
                      </div>
                      <div className="p-4 border border-slate-100 rounded-2xl bg-white">
                        <div className="text-[11px] font-bold text-slate-400">E-mail</div>
                        <div className="text-sm font-extrabold text-slate-800 mt-1 break-all">{selected.email || '-'}</div>
                      </div>
                      <div className="p-4 border border-slate-100 rounded-2xl bg-white">
                        <div className="text-[11px] font-bold text-slate-400">Patient ID</div>
                        <div className="text-sm font-extrabold text-slate-800 mt-1 break-all">
                          {selected.patientId || '-'}
                        </div>
                      </div>
                    </div>

                    <div className="p-4 border border-slate-100 rounded-2xl bg-white">
                      <div className="text-[11px] font-bold text-slate-400">Resumo</div>
                      <div className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{selected.summary || '-'}</div>
                    </div>

                    {selected?.error || selected?.payload?.error ? (
                      <div className="p-4 border border-amber-100 rounded-2xl bg-amber-50">
                        <div className="text-[11px] font-bold text-amber-700">Erro</div>
                        <pre className="text-xs text-amber-900 mt-2 whitespace-pre-wrap overflow-auto max-h-[240px]">
                          {String(selected.error || selected?.payload?.error)}
                        </pre>
                      </div>
                    ) : null}

                    <div className="p-4 border border-slate-100 rounded-2xl bg-white">
                      <div className="text-[11px] font-bold text-slate-400">JSON completo</div>
                      <pre className="text-xs text-slate-700 mt-2 bg-slate-50 border border-slate-100 rounded-2xl p-3 overflow-auto max-h-[340px] whitespace-pre-wrap">
                        {safeJson(selected)}
                      </pre>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
