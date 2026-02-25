import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { db } from '../../app/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { adminFetch } from '../../services/adminApi';
import {
  LayoutDashboard,
  CalendarCheck,
  Users,
  Settings,
  History,
  ShieldCheck,
  BookOpen,
  FileText,
  LogOut,
} from 'lucide-react';

import AdminDashboardTab from './AdminDashboardTab';
import AdminHistoryTab from './AdminHistoryTab';
import AdminAuditTab from './AdminAuditTab';
import AdminPatientsTab from './AdminPatientsTab';
import AdminAttendanceTab from './AdminAttendanceTab';
import AdminScheduleTab from './AdminScheduleTab';
import AdminConfigTab from './AdminConfigTab';
import AdminManualTab from './AdminManualTab';
import AdminLibraryTab from './AdminLibraryTab';

export default function AdminPanelView({
  onLogout,
  subscribers,
  historyLogs,
  dbAppointments,
  showToast,
  globalConfig,
}) {
  const [adminTab, setAdminTab] = useState('dashboard');

  // Jump para Histórico filtrado por batchId (evita caça manual no histórico)
  const [historyJump, setHistoryJump] = useState(null);
  const openHistoryBatch = (batchId) => {
    const bid = String(batchId || '').trim();
    if (!bid) return;
    setHistoryJump({ batchId: bid, ts: Date.now() });
    setAdminTab('history');
  };

  // Manual de Uso: jump/atalho contextual (Agenda / Presença/Faltas)
  const [manualJump, setManualJump] = useState(null);

  const openManual = (sectionId, queryText = '') => {
    setManualJump({
      id: sectionId || null,
      query: queryText || '',
      ts: Date.now(),
    });
    setAdminTab('manual');
  };

  // STEP43: Painel de Constância (attendance_logs)
  const [attendancePeriodDays, setAttendancePeriodDays] = useState(30);
  const [attendanceRefreshKey, setAttendanceRefreshKey] = useState(0);
  const [attendanceFilters, setAttendanceFilters] = useState({
    professional: '',
    service: '',
    location: '',
    patientId: '',
    phone: '',
  });
  const [attendanceStats, setAttendanceStats] = useState({
    present: 0,
    absent: 0,
    total: 0,
    rate: 0,
    topAbsent: [],
    byDay: [],
    daysWithData: 0,
    daysWithoutData: 0,
    attention: [],
    segments: { stable: 0, watch: 0, risk: 0, insufficient: 0 },
    cohort: null,
    trend: null,
    filtersApplied: null,
    range: null,
    computedAt: null,
  });
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState(null);

  // Preferência do Admin: período do painel de constância (persistido)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('lp_admin_attendancePeriodDays');
      const v = Number(raw);
      if ([7, 30, 90].includes(v)) setAttendancePeriodDays(v);
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('lp_admin_attendancePeriodDays', String(attendancePeriodDays));
    } catch (e) {
      // ignore
    }
  }, [attendancePeriodDays]);

  const normalizePhoneCanonical = (value) => {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length > 11 && digits.startsWith('55')) return digits.slice(2);
    return digits;
  };

  const patientNameByPhone = useMemo(() => {
    const map = {};
    (subscribers || []).forEach((s) => {
      const p = normalizePhoneCanonical(s?.phoneCanonical || s?.phone);
      if (!p) return;
      if (!map[p]) map[p] = String(s?.name || '').trim() || null;
    });
    return map;
  }, [subscribers]);

  // STEP44: Importar Presença/Faltas (CSV) para attendance_logs via API server-side
  const [attendanceImportText, setAttendanceImportText] = useState('');
  const [attendanceImportSource, setAttendanceImportSource] = useState('planilha');
  const [attendanceImportDefaultStatus, setAttendanceImportDefaultStatus] = useState('absent'); // absent|present
  const [attendanceImportResult, setAttendanceImportResult] = useState(null);
  const [attendanceImportLoading, setAttendanceImportLoading] = useState(false);

  const [attendanceImportDryRunResult, setAttendanceImportDryRunResult] = useState(null);
  const [attendanceImportValidatedHash, setAttendanceImportValidatedHash] = useState(null);


  const [attendanceImportMode, setAttendanceImportMode] = useState('auto'); // auto|mapped (relatórios alternativos)
  const [attendanceImportColumnMap, setAttendanceImportColumnMap] = useState({
    id: '',
    name: '',
    date: '',
    time: '',
    datetime: '',
    status: '',
    profissional: '',
    service: '',
    location: '',
  });

  // Configuração Local (usada pelo Schedule e pela aba Configurações)
  const [localConfig, setLocalConfig] = useState({
    reminderOffsetsHours: [48, 24, 12],

    // Templates de lembrete (body)
    msg1: '',
    msg2: '',
    msg3: '',
    msg48h: '',
    msg24h: '',
    msg12h: '',

    // Títulos dos lembretes (push)
    reminderTitlePrefix: '💜 Lembrete Psi — ',
    reminderTitle1: 'Seu espaço em 48h',
    reminderTitle2: 'Amanhã: seu horário',
    reminderTitle3: 'Hoje: sessão no seu horário',
    reminderTitleDefault: 'Seu espaço de cuidado',
    reminderTitleMulti: '💜 Lembrete Psi — Seus lembretes',

    whatsapp: '',
    contractText: '',
    contractVersion: 1,

    // Presença / Falta (push)
    attendanceFollowupPresentTitle: '💜 Lembrete Psi — Parabéns pela presença',
    attendanceFollowupPresentBody:
      'Parabéns por ter comparecido. A continuidade é o que sustenta o processo e fortalece o cuidado consigo.',
    attendanceFollowupAbsentTitle: '💜 Lembrete Psi — Senti sua falta hoje',
    attendanceFollowupAbsentBody:
      'Hoje você faltou. Faltar não é apenas perder uma hora; é interromper um processo de evolução. Se precisar, fale com a clínica para apoiar seu retorno.',
});

  const [isSaving, setIsSaving] = useState(false);

  // Carrega configuração global
  useEffect(() => {
    if (!globalConfig) return;
    setLocalConfig((prev) => ({
      ...prev,
      ...globalConfig,
      // Compatibilidade: se ainda estiver salvo como msg48h/msg24h/msg12h, preenche msg1/msg2/msg3
      msg1: globalConfig?.msg1 ?? globalConfig?.msg48h ?? prev.msg1 ?? '',
      msg2: globalConfig?.msg2 ?? globalConfig?.msg24h ?? prev.msg2 ?? '',
      msg3: globalConfig?.msg3 ?? globalConfig?.msg12h ?? prev.msg3 ?? '',
    }));
  }, [globalConfig]);

  // STEP43-FIX: carregar estatísticas de constância via API (Admin SDK), evitando rules no client
  useEffect(() => {
    const run = async () => {
      if (!['attendance','dashboard'].includes(adminTab)) return;
      try {
        setAttendanceLoading(true);
        setAttendanceError(null);

        // Filtros: aplicados apenas na aba Presença/Faltas (não no dashboard)
        const qs = new URLSearchParams();
        qs.set('days', String(attendancePeriodDays));
        if (adminTab === 'attendance') {
          const f = attendanceFilters || {};
          const canonicalPhone = (raw) => {
            const digits = String(raw || '').replace(/\D+/g, '');
            if (!digits) return '';
            // aceita com/sem +55
            if (digits.length >= 12 && digits.startsWith('55')) return digits.slice(2);
            return digits;
          };
          const add = (k, v) => {
            const s = String(v || '').trim();
            if (!s) return;
            qs.set(k, s);
          };
          add('professional', f.professional);
          add('service', f.service);
          add('location', f.location);
          add('patientId', f.patientId);
          // Normaliza telefone para reduzir ambiguidade e bater com `phoneCanonical`
          const p = canonicalPhone(f.phone);
          if (p) qs.set('phone', p);
        }

        const res = await adminFetch(`/api/admin/attendance/summary?${qs.toString()}`, {
          method: 'GET',
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) throw new Error(data?.error || 'Falha ao carregar constância');
        setAttendanceStats({
          present: Number(data.present || 0),
          absent: Number(data.absent || 0),
          total: Number(data.total || 0),
          rate: Number(data.attendanceRate || 0),
          topAbsent: Array.isArray(data.topMisses)
            ? data.topMisses.map((x) => ({ phoneCanonical: x.phoneCanonical, count: x.misses }))
            : [],
          byDay: Array.isArray(data.byDay) ? data.byDay : [],
          daysWithData: Number(data.daysWithData || 0),
          daysWithoutData: Number(data.daysWithoutData || 0),
          attention: Array.isArray(data.attention) ? data.attention : [],
          segments: data.segments || { stable: 0, watch: 0, risk: 0, insufficient: 0 },
          cohort: data.cohort || null,
          trend: data.trend || null,
          filtersApplied: data.filtersApplied || null,
          range: data.range || null,
          computedAt: data.computedAt || null,
        });
      } catch (e) {
        setAttendanceStats({
          present: 0,
          absent: 0,
          total: 0,
          rate: 0,
          topAbsent: [],
          byDay: [],
          daysWithData: 0,
          daysWithoutData: 0,
          attention: [],
          segments: { stable: 0, watch: 0, risk: 0, insufficient: 0 },
          cohort: null,
          trend: null,
          filtersApplied: null,
          range: null,
          computedAt: null,
        });
        setAttendanceError(e?.message || 'Erro ao carregar constância');
      } finally {
        setAttendanceLoading(false);
      }
    };
    run();
  }, [adminTab, attendancePeriodDays, attendanceRefreshKey, attendanceFilters]);

  const computeCsvHash = (text) => {
    const s = String(text || '').trim();
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) >>> 0;
    }
    return h.toString(16);
  };

  const attendanceImportCurrentHash = useMemo(() => computeCsvHash(attendanceImportText), [attendanceImportText]);

  // Se o CSV mudou após validação, invalida o preview automaticamente
  useEffect(() => {
    if (!attendanceImportValidatedHash) return;
    if (attendanceImportCurrentHash !== attendanceImportValidatedHash) {
      setAttendanceImportDryRunResult(null);
      setAttendanceImportValidatedHash(null);
    }
  }, [attendanceImportCurrentHash, attendanceImportValidatedHash]);




  const handleAttendanceImportValidate = async () => {
    try {
      setAttendanceImportLoading(true);
      setAttendanceImportResult(null);
      setAttendanceImportDryRunResult(null);
      setAttendanceImportValidatedHash(null);

      const res = await adminFetch('/api/admin/attendance/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          csvText: attendanceImportText,
          source: attendanceImportSource,
          defaultStatus: attendanceImportDefaultStatus,
          reportMode: attendanceImportMode,
          columnMap: attendanceImportMode === 'mapped' ? attendanceImportColumnMap : null,
          dryRun: true,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        const msg = data?.error || 'Falha ao validar';
        setAttendanceImportResult({ ok: false, error: msg });
        showToast(msg, 'error');
        return;
      }

      setAttendanceImportDryRunResult({
        ...data,
        csvHash: attendanceImportCurrentHash,
      });
      setAttendanceImportValidatedHash(attendanceImportCurrentHash);

      showToast(`Validação OK: ${data.wouldImport}/${data.candidates} prontos • Ignorados: ${data.skipped}`);
    } catch (e) {
      setAttendanceImportResult({ ok: false, error: e?.message || 'Erro' });
      showToast('Erro ao validar planilha', 'error');
    } finally {
      setAttendanceImportLoading(false);
    }
  };

  const handleAttendanceImportCommit = async () => {
    try {
      if (!attendanceImportDryRunResult || attendanceImportValidatedHash !== attendanceImportCurrentHash) {
        showToast('Antes de importar, clique em "Verificar" para validar a planilha.', 'error');
        return;
      }

      setAttendanceImportLoading(true);
      setAttendanceImportResult(null);

      const res = await adminFetch('/api/admin/attendance/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          csvText: attendanceImportText,
          source: attendanceImportSource,
          defaultStatus: attendanceImportDefaultStatus,
          reportMode: attendanceImportMode,
          columnMap: attendanceImportMode === 'mapped' ? attendanceImportColumnMap : null,
          dryRun: false,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        const msg = data?.error || 'Falha ao importar';
        setAttendanceImportResult({ ok: false, error: msg });
        showToast(msg, 'error');
        return;
      }

      setAttendanceImportResult({
        ok: true,
        imported: data.imported,
        skipped: data.skipped,
        batchId: data.batchId || null,
        errors: data.errors || [],
      });

      showToast(`Importado: ${data.imported} • Ignorados: ${data.skipped}`);
      // Recarrega estatística para refletir imediatamente
      setAttendanceRefreshKey((k) => k + 1);

      // Limpa preview/validação para evitar reimport sem revalidar
      setAttendanceImportDryRunResult(null);
      setAttendanceImportValidatedHash(null);
    } catch (e) {
      setAttendanceImportResult({ ok: false, error: e?.message || 'Erro' });
      showToast('Erro ao importar presença/faltas', 'error');
    } finally {
      setAttendanceImportLoading(false);
    }
  };

  const handleAttendanceImportClear = () => {
    setAttendanceImportText('');
    setAttendanceImportDryRunResult(null);
    setAttendanceImportValidatedHash(null);
    setAttendanceImportResult(null);
    setAttendanceImportMode('auto');
    setAttendanceImportColumnMap({
      id: '',
      name: '',
      date: '',
      time: '',
      datetime: '',
      status: '',
      profissional: '',
      service: '',
      location: '',
    });
  };


  // Salvar configurações globais
  const saveConfig = async (publishNewVersion = false) => {
    setIsSaving(true);
    try {
      const ref = doc(db, 'config', 'global');
      const payload = {
        reminderOffsetsHours: Array.isArray(localConfig.reminderOffsetsHours)
          ? localConfig.reminderOffsetsHours.map((n) => Number(n || 0))
          : [48, 24, 12],
        msg48h: localConfig.msg48h || '',
        msg24h: localConfig.msg24h || '',
        msg12h: localConfig.msg12h || '',
        msg1: localConfig.msg1 || localConfig.msg48h || '',
        msg2: localConfig.msg2 || localConfig.msg24h || '',
        msg3: localConfig.msg3 || localConfig.msg12h || '',

        // Títulos dos lembretes (push)
        reminderTitlePrefix: localConfig.reminderTitlePrefix || '',
        reminderTitle1: localConfig.reminderTitle1 || '',
        reminderTitle2: localConfig.reminderTitle2 || '',
        reminderTitle3: localConfig.reminderTitle3 || '',
        reminderTitleDefault: localConfig.reminderTitleDefault || '',
        reminderTitleMulti: localConfig.reminderTitleMulti || '',

        whatsapp: localConfig.whatsapp || '',
        contractText: localConfig.contractText || '',
        contractVersion: publishNewVersion
          ? Number(localConfig.contractVersion || 1) + 1
          : Number(localConfig.contractVersion || 1),

        // Presença / Falta (push)
        attendanceFollowupPresentTitle: localConfig.attendanceFollowupPresentTitle || '',
        attendanceFollowupPresentBody: localConfig.attendanceFollowupPresentBody || '',
        attendanceFollowupAbsentTitle: localConfig.attendanceFollowupAbsentTitle || '',
        attendanceFollowupAbsentBody: localConfig.attendanceFollowupAbsentBody || '',

        updatedAt: new Date(),
      };

      await setDoc(ref, payload, { merge: true });

      setLocalConfig((prev) => ({
        ...prev,
        contractVersion: payload.contractVersion,
      }));

      showToast(publishNewVersion ? 'Nova versão publicada!' : 'Configurações salvas!');
    } catch (e) {
      console.error(e);
      showToast('Erro ao salvar configurações.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const activeUsersCount = (subscribers || []).filter((u) => {
    if (!u.lastSeen?.seconds) return false;
    const diffDays = (new Date() - new Date(u.lastSeen.seconds * 1000)) / (1000 * 60 * 60 * 24);
    return diffDays <= 30;
  }).length;

  const totalMessagesSent = (historyLogs || []).reduce((acc, curr) => acc + (curr.count || 0), 0);

  // Dashboard -> atalhos para Presença/Faltas (com scroll para seções)
  const goToAttendance = () => setAdminTab('attendance');

  const goToAttendanceImport = () => {
    setAdminTab('attendance');
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        const el = document.getElementById('attendance-import');
        if (el?.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  };

  const goToAttendanceFollowups = () => {
    setAdminTab('attendance');
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        const el = document.getElementById('attendance-followups');
        if (el?.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  };

  return (
    // Admin desktop-first: reduzir sidebar (mais ~10% em cima do ajuste anterior) para dar mais área útil ao conteúdo.
    <div className="grid grid-cols-1 lg:grid-cols-[2.7fr_13.3fr] gap-6">
      {/* Sidebar */}
      <div className="min-w-0">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 sticky top-4">
          <div className="flex items-start justify-between gap-3 mb-6">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-white ring-1 ring-slate-200 flex items-center justify-center shadow-lg shadow-slate-200 shrink-0">
                <Image
                  src="/brand/permitta-mark-256.png"
                  alt="Permittá"
                  width={40}
                  height={40}
                  className="object-contain"
                  priority
                />
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-lg font-extrabold text-slate-900 leading-none truncate">
                    Lembrete Psi
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-semibold">
                    Admin
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">Constância terapêutica</div>
              </div>
            </div>

            <button
              onClick={onLogout}
              className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1 shrink-0 mt-1"
            >
              <LogOut size={14} /> Sair
            </button>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => setAdminTab('dashboard')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                adminTab === 'dashboard'
                  ? 'bg-violet-600 text-white shadow-lg shadow-violet-200'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <LayoutDashboard size={18} /> Dashboard
            </button>

            <button
              onClick={() => setAdminTab('schedule')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                adminTab === 'schedule'
                  ? 'bg-violet-600 text-white shadow-lg shadow-violet-200'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <CalendarCheck size={18} /> Agenda
            </button>

            <button
              onClick={() => setAdminTab('attendance')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                adminTab === 'attendance'
                  ? 'bg-violet-600 text-white shadow-lg shadow-violet-200'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <CalendarCheck size={18} /> Presença/Faltas
            </button>

            <button
              onClick={() => setAdminTab('users')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                adminTab === 'users'
                  ? 'bg-violet-600 text-white shadow-lg shadow-violet-200'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Users size={18} /> Pacientes
            </button>

            <button
              onClick={() => setAdminTab('history')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                adminTab === 'history'
                  ? 'bg-violet-600 text-white shadow-lg shadow-violet-200'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <History size={18} /> Histórico
            </button>

            <button
              onClick={() => setAdminTab('audit')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                adminTab === 'audit'
                  ? 'bg-violet-600 text-white shadow-lg shadow-violet-200'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <ShieldCheck size={18} /> Auditoria
            </button>

            <button
              onClick={() => openManual('visao-geral')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                adminTab === 'manual'
                  ? 'bg-violet-600 text-white shadow-lg shadow-violet-200'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <FileText size={18} /> Manual de Uso
            </button>


            <button
              onClick={() => setAdminTab('library')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                adminTab === 'library'
                  ? 'bg-violet-600 text-white shadow-lg shadow-violet-200'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <BookOpen size={18} /> Biblioteca
            </button>


            <button
              onClick={() => setAdminTab('config')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                adminTab === 'config'
                  ? 'bg-violet-600 text-white shadow-lg shadow-violet-200'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Settings size={18} /> Configurações
            </button>
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="min-w-0 space-y-6">
        {(adminTab === 'schedule' || adminTab === 'attendance') && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-extrabold text-slate-900 tracking-tight">
                  Ajuda rápida (para proteger a constância)
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  Em dia corrido, use o Manual como “memória externa”: passo a passo + diagnóstico sem depender de
                  lembrança.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => openManual(adminTab === 'schedule' ? 'agenda' : 'presenca')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 text-sm font-semibold hover:bg-slate-100"
                >
                  <BookOpen size={16} className="text-violet-700" /> Ver passo a passo no Manual
                </button>
                <button
                  onClick={() => openManual('diagnostico')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 text-sm font-semibold hover:bg-slate-100"
                >
                  <BookOpen size={16} className="text-violet-700" /> Ver diagnóstico no Manual
                </button>
              </div>
            </div>
          </div>
        )}

        {adminTab === 'dashboard' && (
          <AdminDashboardTab
            activeUsersCount={activeUsersCount}
            subscribersCount={(subscribers || []).length}
            totalMessagesSent={totalMessagesSent}
            attendancePeriodDays={attendancePeriodDays}
            setAttendancePeriodDays={setAttendancePeriodDays}
            attendanceLoading={attendanceLoading}
            attendanceError={attendanceError}
            attendanceStats={attendanceStats}
            patientNameByPhone={patientNameByPhone}
            historyLogs={historyLogs}
            onGoToHistoryBatch={openHistoryBatch}
            onGoToAttendance={goToAttendance}
            onGoToAttendanceImport={goToAttendanceImport}
            onGoToAttendanceFollowups={goToAttendanceFollowups}
          />
        )}

        {adminTab === 'schedule' && (
          <AdminScheduleTab
            subscribers={subscribers}
            dbAppointments={dbAppointments}
            globalConfig={globalConfig}
            localConfig={localConfig}
            showToast={showToast}
          />
        )}

        {adminTab === 'attendance' && (
          <AdminAttendanceTab
            attendancePeriodDays={attendancePeriodDays}
            setAttendancePeriodDays={setAttendancePeriodDays}
            attendanceFilters={attendanceFilters}
            setAttendanceFilters={setAttendanceFilters}
            attendanceError={attendanceError}
            attendanceLoading={attendanceLoading}
            attendanceStats={attendanceStats}
            patientNameByPhone={patientNameByPhone}
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
            showToast={showToast}
            onGoToHistoryBatch={openHistoryBatch}
          />
        )}

        {adminTab === 'users' && <AdminPatientsTab subscribers={subscribers} showToast={showToast} globalConfig={globalConfig} />}

        {adminTab === 'history' && <AdminHistoryTab historyLogs={historyLogs} historyJump={historyJump} />}

        {adminTab === 'audit' && <AdminAuditTab showToast={showToast} />}

        {adminTab === 'manual' && <AdminManualTab manualJump={manualJump} />}

        {adminTab === 'library' && <AdminLibraryTab showToast={showToast} />}

        {adminTab === 'config' && (
          <AdminConfigTab
            localConfig={localConfig}
            setLocalConfig={setLocalConfig}
            saveConfig={saveConfig}
            isSaving={isSaving}
          />
        )}
      </div>
    </div>
  );
}
