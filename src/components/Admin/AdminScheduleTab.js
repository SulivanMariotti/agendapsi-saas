import React, { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../../app/firebase';
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  startAfter,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import {
  Bell,
  CalendarCheck,
  CloudUpload,
  FileSpreadsheet,
  Filter,
  Loader2,
  PlusCircle,
  Send,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react';

import { Button, Card, Badge } from '../DesignSystem';
import { parseCSV } from '../../services/dataService';
import { adminFetch } from '../../services/adminApi';

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

// phoneCanonical: DDD + número (10/11), SEM 55
function normalizePhoneCanonical(input) {
  let d = onlyDigits(input).replace(/^0+/, '');
  if (!d) return '';
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  return d;
}

// phoneE164: 55 + canônico
function phoneToE164(phoneCanonical) {
  const c = normalizePhoneCanonical(phoneCanonical);
  if (!c) return '';
  if (c.length === 10 || c.length === 11) return `55${c}`;
  return c;
}

// aceita: "2026-02-07" | "07/02/2026" | "07-02-2026"
function normalizeToISODate(dateStr) {
  const s = String(dateStr || '').trim();
  if (!s) return '';

  // YYYY-MM-DD (ou YYYY/MM/DD)
  const isoLike = s.match(/^(\d{4})[/-](\d{2})[/-](\d{2})$/);
  if (isoLike) return `${isoLike[1]}-${isoLike[2]}-${isoLike[3]}`;

  // DD/MM/YYYY (ou DD-MM-YYYY)
  const brLike = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (brLike) return `${brLike[3]}-${brLike[2]}-${brLike[1]}`;

  return '';
}

function formatISOToBR(iso) {
  const s = String(iso || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function safeSlug(str, max = 18) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, max);
}

// ID determinístico para não duplicar agenda a cada sync
function makeAppointmentId({ phone, isoDate, time, profissional }) {
  const p = onlyDigits(phone);
  const d = String(isoDate || '').replace(/[^0-9-]/g, '');
  const t = String(time || '').replace(':', '');
  const prof = safeSlug(profissional, 12);
  return `${p}_${d}_${t}_${prof || 'prof'}`.slice(0, 140);
}

const chunkArray = (arr, size = 10) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const computeUploadWindowEnd = (list) => {
  let lastISO = null;
  (list || []).forEach((a) => {
    const iso = String(a?.isoDate || normalizeToISODate(a?.data || a?.date || '') || '').trim();
    if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      if (!lastISO || iso > lastISO) lastISO = iso;
    }
  });
  if (!lastISO) return null;
  // final do dia (cobre a janela completa do upload)
  return new Date(`${lastISO}T23:59:59`);
};

// RECONCILIAÇÃO (fonte da verdade = upload atual)
// Cancela sessões FUTURAS (dentro da janela do upload) que existiam no Firestore,
// mas que NÃO estão presentes no upload atual.
//
// Importante:
// - NÃO apaga histórico
// - Apenas marca como `status: "cancelled"` com motivo.
// - Só afeta registros sincronizados pelo upload (`source: "admin_sync"`).
const cancelMissingFutureAppointments = async ({ list, currentIdsSet, uploadId, windowEnd }) => {
  try {
    const now = new Date();
    const end = windowEnd || computeUploadWindowEnd(list) || new Date(now.getTime() + 32 * 24 * 60 * 60 * 1000);

    let cancelled = 0;
    let scanned = 0;

    // Paginação para não estourar memória/tempo em agendas grandes
    const PAGE_SIZE = 500;
    let lastDoc = null;

    while (true) {
      const constraints = [
        where('startAt', '>=', now),
        where('startAt', '<=', end),
        orderBy('startAt', 'asc'),
      ];
      if (lastDoc) constraints.push(startAfter(lastDoc));
      constraints.push(limit(PAGE_SIZE));

      const q = query(collection(db, 'appointments'), ...constraints);
      const snap = await getDocs(q);

      if (snap.empty) break;

      scanned += snap.size || 0;

      for (const d of snap.docs) {
        const appt = d.data() || {};
        const status = String(appt.status || '').toLowerCase();
        if (status === 'cancelled' || status === 'done') continue;

        // Só reconcilia o que veio do upload (não mexe em cadastro manual/outros sources)
        if (String(appt.source || '') !== 'admin_sync') continue;

        // Se está no upload atual, mantém
        if (currentIdsSet?.has?.(d.id)) continue;

        // Compat: se o upload usa externalId, permite casar por externalId
        const externalId = String(appt.externalId || '').trim();
        if (externalId && currentIdsSet?.has?.(externalId)) continue;

        await updateDoc(doc(db, 'appointments', d.id), {
          status: 'cancelled',
          cancelledBy: 'sync',
          cancelledReason: 'missing_in_upload',
          cancelledAt: new Date(),
          cancelledUploadId: uploadId,
          updatedAt: new Date(),
        });
        cancelled += 1;
      }

      lastDoc = snap.docs[snap.docs.length - 1];
      if (snap.size < PAGE_SIZE) break;
    }

    return { cancelled, scanned, windowEnd: end.toISOString() };
  } catch (e) {
    console.error('cancelMissingFutureAppointments failed:', e);
    return { cancelled: 0, scanned: 0, error: e?.message || String(e) };
  }
};


export default function AdminScheduleTab({ subscribers, dbAppointments, showToast, globalConfig, localConfig }) {
  const STATUS_BATCH_URL = '/api/admin/push/status-batch';

  const fileInputRef = useRef(null);

  const [csvInput, setCsvInput] = useState('');
  const [appointments, setAppointments] = useState([]);
  const [hasVerified, setHasVerified] = useState(false);
  const [hasSynced, setHasSynced] = useState(false);
  const [lastUploadId, setLastUploadId] = useState(null);

  // Push token status by phoneCanonical (fetched from server)
  const [hasTokenByPhone, setHasTokenByPhone] = useState({});

  const [isSending, setIsSending] = useState(false);
  const [sendPreview, setSendPreview] = useState(null);
  const [sendMode, setSendMode] = useState('preview'); // 'preview' | 'ready' | 'sending'

  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Estado para cadastro manual na agenda
  const [manualEntry, setManualEntry] = useState({
    nome: '',
    telefone: '',
    data: '',
    hora: '',
    profissional: '',
  });
  const [showManualForm, setShowManualForm] = useState(false);
  const [filterProf, setFilterProf] = useState('Todos');

  // Carrega agenda do Firestore (cache do app)
  useEffect(() => {
    if (Array.isArray(dbAppointments) && dbAppointments.length > 0) {
      setAppointments(dbAppointments);
    }
  }, [dbAppointments]);

  // Stepper: se mudar CSV, reseta estado do pipeline
  useEffect(() => {
    setHasVerified(false);
    setHasSynced(false);


    // Fetch push token status from server to avoid false "Sem token"
    (async () => {
      try {
        const phonesUnique = Array.from(
          new Set(
            parsed
              .filter((a) => a.reminderType)
              .map((a) => normalizePhoneCanonical(a.cleanPhone || a.phoneCanonical || a.phone))
              .filter((p) => p && (p.length === 10 || p.length === 11))
          )
        );

        if (!phonesUnique.length) {
          setHasTokenByPhone({});
          return;
        }

        const auth = getAuth();
        const user = auth.currentUser;
        const idToken = user ? await user.getIdToken() : '';

        const res = await fetch(STATUS_BATCH_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
          body: JSON.stringify({ phones: phonesUnique }),
        });

        if (!res.ok) {
          // Se não for admin/autenticado, não vamos travar a UI.
          // Mantém vazio e o badge vai mostrar "Sem token" (mas Preview continua).
          setHasTokenByPhone({});
          return;
        }

        const data = await res.json();
        const byPhone = data?.byPhone || {};
        setHasTokenByPhone(byPhone);
      } catch (e) {
        setHasTokenByPhone({});
      }
    })();

    resetSendState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csvInput]);

  const resetSendState = () => {
    setSendPreview(null);
    setSendMode('preview');
  };

  // Mapa rápido de subscribers por telefone (apenas para enriquecer email, etc.)
  const subscribersByPhone = useMemo(() => {
    const m = new Map();
    (subscribers || []).forEach((s) => {
      const p = normalizePhoneCanonical(s?.phoneCanonical || s?.phone);
      if (p) m.set(p, s);
    });
    return m;
  }, [subscribers]);

  const inactivePhoneSet = useMemo(() => {
    const set = new Set();
    (subscribers || []).forEach((s) => {
      if (String(s?.status || '').toLowerCase() === 'inactive') {
        const p = String(s?.phoneCanonical || s?.phone || '').replace(/\D/g, '');
        if (p) set.add(p.startsWith('55') && (p.length === 12 || p.length === 13) ? p.slice(2) : p);
      }
    });
    return set;
  }, [subscribers]);

  // CSV parseado e enriquecido
  const processedAppointments = useMemo(() => {
    const msgConfig = {
      msg1: localConfig?.msg1 || localConfig?.msg48h || '',
      msg2: localConfig?.msg2 || localConfig?.msg24h || '',
      msg3: localConfig?.msg3 || localConfig?.msg12h || '',
      // Compatibilidade antiga
      msg48h: localConfig?.msg1 || localConfig?.msg48h || '',
      msg24h: localConfig?.msg2 || localConfig?.msg24h || '',
      msg12h: localConfig?.msg3 || localConfig?.msg12h || '',
    };
    return parseCSV(csvInput, subscribers, msgConfig);
  }, [csvInput, subscribers, localConfig]);

  const verificationSummary = useMemo(() => {
    if (!hasVerified) return null;

    const total = processedAppointments.length;

    const phones = new Set();
    let firstISO = null;
    let lastISO = null;

    let fallbackServiceCount = 0;

    processedAppointments.forEach((a) => {
      const p = normalizePhoneCanonical(a?.cleanPhone || a?.phoneCanonical || a?.phone || '');
      if (p) phones.add(p);

      const iso = String(a?.isoDate || '').trim();
      if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        if (!firstISO || iso < firstISO) firstISO = iso;
        if (!lastISO || iso > lastISO) lastISO = iso;
      }

      if (String(a?.serviceType || '').trim() === 'Sessão') fallbackServiceCount += 1;
    });

    return {
      total,
      uniquePatients: phones.size,
      firstISO,
      lastISO,
      dateFrom: firstISO ? formatISOToBR(firstISO) : '—',
      dateTo: lastISO ? formatISOToBR(lastISO) : '—',
      fallbackServiceCount,
    };
  }, [hasVerified, processedAppointments]);

  // Lista de profissionais (para filtro)
  const professionalsList = useMemo(() => {
    const set = new Set(['Todos']);
    processedAppointments.forEach((a) => {
      if (a.profissional) set.add(a.profissional);
    });
    return Array.from(set);
  }, [processedAppointments]);

  // Filtragem por profissional + busca
  const filteredAppointments = useMemo(() => {
    let arr = processedAppointments;

    if (filterProf !== 'Todos') {
      arr = arr.filter((a) => (a.profissional || '').toLowerCase() === filterProf.toLowerCase());
    }

    if (searchTerm?.trim()) {
      const q = searchTerm.trim().toLowerCase();
      arr = arr.filter((a) => {
        const nome = (a.nome || '').toLowerCase();
        const tel = (a.cleanPhone || a.phone || '').toLowerCase();
        return nome.includes(q) || tel.includes(q);
      });
    }

    return arr;
  }, [processedAppointments, filterProf, searchTerm]);

  // 4. Carregar arquivo CSV
  const handleFileUpload = async (event) => {
    resetSendState();
    setHasVerified(false);
    setHasSynced(false);

    try {
      const file = event.target.files?.[0];
      if (!file) return;

      const text = await file.text();
      setCsvInput(text);
      showToast('Planilha carregada.');
    } catch (e) {
      console.error(e);
      showToast('Erro ao carregar planilha.', 'error');
    }
  };

  // 5. Limpar dados
  const handleClearData = () => {
    resetSendState();
    setHasVerified(false);
    setHasSynced(false);
    if (fileInputRef?.current) fileInputRef.current.value = '';

    setCsvInput('');
    setAppointments([]);
    showToast('Dados limpos.');
  };

  // 6. Processar CSV
  const processCsv = async () => {
    const parsed = parseCSV(csvInput, subscribers, {
      msg48h: localConfig?.msg1 || localConfig?.msg48h || '',
      msg24h: localConfig?.msg2 || localConfig?.msg24h || '',
      msg12h: localConfig?.msg3 || localConfig?.msg12h || '',
    });

    setAppointments(parsed);

    setHasVerified(true);
    setHasSynced(false);

    const total = parsed.length;
    const authorized = parsed.filter((a) => a.isSubscribed).length;
    const notAuthorized = total - authorized;
    const pendingSends = parsed.filter((a) => a.isSubscribed && a.reminderType).length;

    showToast(
      `Planilha verificada: ${total} linhas • ${authorized} autorizados • ${notAuthorized} não autorizados • ${pendingSends} disparos pendentes.`
    );
  };

  // 8. Adicionar manual (apenas no estado local)
  const handleAddManual = () => {
    if (!manualEntry.nome || !manualEntry.telefone || !manualEntry.data || !manualEntry.hora) {
      return showToast('Preencha Nome, Telefone, Data e Hora.', 'error');
    }

    const cleanPhone = onlyDigits(manualEntry.telefone);
    const nomeProfissional = manualEntry.profissional?.trim() || 'Psicólogo(a)';

    // Novo formato (com campos vazios de ID/serviço/local), mas continua compatível com o parser antigo
    const newLine = `,${manualEntry.nome},${cleanPhone},${manualEntry.data},${manualEntry.hora},${nomeProfissional},`;

    setCsvInput((prev) => (prev ? `${prev}\n${newLine}` : newLine));
    setManualEntry({ nome: '', telefone: '', data: '', hora: '', profissional: '' });
    setShowManualForm(false);
    showToast('Registro manual adicionado. Clique em Verificar.');
  };

  // PASSO 22/45: conjunto de IDs do upload atual
  const currentIdsSet = useMemo(() => {
    return new Set(
      (processedAppointments || [])
        .map((a) => String(a.externalId || a.docId || a.id || '').trim())
        .filter(Boolean)
    );
  }, [processedAppointments]);

  // 7. Sincronizar agenda no Firestore
  const handleSyncSchedule = async () => {
    if (!hasVerified) {
      showToast('Antes de sincronizar, clique em Verificar para validar a planilha.', 'error');
      return;
    }

    if (!appointments.length) return showToast('Nenhuma agenda para sincronizar.', 'error');

    setIsSaving(true);

    const uploadId = `upload_${new Date().toISOString().replace(/[:.]/g, '-')}`;
    setLastUploadId(uploadId);

    try {
      const todayIso = new Date().toISOString().slice(0, 10);

      // 1) UPSERT do estado atual (tudo que veio no upload)
      const syncedIds = [];
      const phonesInUpload = new Set();

      const BATCH_LIMIT = 450;
      let batch = writeBatch(db);
      let batchCount = 0;

      const flush = async () => {
        if (batchCount === 0) return;
        await batch.commit();
        batch = writeBatch(db);
        batchCount = 0;
      };

      for (const a of appointments) {
        const phoneCanonical = normalizePhoneCanonical(a.cleanPhone || a.phone || '');
        const phoneE164 = phoneToE164(phoneCanonical);
        const phone = phoneCanonical;
        const date = a.data || a.date || '';
        const time = a.hora || a.time || '';
        const profissional = a.profissional || '';
        const isoDate = a.isoDate || normalizeToISODate(date);

        const safeTime = (time || '00:00').trim();
        const startAt = isoDate ? new Date(`${isoDate}T${safeTime}:00`) : null;

        const externalId = (a.externalId || '').trim();
        const serviceType = (a.serviceType || '').trim();
        const location = (a.location || '').trim();

        const sub = subscribersByPhone.get(phone);
        const email = (a.email || sub?.email || '').toLowerCase();

        if (!phone || !isoDate) continue;

        phonesInUpload.add(phone);

        const id = makeAppointmentId({ phone, isoDate, time, profissional });
        syncedIds.push(id);

        const ref = doc(db, 'appointments', id);

        const payload = {
          nome: a.nome || '',
          email: email || '',
          phone,
          phoneCanonical,
          phoneE164,
          date: date || '',
          isoDate,
          time: time || '',
          startAt: startAt || null,
          profissional: profissional || '',
          externalId: externalId || '',
          serviceType: serviceType || '',
          location: location || '',
          status: 'scheduled',
          source: 'admin_sync',
          sourceUploadId: uploadId,
          updatedAt: new Date(),
        };

        batch.set(ref, payload, { merge: true });

        batchCount += 1;
        if (batchCount >= BATCH_LIMIT) await flush();
      }

      await flush();

            // 2) RECONCILIAÇÃO (fonte da verdade = upload atual)
      // Cancela sessões FUTURAS que existiam no Firestore para os pacientes do upload,
      // mas que NÃO estão mais presentes no upload atual.
      // Importante: não apaga histórico; apenas marca como `status: "cancelled"` com motivo.
      const syncedIdSet = new Set(syncedIds);
      const windowEnd =
        verificationSummary?.lastISO && /^\d{4}-\d{2}-\d{2}$/.test(String(verificationSummary.lastISO))
          ? new Date(`${verificationSummary.lastISO}T23:59:59`)
          : computeUploadWindowEnd(appointments);

      const recon = await cancelMissingFutureAppointments({
        list: appointments,
        currentIdsSet: syncedIdSet,
        uploadId,
        windowEnd,
      });
      if (recon?.cancelled) {
        showToast(`Reconciliação: ${recon.cancelled} sessões futuras canceladas (removidas do upload). Verificadas: ${recon.scanned}.`, 'info');
      }

      showToast(
        `Agenda sincronizada! (${syncedIds.length} registros) • Reconciliação aplicada (sessões futuras removidas do upload foram canceladas).`
      );

      // Log resumo do upload no history (server-side)
      try {
        if (verificationSummary?.total) {
          await adminFetch('/api/admin/appointments/sync-summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              uploadId,
              totalAppointments: verificationSummary.total,
              uniquePatients: verificationSummary.uniquePatients,
              dateRange: {
                firstISO: verificationSummary.firstISO || null,
                lastISO: verificationSummary.lastISO || null,
              },
              fallbackServiceCount: verificationSummary.fallbackServiceCount || 0,
            }),
          }).catch(() => null);
        }
      } catch (_) {}

      setHasSynced(true);
    } catch (e) {
      console.error(e);
      showToast('Erro ao sincronizar agenda.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Preview do disparo (não envia)
  const generateSendPreview = async () => {
    if (!hasVerified) {
      showToast('Antes de disparar, clique em Verificar.', 'error');
      return;
    }
    if (!hasSynced) {
      showToast('Antes de disparar, clique em Sincronizar.', 'error');
      return;
    }

    const toCanonical = (v) => {
      let d = onlyDigits(v).replace(/^0+/, '');
      if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
      return d;
    };

    const candidates = (filteredAppointments || []).filter((a) => a.reminderType);

    const phonesUnique = Array.from(
      new Set(
        candidates
          .map((a) => toCanonical(a.cleanPhone || a.phoneCanonical || a.phone))
          .filter((p) => p && (p.length === 10 || p.length === 11))
      )
    );

    let hasTokenByPhone = {};
    try {
      const res = await adminFetch(STATUS_BATCH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phones: phonesUnique }),
      });

      if (res.ok) {
        const data = await res.json();
        const results = data?.results || {};
        hasTokenByPhone = Object.fromEntries(
          Object.entries(results).map(([phone, info]) => [phone, Boolean(info?.hasToken)])
        );
      } else {
        hasTokenByPhone = {};
      }
    } catch (e) {
      hasTokenByPhone = {};
    }

    const getHasToken = (a) => {
      const p = toCanonical(a.cleanPhone || a.phoneCanonical || a.phone);
      if (p && Object.prototype.hasOwnProperty.call(hasTokenByPhone, p)) return !!hasTokenByPhone[p];
      return Boolean(a.isSubscribed);
    };

    const blockedNoToken = candidates.filter((a) => !getHasToken(a));
    const blockedInactive = candidates.filter((a) => {
      const p = toCanonical(a.cleanPhone || a.phoneCanonical || a.phone);
      return getHasToken(a) && inactivePhoneSet.has(p);
    });
    const willSend = candidates.filter((a) => {
      const p = toCanonical(a.cleanPhone || a.phoneCanonical || a.phone);
      return getHasToken(a) && !inactivePhoneSet.has(p);
    });

    const byPatient = new Map();
    willSend.forEach((a) => {
      const phone = toCanonical(a.cleanPhone || a.phoneCanonical || a.phone);
      const key = phone || 'sem_telefone';
      const prev = byPatient.get(key) || {
        phoneCanonical: phone,
        name: a.name || a.patientName || '-',
        count: 0,
      };
      prev.count += 1;
      byPatient.set(key, prev);
    });

    const patients = Array.from(byPatient.values())
      .sort((x, y) => y.count - x.count)
      .slice(0, 25);

    const blockedPatientsMap = new Map();
    candidates.forEach((a) => {
      const phone = toCanonical(a.cleanPhone || a.phoneCanonical || a.phone);
      const name = a.name || a.patientName || '-';
      const key = phone || 'sem_telefone';

      let reason = null;
      if (!phone) reason = 'Sem telefone';
      else if (inactivePhoneSet.has(phone)) reason = 'Inativo';
      else if (!getHasToken(a)) reason = 'Sem Push';

      if (!reason) return;

      const prev = blockedPatientsMap.get(key) || {
        phoneCanonical: phone || '',
        name,
        reason,
        count: 0,
      };

      const priority = { Inativo: 3, 'Sem Push': 2, 'Sem telefone': 1 };
      if (priority[reason] > (priority[prev.reason] || 0)) prev.reason = reason;

      prev.count += 1;
      blockedPatientsMap.set(key, prev);
    });

    const blockedPatients = Array.from(blockedPatientsMap.values())
      .sort((x, y) => y.count - x.count)
      .slice(0, 25);

    const blockedMissingPhone = candidates.filter((a) => {
      const p = toCanonical(a.cleanPhone || a.phoneCanonical || a.phone);
      return !p;
    }).length;

    const preview = {
      uploadId: lastUploadId || globalConfig?.appointmentsLastUploadId || null,
      generatedAtISO: new Date().toISOString(),
      totals: {
        candidates: candidates.length,
        willSend: willSend.length,
        blockedNoToken: blockedNoToken.length,
        blockedInactive: blockedInactive.length,
        blockedMissingPhone,
      },
      patients,
      blockedPatients,
      willSendItems: willSend.map((a) => {
        const phone = toCanonical(a.cleanPhone || a.phoneCanonical || a.phone || a.tel || '');
        const isoDate = String(a?.isoDate || normalizeToISODate(a?.data || a?.date || '') || '').trim();
        const time = String(a?.hora || a?.time || '').trim();
        const profissional = String(a?.profissional || a?.professional || a?.professionalName || '').trim();

        const startISO = isoDate && time ? `${isoDate}T${time}:00` : (a.startISO || a.start || a.dateISO || a.date || null);

        // ID determinístico (mesmo padrão usado no sync) — essencial para dedupe por sessão
        const appointmentId = (a.appointmentId && String(a.appointmentId).trim())
          ? String(a.appointmentId).trim()
          : (phone && isoDate && time ? makeAppointmentId({ phone, isoDate, time, profissional }) : null);

        return {
          appointmentId,
          phoneCanonical: phone,
          patientName: a.nome || a.name || a.patientName || '',
          professionalName: profissional,
          startISO,
          dateBR: a.data || a.date || '',
          time,
          reminderType: a.reminderType || null,
          serviceType: a.serviceType || 'Sessão',
          location: a.location || 'Clínica',
          // se vier do parseCSV, já vem com {nome}/{data}/{hora}/{profissional} preenchidos
          messageBody: a.messageBody || '',
        };
      }),
    };

    setSendPreview(preview);
    showToast('Preview gerado. Nenhuma mensagem foi enviada.', 'info');
  };

  const handleDispatchReminders = async () => {
    if (!sendPreview || !sendPreview?.willSendItems?.length) {
      showToast('Gere o preview antes de disparar.', 'error');
      return;
    }
    setIsSending(true);
    setSendMode('sending');
    try {
      const res = await adminFetch('/api/admin/reminders/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uploadId: sendPreview?.uploadId || lastUploadId || globalConfig?.appointmentsLastUploadId || null,
          reminders: sendPreview.willSendItems,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        const msg = data?.error || 'Erro ao disparar lembretes.';
        showToast(msg, 'error');
        setSendMode('ready');
        return;
      }

      showToast(
        `Disparo concluído: ${data?.sentCount || 0} enviados, ${data?.failCount || 0} falharam, ${
          data?.skippedNoToken || 0
        } sem push, ${data?.skippedAlreadySent || 0} já enviados.`,
        'success'
      );

      setSendPreview(null);
      setSendMode('preview');
    } catch (e) {
      console.error(e);
      showToast('Erro ao disparar lembretes.', 'error');
      setSendMode('ready');
    } finally {
      setIsSending(false);
    }
  };

  const handleSendReminders = async () => {
    if (sendMode === 'ready') {
      await handleDispatchReminders();
      return;
    }
    setIsSending(true);
    try {
      await generateSendPreview();
      setSendMode('ready');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card title="1. Importar Agenda" className="h-[600px] animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-col h-full gap-4">
          {showManualForm ? (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <PlusCircle size={16} className="text-violet-500" />
                  Adicionar manual
                </div>
                <button onClick={() => setShowManualForm(false)} className="text-slate-400 hover:text-slate-700">
                  <X size={18} />
                </button>
              </div>

              <div className="mt-4 space-y-2">
                <input
                  placeholder="Nome"
                  className="w-full p-2.5 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-violet-200"
                  value={manualEntry.nome}
                  onChange={(e) => setManualEntry({ ...manualEntry, nome: e.target.value })}
                />
                <input
                  placeholder="Telefone (DDD + Número)"
                  className="w-full p-2.5 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-violet-200"
                  value={manualEntry.telefone}
                  onChange={(e) => setManualEntry({ ...manualEntry, telefone: e.target.value })}
                />
                <div className="flex gap-2">
                  <input
                    type="date"
                    className="w-1/2 p-2.5 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-violet-200"
                    value={manualEntry.data}
                    onChange={(e) => setManualEntry({ ...manualEntry, data: e.target.value })}
                  />
                  <input
                    type="time"
                    className="w-1/2 p-2.5 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-violet-200"
                    value={manualEntry.hora}
                    onChange={(e) => setManualEntry({ ...manualEntry, hora: e.target.value })}
                  />
                </div>
                <input
                  placeholder="Profissional (opcional)"
                  className="w-full p-2.5 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-violet-200"
                  value={manualEntry.profissional}
                  onChange={(e) => setManualEntry({ ...manualEntry, profissional: e.target.value })}
                />
              </div>

              <div className="flex gap-2 mt-4">
                <Button onClick={handleAddManual} variant="success" className="flex-1 text-xs">
                  Adicionar
                </Button>
                <Button onClick={() => setShowManualForm(false)} variant="secondary" className="flex-1 text-xs">
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <Button onClick={() => setShowManualForm(true)} variant="secondary" icon={PlusCircle} className="flex-1">
                Manual
              </Button>
              <Button
                onClick={handleSyncSchedule}
                variant="primary"
                icon={CloudUpload}
                className="flex-1"
                disabled={isSaving || appointments.length === 0}
              >
                {isSaving ? 'Sincronizando...' : 'Sincronizar'}
              </Button>
            </div>
          )}

          <textarea
            value={csvInput}
            onChange={(e) => setCsvInput(e.target.value)}
            placeholder={
              'Cole aqui a planilha CSV:\nID, Nome, Telefone, Data, Hora, Profissional, Serviço, Local\n(ou no formato antigo: Nome, Telefone, Data, Hora, Profissional)'
            }
            className="w-full h-full p-4 border border-slate-100 bg-slate-50 rounded-xl text-slate-800 resize-none text-xs font-mono focus:bg-white focus:border-violet-200 focus:ring-2 focus:ring-violet-100 outline-none transition-all"
          />

          <div className="flex gap-3">
            <label className="flex-1 cursor-pointer">
              <div className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-800 shadow-sm transition-all text-sm h-full">
                <Upload size={18} /> Carregar Planilha
              </div>
              <input type="file" onChange={handleFileUpload} className="hidden" ref={fileInputRef} />
            </label>
            <Button onClick={handleClearData} variant="danger" icon={Trash2} />
            <Button onClick={() => processCsv()} className="flex-1" icon={Send}>
              Verificar
            </Button>
          </div>

          {verificationSummary ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span>
                  <b>Total:</b> {verificationSummary.total}
                </span>
                <span>
                  <b>Pacientes únicos:</b> {verificationSummary.uniquePatients}
                </span>
                <span>
                  <b>Período:</b> {verificationSummary.dateFrom} → {verificationSummary.dateTo}
                </span>
                <span>
                  <b>Fallback “Sessão”:</b> {verificationSummary.fallbackServiceCount}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      <Card title="2. Envios Pendentes" className="h-[600px] animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="mb-4">
          {filteredAppointments.filter((a) => a.isSubscribed && a.reminderType).length > 0 ? (
            <Button
              onClick={handleSendReminders}
              variant="success"
              disabled={isSending}
              className="w-full shadow-none ring-0 focus:ring-0 focus:ring-offset-0"
              icon={isSending ? Loader2 : Bell}
            >
              {isSending ? 'Processando...' : sendMode === 'ready' ? 'Disparar Lembretes' : 'Gerar Preview do Disparo'}
            </Button>
          ) : (
            <p className="text-center text-xs text-slate-400">Nenhum disparo disponível para a seleção.</p>
          )}
        </div>

        {sendPreview && (
          <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-bold text-slate-600">Preview do Disparo (não envia)</div>
              <div className="text-[11px] text-slate-400">
                Gerado em {new Date(sendPreview.generatedAtISO).toLocaleString('pt-BR')}
              </div>

              <div className="mt-1 text-[11px] text-slate-500">
                Offsets atuais:{' '}
                {(
                  (Array.isArray(localConfig?.reminderOffsetsHours)
                    ? localConfig.reminderOffsetsHours
                    : Array.isArray(globalConfig?.reminderOffsetsHours)
                    ? globalConfig.reminderOffsetsHours
                    : [48, 24, 12]
                  )
                    .slice()
                    .sort((a, b) => Number(b) - Number(a))
                    .join('h / ')
                )}
                h
              </div>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-white p-2 border border-slate-100">
                <div className="text-slate-400">Candidatos</div>
                <div className="text-slate-800 font-bold">{sendPreview.totals.candidates}</div>
              </div>
              <div className="rounded-lg bg-white p-2 border border-slate-100">
                <div className="text-slate-400">Iriam enviar</div>
                <div className="text-slate-800 font-bold">{sendPreview.totals.willSend}</div>
              </div>
              <div className="rounded-lg bg-white p-2 border border-slate-100">
                <div className="text-slate-400">Bloqueados (sem Push)</div>
                <div className="text-slate-800 font-bold">{sendPreview.totals.blockedNoToken}</div>
              </div>
              <div className="rounded-lg bg-white p-2 border border-slate-100">
                <div className="text-slate-400">Bloqueados (inativos)</div>
                <div className="text-slate-800 font-bold">{sendPreview.totals.blockedInactive}</div>
              </div>
            </div>

            <div className="mt-2 text-[11px] text-slate-500">
              Sem telefone (dados incompletos):{' '}
              <span className="font-bold text-slate-700">{sendPreview.totals.blockedMissingPhone || 0}</span>
            </div>

            <div className="mt-3 text-[11px] text-slate-500">
              Pacientes bloqueados (até 25) — motivo:
              <span className="ml-2 text-slate-400">
                Sem Push → orientar ativação de notificações no painel. Inativo → não deve receber lembretes.
              </span>
            </div>

            <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-slate-100 bg-white">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white border-b border-slate-100">
                  <tr>
                    <th className="p-2 text-left text-[11px] text-slate-400 font-bold">Paciente</th>
                    <th className="p-2 text-left text-[11px] text-slate-400 font-bold">Telefone</th>
                    <th className="p-2 text-left text-[11px] text-slate-400 font-bold">Motivo</th>
                    <th className="p-2 text-right text-[11px] text-slate-400 font-bold">Msgs</th>
                  </tr>
                </thead>
                <tbody>
                  {(sendPreview.blockedPatients || []).map((p) => (
                    <tr key={`${p.phoneCanonical || 'sem'}_${p.reason || 'motivo'}`} className="border-b border-slate-50">
                      <td className="p-2 text-slate-700 font-semibold">{p.name || '-'}</td>
                      <td className="p-2 text-slate-500">{p.phoneCanonical || '-'}</td>
                      <td className="p-2 text-slate-600 font-bold">{p.reason || '-'}</td>
                      <td className="p-2 text-right text-slate-700 font-bold">{p.count}</td>
                    </tr>
                  ))}
                  {(!sendPreview.blockedPatients || sendPreview.blockedPatients.length === 0) && (
                    <tr>
                      <td className="p-3 text-center text-slate-400" colSpan={4}>
                        Nenhum bloqueio detectado no preview.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 text-[11px] text-slate-500">Top pacientes (até 25) com lembretes pendentes:</div>

            <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-slate-100 bg-white">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white border-b border-slate-100">
                  <tr>
                    <th className="p-2 text-left text-[11px] text-slate-400 font-bold">Paciente</th>
                    <th className="p-2 text-left text-[11px] text-slate-400 font-bold">Telefone</th>
                    <th className="p-2 text-right text-[11px] text-slate-400 font-bold">Msgs</th>
                  </tr>
                </thead>
                <tbody>
                  {(sendPreview.patients || []).map((p) => (
                    <tr key={p.phoneCanonical || Math.random()} className="border-b border-slate-50">
                      <td className="p-2 text-slate-700 font-semibold">{p.name || '-'}</td>
                      <td className="p-2 text-slate-500">{p.phoneCanonical || '-'}</td>
                      <td className="p-2 text-right text-slate-700 font-bold">{p.count}</td>
                    </tr>
                  ))}
                  {(!sendPreview.patients || sendPreview.patients.length === 0) && (
                    <tr>
                      <td className="p-3 text-center text-slate-400" colSpan={3}>
                        Nenhum lembrete pendente para preview.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex gap-2 mb-4 overflow-x-auto pb-2 border-b border-slate-50">
          <Filter size={14} className="text-slate-400 mt-1.5 ml-2" />
          {professionalsList.map((prof) => (
            <button
              key={prof}
              onClick={() => setFilterProf(prof)}
              className={`text-xs px-3 py-1.5 rounded-full transition-all ${
                filterProf === prof
                  ? 'bg-violet-600 text-white shadow-md shadow-violet-200'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {prof}
            </button>
          ))}
        </div>

        {filteredAppointments.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-300">
            <div className="bg-slate-50 p-4 rounded-full mb-3">
              <FileSpreadsheet size={32} />
            </div>
            <p className="text-sm">Nenhum dado importado.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-slate-200">
            {filteredAppointments.map((app) => (
              <div
                key={app.id}
                className={`p-4 border rounded-xl flex justify-between items-center transition-all hover:shadow-sm ${
                  app.reminderType ? 'bg-violet-50 border-violet-100' : 'bg-white border-slate-100 opacity-70'
                }`}
              >
                <div>
                  <span className="font-bold text-slate-700 block text-sm mb-0.5">{app.nome}</span>
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <User size={12} /> {app.cleanPhone}
                  </span>
                  <span className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                    <CalendarCheck size={12} /> {app.data} • {app.hora}
                  </span>
                  {app.profissional ? (
                    <span className="text-[11px] text-slate-400 mt-1 block">Prof.: {app.profissional}</span>
                  ) : null}
                </div>

                <div className="text-right">
                  <div className="text-xs font-semibold text-slate-600">{app.timeLabel}</div>
                  <Badge
                    status={((hasTokenByPhone[normalizePhoneCanonical(app.cleanPhone || app.phoneCanonical || app.phone)] ?? app.isSubscribed) ? 'confirmed' : 'missing')}
                    text={(hasTokenByPhone[normalizePhoneCanonical(app.cleanPhone || app.phoneCanonical || app.phone)] ? 'Sem Token' : 'Autorizado')}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
