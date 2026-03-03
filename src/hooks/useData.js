import { useEffect, useState } from 'react';
import { db } from '../app/firebase';
import {
  collection,
  onSnapshot,
  doc,
  onSnapshot as onDocSnapshot,
} from 'firebase/firestore';

function tsToMillis(ts) {
  if (!ts) return 0;
  // Firestore Timestamp (client)
  if (typeof ts?.toMillis === 'function') return ts.toMillis();
  // Firestore Timestamp-like
  if (typeof ts?.seconds === 'number') return ts.seconds * 1000;
  // JS Date
  if (ts instanceof Date) return ts.getTime();
  // ISO/string date
  const parsed = Date.parse(String(ts));
  if (!Number.isNaN(parsed)) return parsed;
  return 0;
}

function toNumberSafe(v, fallback = 0) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeHistoryLog(raw) {
  const payload = raw?.payload && typeof raw.payload === 'object' ? raw.payload : null;

  const sentAt =
    raw?.sentAt ||
    raw?.createdAt ||
    payload?.sentAt ||
    payload?.createdAt ||
    null;

  const createdAt =
    raw?.createdAt ||
    raw?.sentAt ||
    payload?.createdAt ||
    payload?.sentAt ||
    null;

  const type = String(raw?.type || raw?.action || '').trim();

  const types = Array.isArray(raw?.types)
    ? raw.types.map(String).filter(Boolean)
    : type
    ? [type]
    : [];

  // Mantém summary existente (legado /api/send), senão cria um resumo simples por type
  let summary = raw?.summary ? String(raw.summary) : '';

  if (!summary) {
    switch (type) {
      case 'push_reminder_send_summary': {
        const sentCount = toNumberSafe(raw?.sentCount ?? 0);
        const failCount = toNumberSafe(raw?.failCount ?? 0);
        const blockedNoToken = toNumberSafe(raw?.blockedNoToken ?? raw?.skippedNoToken ?? 0);
        const blockedInactive = toNumberSafe(raw?.blockedInactive ?? raw?.skippedInactivePatient ?? 0);
        const blockedInactiveSubscriber = toNumberSafe(raw?.blockedInactiveSubscriber ?? raw?.skippedInactiveSubscriber ?? raw?.skippedInactive ?? 0);
summary = `Resumo disparo lembretes • enviados: ${sentCount} • falhas: ${failCount} • sem token: ${blockedNoToken} • paciente inativo: ${blockedInactive} • subscriber inativo: ${blockedInactiveSubscriber}`;
        break;
      }
      case 'push_reminder_sent': {
        const ph = raw?.phoneCanonical ? String(raw.phoneCanonical) : '';
        const rt = Array.isArray(raw?.reminderTypes) ? raw.reminderTypes.filter(Boolean).join(', ') : '';
        summary = `Lembrete enviado${ph ? ` • ${ph}` : ''}${rt ? ` • tipos: ${rt}` : ''}`;
        break;
      }
      case 'push_reminder_failed': {
        const ph = raw?.phoneCanonical ? String(raw.phoneCanonical) : '';
        const err = raw?.error ? String(raw.error) : 'erro';
        summary = `Falha no envio${ph ? ` • ${ph}` : ''} • ${err}`;
        break;
      }
      case 'attendance_import_summary': {
        const count = Number(raw?.count || 0);
        const skipped = Number(raw?.skipped || 0);
        const source = raw?.source ? String(raw.source) : '';
        summary = `Importação presença/faltas${source ? ` (${source})` : ''} • importados: ${count} • ignorados: ${skipped}`;
        break;
      }
      case 'appointments_sync_summary': {
        const total = Number(raw?.totalAppointments || 0);
        const uniq = Number(raw?.uniquePatients || 0);
        summary = `Sincronização da agenda • horários: ${total} • pacientes: ${uniq}`;
        break;
      }
      case 'patient_register': {
        const ph = raw?.phoneCanonical ? String(raw.phoneCanonical) : '';
        const email = raw?.email ? String(raw.email) : '';
        summary = `Cadastro de paciente${ph ? ` • ${ph}` : ''}${email ? ` • ${email}` : ''}`;
        break;
      }
      case 'patient_delete': {
        const ph = raw?.phoneCanonical ? String(raw.phoneCanonical) : '';
        summary = `Exclusão/arquivamento de paciente${ph ? ` • ${ph}` : ''}`;
        break;
      }
      case 'repair_roles':
      case 'repair_roles_summary': {
        const scanned = Number(raw?.scanned || 0);
        const updated = Number(raw?.updated || 0);
        const skipped = Number(raw?.skipped || 0);
        summary = `Reparo de roles • escaneados: ${scanned} • atualizados: ${updated} • ignorados: ${skipped}`;
        break;
      }
      default: {
        // fallback seguro
        if (type) summary = `Registro: ${type}`;
        else summary = 'Registro no histórico';
      }
    }
  }

  return {
    ...raw,
    createdAt,
    sentAt,
    types,
    summary,
    __sortAt: tsToMillis(sentAt || createdAt),
  };
}

export function useData(isAdmin) {
  const [subscribers, setSubscribers] = useState([]);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [globalConfig, setGlobalConfig] = useState(null);

  useEffect(() => {
    // ✅ CONFIG deve carregar para Admin e Paciente (rules permitem read em /config)
    // Isso alimenta: contrato terapêutico, whatsapp da clínica, offsets e textos.
    const configRef = doc(db, 'config', 'global');
    const unsubConfig = onDocSnapshot(
      configRef,
      (docSnap) => {
        if (docSnap.exists()) setGlobalConfig(docSnap.data());
        else setGlobalConfig(null);
      },
      (err) => {
        // Evita crash em ambientes onde /config não existe ou rules bloqueiam.
        console.error(err);
        setGlobalConfig(null);
      }
    );

    // ✅ Dados sensíveis: só admin (evita permission-denied no modo paciente)
    if (!isAdmin) {
      setSubscribers([]);
      setHistoryLogs([]);
      setAppointments([]);
      return () => {
        unsubConfig?.();
      };
    }

    // SUBSCRIBERS
    const unsubSubscribers = onSnapshot(collection(db, 'subscribers'), (snap) => {
      setSubscribers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    // HISTORY (ordena por sentAt)
    // ✅ Histórico é legado + novo: alguns docs têm sentAt, outros createdAt.
    // Para não quebrar (e manter ordenação correta), lemos sem orderBy e ordenamos client-side
    // usando sentAt || createdAt (com fallback para payload.*).
    const unsubHistory = onSnapshot(collection(db, 'history'), (snap) => {
      const logs = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .map(normalizeHistoryLog)
        .sort((a, b) => (b.__sortAt || 0) - (a.__sortAt || 0));

      setHistoryLogs(logs);
    });

    // APPOINTMENTS
    const unsubAppointments = onSnapshot(collection(db, 'appointments'), (snap) => {
      setAppointments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubSubscribers?.();
      unsubHistory?.();
      unsubAppointments?.();
      unsubConfig?.();
    };
  }, [isAdmin]);

  return { subscribers, historyLogs, appointments, globalConfig };
}
