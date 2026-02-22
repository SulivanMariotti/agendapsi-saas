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
import {
  AlertTriangle,
  Bell,
  CalendarCheck,
  CloudUpload,
  Copy,
  Download,
  FileSpreadsheet,
  Filter,
  Loader2,
  PlusCircle,
  RefreshCcw,
  Save,
  Send,
  ShieldAlert,
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

function isValidPhoneCanonical(phoneCanonical) {
  const p = normalizePhoneCanonical(phoneCanonical);
  return !!p && (p.length === 10 || p.length === 11);
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

// ISO date local (YYYY-MM-DD) — evita diferença por UTC (importante para "dia" operacional)
function getLocalISODate(d = new Date()) {
  const tz = d.getTimezoneOffset();
  const local = new Date(d.getTime() - tz * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function safeSlug(str, max = 18) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, max);
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function downloadCSV({ filename, rows }) {
  const header = Object.keys(rows?.[0] || {}).join(',');
  const lines = (rows || []).map((r) => Object.values(r).map(csvEscape).join(','));
  const csv = [header, ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'diagnostico.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 500);
}

// Hash leve (djb2) para invalidar preview quando seleção (filtro/busca/upload) muda.
function hashParts(parts = []) {
  let h = 5381;
  for (const part of parts) {
    const s = String(part ?? '');
    for (let i = 0; i < s.length; i += 1) {
      h = ((h << 5) + h) + s.charCodeAt(i); // h * 33 + c
      h >>>= 0; // unsigned
    }
    // separador
    h = ((h << 5) + h) + 124; // '|'
    h >>>= 0;
  }
  return h.toString(16);
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
    const minEnd = new Date(now.getTime() + 32 * 24 * 60 * 60 * 1000);
    const candidateEnd = windowEnd || computeUploadWindowEnd(list) || minEnd;
    const end = candidateEnd && candidateEnd > minEnd ? candidateEnd : minEnd;

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
  const [pushStatusLoading, setPushStatusLoading] = useState(false);
  const [pushStatusLastCheckedAtISO, setPushStatusLastCheckedAtISO] = useState(null);

  // Saúde do sistema (falha-segura) — detecta env ausente, Admin SDK indisponível, VAPID etc.
  const [opsHealthLoading, setOpsHealthLoading] = useState(false);
  const [opsHealth, setOpsHealth] = useState(null);
  const [opsHealthLastCheckedAtISO, setOpsHealthLastCheckedAtISO] = useState(null);

  // Assinatura da seleção usada no último Preview (evita envio com preview “velho” após filtro/busca mudar)
  const [lastPreviewSignature, setLastPreviewSignature] = useState(null);
  const stalePreviewNotifiedRef = useRef(false);

  const [isSending, setIsSending] = useState(false);
  const [sendPreview, setSendPreview] = useState(null);
  const [sendMode, setSendMode] = useState('preview'); // 'preview' | 'ready' | 'sending'

  const [lastDispatch, setLastDispatch] = useState(null);

  // Registro diário (Admin) — auditoria operacional do modo manual
  const [dailyDateISO] = useState(() => getLocalISODate(new Date()));
  const [dailyLogLoading, setDailyLogLoading] = useState(false);
  const [dailyLogSaving, setDailyLogSaving] = useState(false);
  const [dailyLog, setDailyLog] = useState(null);
  const [dailyNotes, setDailyNotes] = useState('');
  const [showDailySummaryPreview, setShowDailySummaryPreview] = useState(false);

  // Auditoria (últimos dias) — trilha de evidência do modo manual
  const [auditListLoading, setAuditListLoading] = useState(false);
  const [auditList, setAuditList] = useState([]);
  const [auditViewOpen, setAuditViewOpen] = useState(false);
  const [auditViewLoading, setAuditViewLoading] = useState(false);
  const [auditViewLog, setAuditViewLog] = useState(null);

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

  const fetchOpsHealth = async () => {
    try {
      setOpsHealthLoading(true);
      const res = await adminFetch('/api/admin/ops/health');
      if (!res.ok) {
        setOpsHealth(null);
        setOpsHealthLastCheckedAtISO(new Date().toISOString());
        return;
      }
      const data = await res.json().catch(() => ({}));
      setOpsHealth(data || null);
      setOpsHealthLastCheckedAtISO(new Date().toISOString());
    } catch (_) {
      setOpsHealth(null);
      setOpsHealthLastCheckedAtISO(new Date().toISOString());
    } finally {
      setOpsHealthLoading(false);
    }
  };

  // Saúde do sistema: checagem leve ao abrir (evita “achar que está tudo ok” quando env/SDK falham)
  useEffect(() => {
    fetchOpsHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Carrega registro do dia (se existir) para reduzir risco humano e criar trilha de evidências
  useEffect(() => {
    (async () => {
      try {
        setDailyLogLoading(true);
        const res = await adminFetch(`/api/admin/ops/daily-log?date=${encodeURIComponent(dailyDateISO)}`);
        if (!res.ok) {
          setDailyLog(null);
          setDailyNotes('');
          return;
        }
        const data = await res.json().catch(() => ({}));
        const log = data?.log || null;
        setDailyLog(log);
        setDailyNotes(String(log?.notes || ''));
      } catch (_) {
        setDailyLog(null);
        setDailyNotes('');
      } finally {
        setDailyLogLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stepper: se mudar CSV, reseta estado do pipeline
  useEffect(() => {
    setHasVerified(false);
    setHasSynced(false);

    // Fetch push token status from server para evitar falso “Sem Push”
    (async () => {
      try {
        setPushStatusLoading(true);
        const phonesUnique = Array.from(
          new Set(
            (processedAppointments || [])
              .filter((a) => a.reminderType)
              .map((a) => normalizePhoneCanonical(a.cleanPhone || a.phoneCanonical || a.phone))
              .filter((p) => isValidPhoneCanonical(p))
          )
        );

        if (!phonesUnique.length) {
          setHasTokenByPhone({});
          setPushStatusLastCheckedAtISO(new Date().toISOString());
          return;
        }

        const res = await adminFetch(STATUS_BATCH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phones: phonesUnique }),
        });

        if (!res.ok) {
          setHasTokenByPhone({});
          return;
        }

        const data = await res.json().catch(() => ({}));
        const byPhone = data?.byPhone || {};
        setHasTokenByPhone(byPhone);
        setPushStatusLastCheckedAtISO(new Date().toISOString());
      } catch (_) {
        setHasTokenByPhone({});
      } finally {
        setPushStatusLoading(false);
      }
    })();

    resetSendState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csvInput]);

  const resetSendState = () => {
    setSendPreview(null);
    setSendMode('preview');
    setLastPreviewSignature(null);
    stalePreviewNotifiedRef.current = false;
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

  // Assinatura determinística da seleção atual (para invalidar preview quando filtro/busca mudam)
  const selectionSignature = useMemo(() => {
    const selection = (filteredAppointments || []).filter((a) => a.isSubscribed && a.reminderType);
    const baseParts = [
      lastUploadId || globalConfig?.appointmentsLastUploadId || '',
      String(filterProf || 'Todos'),
      String(searchTerm || '').trim().toLowerCase(),
      String(selection.length),
    ];

    const parts = [...baseParts];
    selection.forEach((a) => {
      const phone = normalizePhoneCanonical(a.cleanPhone || a.phoneCanonical || a.phone);
      const isoDate = String(a?.isoDate || normalizeToISODate(a?.data || a?.date || '') || '').trim();
      const time = String(a?.hora || a?.time || '').trim();
      const profissional = String(a?.profissional || a?.professional || a?.professionalName || '').trim();
      const id = phone && isoDate && time ? makeAppointmentId({ phone, isoDate, time, profissional }) : `${phone || ''}|${isoDate || ''}|${time || ''}|${profissional || ''}`;
      parts.push(id);
    });

    return { hash: hashParts(parts), count: selection.length };
  }, [filteredAppointments, lastUploadId, globalConfig, filterProf, searchTerm]);

  // Falha-segura: se o operador muda filtro/busca depois do Preview, invalida o preview automaticamente.
  useEffect(() => {
    if (!sendPreview) return;
    if (sendMode !== 'ready') return;
    if (!lastPreviewSignature) return;
    if (selectionSignature?.hash === lastPreviewSignature) return;
    if (stalePreviewNotifiedRef.current) return;

    stalePreviewNotifiedRef.current = true;
    setSendPreview(null);
    setSendMode('preview');
    showToast('A seleção mudou (filtro/busca). O Preview anterior foi invalidado — gere novamente antes de enviar.', 'info');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionSignature?.hash]);

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

    if (opsHardBlocked) {
      showToast('Saúde do sistema com falha crítica. Corrija o item em “Falha-segura” antes de gerar preview/enviar.', 'error');
      return false;
    }

    const toCanonical = (v) => {
      let d = onlyDigits(v).replace(/^0+/, '');
      if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
      return d;
    };

    const candidates = (filteredAppointments || []).filter((a) => a.isSubscribed && a.reminderType);

    const phonesUnique = Array.from(
      new Set(
        candidates
          .map((a) => toCanonical(a.cleanPhone || a.phoneCanonical || a.phone))
          .filter((p) => isValidPhoneCanonical(p))
      )
    );

    let hasTokenMap = {};
    try {
      setPushStatusLoading(true);
      const res = await adminFetch(STATUS_BATCH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phones: phonesUnique }),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        hasTokenMap = data?.byPhone || {};
        setHasTokenByPhone(hasTokenMap);
        setPushStatusLastCheckedAtISO(new Date().toISOString());
      } else {
        showToast('Não foi possível consultar o status de push (tokens). Tente novamente.', 'error');
        return false;
      }
    } catch (_) {
      showToast('Falha ao consultar o status de push (tokens). Verifique sua sessão e tente novamente.', 'error');
      return false;
    } finally {
      setPushStatusLoading(false);
    }

    const getHasToken = (a) => {
      const p = toCanonical(a.cleanPhone || a.phoneCanonical || a.phone);
      if (p && Object.prototype.hasOwnProperty.call(hasTokenMap, p)) return !!hasTokenMap[p];
      return false;
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
      selectionSignature: selectionSignature || null,
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

    setLastPreviewSignature(selectionSignature?.hash || null);
    stalePreviewNotifiedRef.current = false;
    setSendPreview(preview);
    showToast('Preview gerado. Nenhuma mensagem foi enviada.', 'info');
    return true;
  };

  const handleDispatchReminders = async () => {
    if (!sendPreview || !sendPreview?.willSendItems?.length) {
      showToast('Gere o preview antes de disparar.', 'error');
      return;
    }

    if (opsHardBlocked) {
      showToast('Saúde do sistema com falha crítica. Corrija o item em “Falha-segura” antes de enviar.', 'error');
      setSendMode('preview');
      return;
    }

    // Falha-segura: não permite enviar se o preview não corresponde à seleção atual.
    const previewSig = sendPreview?.selectionSignature?.hash || null;
    if (previewSig && selectionSignature?.hash && previewSig !== selectionSignature.hash) {
      showToast('O Preview está desatualizado para a seleção atual. Gere o Preview novamente antes de enviar.', 'error');
      setSendPreview(null);
      setSendMode('preview');
      return;
    }

    // Proteção operacional: se ainda existe diagnóstico “CHECK”, bloqueia envio.
    // Isso evita disparar sem ter certeza do status de push (sem token / inativo), protegendo a constância.
    if (opMetrics?.pushUnknown > 0) {
      showToast('Antes de enviar, gere o Preview para consultar o diagnóstico de push (há status CHECK).', 'error');
      setSendMode('preview');
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

      setLastDispatch({
        atISO: new Date().toISOString(),
        uploadId: sendPreview?.uploadId || lastUploadId || globalConfig?.appointmentsLastUploadId || null,
        sentCount: data?.sentCount || 0,
        failCount: data?.failCount || 0,
        skippedNoToken: data?.skippedNoToken || 0,
        skippedAlreadySent: data?.skippedAlreadySent || 0,
        skippedInactiveSubscriber: data?.skippedInactiveSubscriber || 0,
        skippedInactivePatient: data?.skippedInactivePatient || 0,
      });

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
    if (opsHardBlocked) {
      showToast('Saúde do sistema com falha crítica. Corrija o item em “Falha-segura” antes de operar.', 'error');
      return;
    }
    if (sendMode === 'ready') {
      await handleDispatchReminders();
      return;
    }
    setIsSending(true);
    try {
      const ok = await generateSendPreview();
      setSendMode(ok ? 'ready' : 'preview');
    } finally {
      setIsSending(false);
    }
  };


  const opNext = useMemo(() => {
    if (!String(csvInput || '').trim()) {
      return {
        label: 'Carregar Planilha',
        detail: 'Cole o CSV ou use "Carregar Planilha" para iniciar o dia.',
      };
    }
    if (!hasVerified) {
      return {
        label: 'Verificar',
        detail: 'Valida a planilha e calcula os disparos pendentes.',
      };
    }
    if (!hasSynced) {
      return {
        label: 'Sincronizar',
        detail: 'Atualiza a agenda server-side (fonte do painel do paciente).',
      };
    }
    if (!sendPreview || sendMode !== 'ready') {
      return {
        label: 'Gerar Preview do Disparo',
        detail: 'Confere bloqueios (inativo/sem push) antes de enviar.',
      };
    }
    return {
      label: 'Enviar lembretes',
      detail: 'Dispara push com dedupe (evita reenviar o mesmo slot).',
    };
  }, [csvInput, hasVerified, hasSynced, sendMode, sendPreview]);

  const opMetrics = useMemo(() => {
    const total = (processedAppointments || []).length;
    const authorized = (processedAppointments || []).filter((a) => a.isSubscribed).length;
    const notAuthorized = Math.max(0, total - authorized);

    const selection = (filteredAppointments || []).filter((a) => a.isSubscribed && a.reminderType);

    let blockedMissingPhone = 0;
    let blockedInactive = 0;
    let blockedNoPush = 0;

    const phones = new Set();

    selection.forEach((a) => {
      const phone = normalizePhoneCanonical(a.cleanPhone || a.phoneCanonical || a.phone);
      if (!isValidPhoneCanonical(phone)) {
        blockedMissingPhone += 1;
        return;
      }

      phones.add(phone);

      if (inactivePhoneSet.has(phone)) {
        blockedInactive += 1;
        return;
      }

      if (Object.prototype.hasOwnProperty.call(hasTokenByPhone, phone)) {
        if (!hasTokenByPhone[phone]) blockedNoPush += 1;
      }
    });

    const phonesArr = Array.from(phones);
    const pushKnown = phonesArr.filter((p) => Object.prototype.hasOwnProperty.call(hasTokenByPhone, p)).length;
    const pushWithToken = phonesArr.filter((p) => Object.prototype.hasOwnProperty.call(hasTokenByPhone, p) && !!hasTokenByPhone[p]).length;
    const pushWithoutToken = phonesArr.filter((p) => Object.prototype.hasOwnProperty.call(hasTokenByPhone, p) && !hasTokenByPhone[p]).length;
    const pushUnknown = Math.max(0, phones.size - pushKnown);

    const selectionCount = selection.length;
    const ready = Math.max(0, selectionCount - blockedMissingPhone - blockedInactive - blockedNoPush);

    return {
      total,
      authorized,
      notAuthorized,
      selectionCount,
      ready,
      blockedMissingPhone,
      blockedInactive,
      blockedNoPush,
      phonesUnique: phones.size,
      pushKnown,
      pushWithToken,
      pushWithoutToken,
      pushUnknown,
    };
  }, [processedAppointments, filteredAppointments, inactivePhoneSet, hasTokenByPhone]);

  const diagnosticRows = useMemo(() => {
    const selection = (filteredAppointments || []).filter((a) => a.isSubscribed && a.reminderType);

    return selection.map((a) => {
      const phone = normalizePhoneCanonical(a.cleanPhone || a.phoneCanonical || a.phone);
      const isoDate = String(a?.isoDate || normalizeToISODate(a?.data || a?.date || '') || '').trim();
      const time = String(a?.hora || a?.time || '').trim();
      const profissional = String(a?.profissional || a?.professional || a?.professionalName || '').trim();

      let status = 'READY';
      let reason = '';

      if (!isValidPhoneCanonical(phone)) {
        status = 'BLOCKED';
        reason = 'SEM_TELEFONE';
      } else if (inactivePhoneSet.has(phone)) {
        status = 'BLOCKED';
        reason = 'INATIVO';
      } else if (Object.prototype.hasOwnProperty.call(hasTokenByPhone, phone)) {
        if (!hasTokenByPhone[phone]) {
          status = 'BLOCKED';
          reason = 'SEM_PUSH';
        }
      } else {
        status = 'CHECK';
        reason = 'PUSH_NAO_CONSULTADO';
      }

      const appointmentId = phone && isoDate && time ? makeAppointmentId({ phone, isoDate, time, profissional }) : '';

      return {
        status,
        motivo: reason,
        appointmentId,
        paciente: a.nome || a.name || a.patientName || '',
        telefone: phone || '',
        data: a.data || a.date || (isoDate ? formatISOToBR(isoDate) : ''),
        hora: time || '',
        profissional: profissional || '',
        lembrete: a.reminderType || '',
      };
    });
  }, [filteredAppointments, inactivePhoneSet, hasTokenByPhone]);

  const handleDownloadDiagnostic = () => {
    try {
      if (!diagnosticRows?.length) {
        showToast('Nenhum disparo na seleção atual para gerar diagnóstico.', 'error');
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      downloadCSV({ filename: `diagnostico_agenda_${today}.csv`, rows: diagnosticRows });
      showToast('Diagnóstico baixado (CSV).', 'success');
    } catch (e) {
      console.error(e);
      showToast('Falha ao gerar diagnóstico (CSV).', 'error');
    }
  };

  const needsPushCheck = useMemo(() => {
    return (opMetrics?.pushUnknown || 0) > 0 && (opMetrics?.phonesUnique || 0) > 0;
  }, [opMetrics]);

  const opsHardBlocked = useMemo(() => {
    const checks = Array.isArray(opsHealth?.checks) ? opsHealth.checks : [];
    // Só bloqueia ações quando houver falha crítica (level=error)
    return checks.some((c) => c && c.ok === false && String(c.level || '').toLowerCase() === 'error');
  }, [opsHealth]);

  const failSafeItems = useMemo(() => {
    const items = [];

    const checks = Array.isArray(opsHealth?.checks) ? opsHealth.checks : [];
    checks.forEach((c) => {
      if (!c || c.ok !== false) return;
      items.push({
        level: String(c.level || 'warn').toLowerCase(),
        title: String(c.title || c.key || 'Checagem'),
        detail: String(c.detail || ''),
        fix: Array.isArray(c.fix) ? c.fix.map(String) : [],
      });
    });

    // Inconsistência comum: há disparos, mas nenhum está pronto (tudo bloqueado)
    if ((opMetrics?.selectionCount || 0) > 0 && (opMetrics?.ready || 0) === 0) {
      items.push({
        level: 'warn',
        title: 'Nenhum disparo apto (tudo bloqueado)',
        detail: `A seleção tem ${opMetrics.selectionCount} disparo(s), mas 0 prontos.`,
        fix: [
          'Clique em “Baixar diagnóstico (CSV)” para ver o motivo por linha (INATIVO / SEM_PUSH / SEM_TELEFONE).',
          'Se o motivo for SEM_PUSH: oriente o paciente a ativar notificações no painel (constância).',
          'Se for SEM_TELEFONE: corrija a planilha/cadastro antes do próximo envio.',
        ],
      });
    }

    // Inconsistência comum: operador aplicou filtro/busca e a seleção ficou vazia
    if (String(csvInput || '').trim() && hasVerified && (opMetrics?.selectionCount || 0) === 0) {
      items.push({
        level: 'info',
        title: 'Nenhum disparo na seleção atual',
        detail: 'Pode ser filtro de profissional ou busca muito restrita (ou não há lembretes pendentes nessa janela).',
        fix: ['Revise o filtro “Profissional” e limpe a busca para conferir se há disparos pendentes.'],
      });
    }

    // Diagnóstico CHECK (push não consultado) — reforça o passo do preview
    if (needsPushCheck) {
      items.push({
        level: 'warn',
        title: 'CHECK de push ainda pendente',
        detail: `Há ${opMetrics?.pushUnknown || 0} paciente(s) com status de push não confirmado.`,
        fix: ['Gere o “Preview do Disparo” para consultar tokens e destravar o envio com segurança.'],
      });
    }

    return items;
  }, [opsHealth, opMetrics, csvInput, hasVerified, needsPushCheck]);

  const buildDailySummaryText = () => {
    const d = new Date();
    const dateBR = d.toLocaleDateString('pt-BR');
    const timeBR = d.toLocaleTimeString('pt-BR');

    const pipeline = [
      String(csvInput || '').trim() ? 'Importado' : 'Importar',
      hasVerified ? 'Verificado' : 'Verificar',
      hasSynced ? 'Sincronizado' : 'Sincronizar',
      sendPreview && sendMode === 'ready' ? 'Preview OK' : 'Preview',
      lastDispatch ? 'Enviado' : 'Envio',
    ].join(' → ');

    const last = lastDispatch
      ? `Último envio: ${new Date(lastDispatch.atISO).toLocaleString('pt-BR')} | enviados ${lastDispatch.sentCount} | falhas ${lastDispatch.failCount} | já enviados ${lastDispatch.skippedAlreadySent} | sem push ${lastDispatch.skippedNoToken}`
      : 'Último envio: —';

    const pushInfo = `Push: únicos ${opMetrics.phonesUnique} | com push ${opMetrics.pushWithToken} | sem push ${opMetrics.pushWithoutToken} | CHECK ${opMetrics.pushUnknown}`;

    const planilha = `Planilha: linhas ${opMetrics.total} | autorizados ${opMetrics.authorized} | não autorizados ${opMetrics.notAuthorized}`;
    const selecao = `Seleção: disparos ${opMetrics.selectionCount} | prontos (estim.) ${opMetrics.ready} | bloqueios: inativo ${opMetrics.blockedInactive} | sem push ${opMetrics.blockedNoPush} | sem telefone ${opMetrics.blockedMissingPhone}`;

    const checkedAt = pushStatusLastCheckedAtISO
      ? `Status push consultado em: ${new Date(pushStatusLastCheckedAtISO).toLocaleString('pt-BR')}`
      : 'Status push consultado em: —';

    return [
      `LEMBRETE PSI — RESUMO DO DIA`,
      `${dateBR} • ${timeBR}`,
      '',
      `Pipeline: ${pipeline}`,
      '',
      planilha,
      selecao,
      pushInfo,
      checkedAt,
      '',
      last,
      '',
      `Nota clínica: a constância sustenta o vínculo terapêutico. Faltar não é apenas perder uma hora — é interromper um processo que precisa de continuidade.`,
    ].join('\n');
  };

  const handleCopyDailySummary = async () => {
    try {
      const text = buildDailySummaryText();
      if (!text) return;

      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const el = document.createElement('textarea');
        el.value = text;
        el.setAttribute('readonly', '');
        el.style.position = 'absolute';
        el.style.left = '-9999px';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        el.remove();
      }

      showToast('Resumo do dia copiado para a área de transferência.', 'success');
    } catch (e) {
      console.error(e);
      showToast('Falha ao copiar o resumo do dia.', 'error');
    }
  };

  const canCompleteDay = useMemo(() => {
    // “Concluir” é um selo de que o dia foi realmente fechado.
    // Proteções:
    // - se ainda existe CHECK, força o preview (evita falso positivo)
    // - se há disparos na seleção e ainda não houve envio nesta sessão, evita concluir por engano
    if (needsPushCheck) return false;
    if ((opMetrics?.selectionCount || 0) > 0 && !lastDispatch) return false;
    return true;
  }, [needsPushCheck, opMetrics, lastDispatch]);

  const refreshDailyLog = async () => {
    try {
      setDailyLogLoading(true);
      const res = await adminFetch(`/api/admin/ops/daily-log?date=${encodeURIComponent(dailyDateISO)}`);
      if (!res.ok) {
        setDailyLog(null);
        return;
      }
      const data = await res.json().catch(() => ({}));
      const log = data?.log || null;
      setDailyLog(log);
      setDailyNotes(String(log?.notes || dailyNotes || ''));
    } catch (_) {
      // ignore
    } finally {
      setDailyLogLoading(false);
    }
  };

  const refreshAuditList = async ({ limit = 14 } = {}) => {
    try {
      setAuditListLoading(true);
      const url = "/api/admin/ops/daily-logs?limit=" + encodeURIComponent(String(limit));
      const res = await adminFetch(url);
      if (!res.ok) {
        setAuditList([]);
        return;
      }
      const data = await res.json().catch(() => ({}));
      setAuditList(Array.isArray(data?.logs) ? data.logs : []);
    } catch (_) {
      setAuditList([]);
    } finally {
      setAuditListLoading(false);
    }
  };

  const handleViewAuditDay = async (dateISO) => {
    try {
      setAuditViewOpen(true);
      setAuditViewLoading(true);
      setAuditViewLog(null);

      const url = "/api/admin/ops/daily-log?date=" + encodeURIComponent(String(dateISO || ""));
      const res = await adminFetch(url);
      if (!res.ok) {
        setAuditViewLog(null);
        return;
      }
      const data = await res.json().catch(() => ({}));
      setAuditViewLog(data?.log || null);
    } catch (_) {
      setAuditViewLog(null);
    } finally {
      setAuditViewLoading(false);
    }
  };

  useEffect(() => {
    refreshAuditList({ limit: 14 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildDailyLogPayload = () => {
    const summaryText = buildDailySummaryText();
    const pipeline = {
      imported: !!String(csvInput || '').trim(),
      verified: !!hasVerified,
      synced: !!hasSynced,
      previewOk: !!(sendPreview && sendMode === 'ready'),
      sent: !!lastDispatch,
    };

    const metrics = {
      ...opMetrics,
      pipeline,
      pushStatusLastCheckedAtISO: pushStatusLastCheckedAtISO || null,
      lastDispatch: lastDispatch || null,
    };

    const context = {
      filterProf: filterProf || 'Todos',
      searchTerm: String(searchTerm || '').trim() || null,
      sendMode,
      lastUploadId: lastUploadId || null,
    };

    return {
      dateISO: dailyDateISO,
      summaryText,
      notes: String(dailyNotes || ''),
      metrics,
      context,
    };
  };

  const handleSaveDailyLog = async ({ complete = false } = {}) => {
    try {
      setDailyLogSaving(true);
      const payload = buildDailyLogPayload();
      payload.action = complete ? 'complete' : 'save';

      const res = await adminFetch('/api/admin/ops/daily-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data?.error || 'Falha ao salvar o registro do dia.', 'error');
        return;
      }

      showToast(complete ? 'Dia marcado como concluído.' : 'Registro do dia salvo.', 'success');
      await refreshDailyLog();
      await refreshAuditList({ limit: 14 });
    } catch (e) {
      console.error(e);
      showToast('Falha ao salvar o registro do dia.', 'error');
    } finally {
      setDailyLogSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {auditViewOpen ? (
        <div className="fixed inset-0 z-[9999] bg-black/30 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
            <div className="flex items-start justify-between gap-4 px-4 py-3 border-b border-slate-100">
              <div>
                <div className="text-sm font-bold text-slate-800">
                  Auditoria — {auditViewLog?.dateISO ? formatISOToBR(auditViewLog.dateISO) : "—"}
                </div>
                <div className="text-[11px] text-slate-500">Registro operacional (modo manual) — sem CTA de cancelar/remarcar.</div>
              </div>
              <button
                onClick={() => {
                  setAuditViewOpen(false);
                  setAuditViewLog(null);
                }}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            <div className="p-4">
              {auditViewLoading ? (
                <div className="text-[11px] text-slate-400">Carregando…</div>
              ) : auditViewLog ? (
                <>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {auditViewLog.completedAtMs ? (
                      <Badge status="match" text="Concluído" />
                    ) : (
                      <Badge status="pending" text="Salvo" />
                    )}
                    {auditViewLog?.metrics?.selectionCount != null ? (
                      <Badge status="pending" text={"Disparos: " + auditViewLog.metrics.selectionCount} />
                    ) : null}
                    {auditViewLog?.metrics?.ready != null ? (
                      <Badge status="pending" text={"Prontos: " + auditViewLog.metrics.ready} />
                    ) : null}
                    {auditViewLog?.metrics?.pushUnknown != null ? (
                      <Badge status="pending" text={"CHECK: " + auditViewLog.metrics.pushUnknown} />
                    ) : null}
                  </div>

                  {auditViewLog.notes ? (
                    <div className="mb-3">
                      <div className="text-[11px] font-semibold text-slate-700 mb-1">Observações</div>
                      <div className="text-[11px] text-slate-700 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3">
                        {auditViewLog.notes}
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <div className="text-[11px] font-semibold text-slate-700 mb-1">Resumo</div>
                    <pre className="text-[11px] whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-3 text-slate-700 max-h-[340px] overflow-auto">
                      {auditViewLog.summaryText || "—"}
                    </pre>
                  </div>
                </>
              ) : (
                <div className="text-[11px] text-slate-400">Registro não encontrado.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
      <Card title="Operação do Dia" className="lg:col-span-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div>
              <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Hoje</div>
              <div className="text-sm font-bold text-slate-800">{new Date().toLocaleDateString('pt-BR')}</div>
              <div className="text-[11px] text-slate-500 mt-1">
                <b>Próxima ação:</b> {opNext.label} — {opNext.detail}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleCopyDailySummary}
                variant="secondary"
                icon={Copy}
                className="!py-1.5 !px-3 text-xs"
              >
                Copiar resumo do dia
              </Button>
              <Button
                onClick={handleDownloadDiagnostic}
                variant="secondary"
                icon={Download}
                className="!py-1.5 !px-3 text-xs"
                disabled={!diagnosticRows?.length}
              >
                Baixar diagnóstico (CSV)
              </Button>
              <Badge
                status={String(csvInput || '').trim() ? 'match' : 'pending'}
                text={String(csvInput || '').trim() ? 'Importado' : 'Importar'}
              />
              <Badge status={hasVerified ? 'match' : 'pending'} text={hasVerified ? 'Verificado' : 'Verificar'} />
              <Badge status={hasSynced ? 'match' : 'pending'} text={hasSynced ? 'Sincronizado' : 'Sincronizar'} />
              <Badge
                status={sendPreview && sendMode === 'ready' ? 'match' : 'pending'}
                text={sendPreview && sendMode === 'ready' ? 'Preview OK' : 'Preview'}
              />
              <Badge status={lastDispatch ? 'match' : 'pending'} text={lastDispatch ? 'Enviado' : 'Envio'} />
            </div>
          </div>

          {opsHealthLoading ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
              Checando saúde do sistema…
            </div>
          ) : null}

          {!opsHealthLoading && (failSafeItems?.length ? true : false) ? (
            <div className="rounded-2xl border border-slate-100 bg-white p-3">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldAlert size={16} className={opsHardBlocked ? 'text-rose-600' : 'text-slate-500'} />
                  <div>
                    <div className="text-xs font-bold text-slate-800">Falha-segura</div>
                    <div className="text-[11px] text-slate-500">
                      Detecção automática de riscos operacionais (para evitar “achar que enviou”).
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={fetchOpsHealth}
                    variant="secondary"
                    icon={RefreshCcw}
                    className="!py-1.5 !px-3 text-xs"
                    disabled={opsHealthLoading}
                  >
                    Reverificar
                  </Button>
                  {opsHealthLastCheckedAtISO ? (
                    <div className="text-[11px] text-slate-400 flex items-center">
                      {new Date(opsHealthLastCheckedAtISO).toLocaleString('pt-BR')}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {(failSafeItems || []).map((it, idx) => {
                  const level = String(it.level || 'info');
                  const box =
                    level === 'error'
                      ? 'border-rose-200 bg-rose-50 text-rose-900'
                      : level === 'warn'
                      ? 'border-amber-200 bg-amber-50 text-amber-900'
                      : 'border-slate-200 bg-slate-50 text-slate-700';

                  const Icon = level === 'error' ? ShieldAlert : AlertTriangle;
                  return (
                    <div key={`${level}_${idx}`} className={`rounded-xl border p-3 ${box}`}>
                      <div className="flex items-start gap-2">
                        <Icon size={16} className="mt-[1px]" />
                        <div className="flex-1">
                          <div className="text-[11px] font-bold">{it.title}</div>
                          {it.detail ? <div className="text-[11px] mt-0.5 opacity-90">{it.detail}</div> : null}

                          {Array.isArray(it.fix) && it.fix.length ? (
                            <ul className="mt-2 list-disc pl-4 text-[11px] space-y-1">
                              {it.fix.slice(0, 5).map((s, i) => (
                                <li key={i}>{s}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="text-xs font-bold text-slate-700 mb-2">Resumo da planilha</div>
              <div className="text-[11px] text-slate-600 space-y-1">
                <div>
                  <b>Linhas:</b> {opMetrics.total}
                </div>
                <div>
                  <b>Autorizados:</b> {opMetrics.authorized}
                </div>
                <div>
                  <b>Não autorizados:</b> {opMetrics.notAuthorized}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="text-xs font-bold text-slate-700 mb-2">Seleção atual</div>
              <div className="text-[11px] text-slate-600 space-y-1">
                <div>
                  <b>Disparos:</b> {opMetrics.selectionCount}
                </div>
                <div>
                  <b>Prontos (estim.):</b> {opMetrics.ready}
                </div>
                <div className="pt-1 text-slate-500">
                  Bloqueios: {opMetrics.blockedInactive} inativo • {opMetrics.blockedNoPush} sem push • {opMetrics.blockedMissingPhone}{' '}
                  sem telefone
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="text-xs font-bold text-slate-700 mb-2">Diagnóstico push</div>
              <div className="text-[11px] text-slate-600 space-y-1">
                <div>
                  <b>Pacientes únicos:</b> {opMetrics.phonesUnique}
                </div>
                <div>
                  <b>Com push:</b> {opMetrics.pushWithToken}
                </div>
                <div>
                  <b>Sem push:</b> {opMetrics.pushWithoutToken}
                </div>
                <div>
                  <b>CHECK:</b> {opMetrics.pushUnknown}{' '}
                  {pushStatusLoading ? <span className="text-slate-400">(consultando…)</span> : null}
                </div>
                {pushStatusLastCheckedAtISO ? (
                  <div className="text-slate-400">
                    consultado em {new Date(pushStatusLastCheckedAtISO).toLocaleString('pt-BR')}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {needsPushCheck ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">
              <b>⚠️ CHECK ativo:</b> há {opMetrics.pushUnknown} paciente(s) com diagnóstico de push ainda não confirmado.
              <div className="mt-1">
                Para proteger a constância (e evitar “achar que enviou”), gere o <b>Preview do Disparo</b> antes de enviar.
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-slate-100 bg-white p-3">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div className="text-xs font-bold text-slate-700">Último envio (nesta sessão do navegador)</div>
              {lastDispatch?.atISO ? (
                <div className="text-[11px] text-slate-400">{new Date(lastDispatch.atISO).toLocaleString('pt-BR')}</div>
              ) : null}
            </div>

            {lastDispatch ? (
              <div className="mt-2 text-[11px] text-slate-600">
                <b>Enviados:</b> {lastDispatch.sentCount} • <b>Falhas:</b> {lastDispatch.failCount} • <b>Já enviados:</b>{' '}
                {lastDispatch.skippedAlreadySent} • <b>Sem push:</b> {lastDispatch.skippedNoToken}
              </div>
            ) : (
              <div className="mt-2 text-[11px] text-slate-400">Nenhum disparo registrado ainda hoje.</div>
            )}
          </div>

          <div className="text-[11px] text-slate-500">
            💜 Clinicamente, a regularidade sustenta o vínculo terapêutico: faltar interrompe um processo que precisa de continuidade.
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-slate-800">Registro do dia (auditoria)</div>
                <div className="text-[11px] text-slate-500">
                  {dailyLogLoading ? (
                    'Carregando…'
                  ) : dailyLog?.updatedAtMs ? (
                    <>
                      Salvo em <b>{new Date(dailyLog.updatedAtMs).toLocaleString('pt-BR')}</b>
                      {dailyLog?.completedAtMs ? (
                        <>
                          {' '}
                          • Concluído em <b>{new Date(dailyLog.completedAtMs).toLocaleString('pt-BR')}</b>
                        </>
                      ) : null}
                    </>
                  ) : (
                    'Ainda não salvo hoje.'
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => handleSaveDailyLog({ complete: false })}
                  variant="secondary"
                  icon={Save}
                  className="!py-1.5 !px-3 text-xs"
                  disabled={dailyLogSaving}
                >
                  Salvar registro
                </Button>
                <Button
                  onClick={() => handleSaveDailyLog({ complete: true })}
                  variant="primary"
                  icon={CalendarCheck}
                  className="!py-1.5 !px-3 text-xs"
                  disabled={dailyLogSaving || !!dailyLog?.completedAtMs || !canCompleteDay}
                  title={!canCompleteDay ? 'Para concluir: resolva CHECK e finalize o envio (se houver disparos).' : ''}
                >
                  Marcar dia concluído
                </Button>
                <Button
                  onClick={() => setShowDailySummaryPreview((v) => !v)}
                  variant="secondary"
                  icon={FileSpreadsheet}
                  className="!py-1.5 !px-3 text-xs"
                >
                  {showDailySummaryPreview ? 'Ocultar resumo' : 'Ver resumo'}
                </Button>
              </div>
            </div>

            {!canCompleteDay && !dailyLog?.completedAtMs ? (
              <div className="mt-2 text-[11px] text-amber-800">
                <b>Proteção:</b> para marcar como concluído, o sistema exige <b>CHECK = 0</b> e, se houver disparos, que o envio tenha sido registrado nesta sessão.
              </div>
            ) : null}

            <div className="mt-3">
              <div className="text-[11px] font-semibold text-slate-700 mb-1">Observações do dia (opcional)</div>
              <textarea
                className="w-full min-h-[72px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-slate-200"
                placeholder="Ex.: feriado, instabilidade de push, pacientes sem telefone, ajustes feitos na planilha…"
                value={dailyNotes}
                onChange={(e) => setDailyNotes(e.target.value)}
              />
            </div>

            {showDailySummaryPreview ? (
              <div className="mt-3">
                <div className="text-[11px] font-semibold text-slate-700 mb-1">Resumo que será salvo</div>
                <pre className="text-[11px] whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-3 text-slate-700 max-h-[220px] overflow-auto">
                  {buildDailySummaryText()}
                </pre>
              </div>
            ) : null}

            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-semibold text-slate-700">Histórico (últimos 14 dias)</div>
                  <div className="text-[11px] text-slate-500">Trilha de evidência do modo manual — para diagnosticar falhas e sustentar constância.</div>
                </div>
                <Button
                  onClick={() => refreshAuditList({ limit: 14 })}
                  variant="secondary"
                  className="!py-1.5 !px-3 text-xs"
                  disabled={auditListLoading}
                >
                  {auditListLoading ? "Atualizando…" : "Atualizar"}
                </Button>
              </div>

              {auditListLoading ? (
                <div className="mt-3 text-[11px] text-slate-400">Carregando histórico…</div>
              ) : auditList?.length ? (
                <div className="mt-3 overflow-auto">
                  <table className="w-full text-[11px] text-slate-700">
                    <thead>
                      <tr className="text-slate-500">
                        <th className="text-left font-semibold py-2 pr-3">Dia</th>
                        <th className="text-left font-semibold py-2 pr-3">Status</th>
                        <th className="text-right font-semibold py-2 pr-3">Disparos</th>
                        <th className="text-right font-semibold py-2 pr-3">Prontos</th>
                        <th className="text-right font-semibold py-2 pr-3">Bloqueios</th>
                        <th className="text-right font-semibold py-2 pr-3">CHECK</th>
                        <th className="text-right font-semibold py-2">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditList.map((row) => (
                        <tr key={row.dateISO} className="border-t border-slate-100">
                          <td className="py-2 pr-3 whitespace-nowrap">{formatISOToBR(row.dateISO)}</td>
                          <td className="py-2 pr-3">
                            {row.completedAtMs ? (
                              <Badge status="match" text="Concluído" />
                            ) : row.updatedAtMs ? (
                              <Badge status="pending" text="Salvo" />
                            ) : (
                              <Badge status="pending" text="—" />
                            )}
                          </td>
                          <td className="py-2 pr-3 text-right">{row.selectionCount ?? 0}</td>
                          <td className="py-2 pr-3 text-right">{row.ready ?? 0}</td>
                          <td className="py-2 pr-3 text-right">{row.blocked ?? 0}</td>
                          <td className="py-2 pr-3 text-right">{row.check ?? 0}</td>
                          <td className="py-2 text-right">
                            <Button
                              onClick={() => handleViewAuditDay(row.dateISO)}
                              variant="secondary"
                              icon={FileSpreadsheet}
                              className="!py-1 !px-2 text-[11px]"
                            >
                              Ver
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-3 text-[11px] text-slate-400">Sem registros anteriores ainda.</div>
              )}
            </div>
          </div>
        </div>
      </Card>
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
              disabled={isSending || pushStatusLoading}
              className="w-full shadow-none ring-0 focus:ring-0 focus:ring-offset-0"
              icon={isSending ? Loader2 : Bell}
            >
              {isSending || pushStatusLoading
                ? 'Processando...'
                : sendMode === 'ready'
                ? 'Disparar Lembretes'
                : 'Gerar Preview do Disparo'}
            </Button>
          ) : (
            <p className="text-center text-xs text-slate-400">Nenhum disparo disponível para a seleção.</p>
          )}
        </div>

        {needsPushCheck && sendMode !== 'ready' ? (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">
            <b>CHECK:</b> o status de push ainda não está confirmado para parte da seleção.
            <div className="mt-1">Gere o Preview para destravar o diagnóstico (sem push / inativo) antes de enviar.</div>
          </div>
        ) : null}

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
                    text={(hasTokenByPhone[normalizePhoneCanonical(app.cleanPhone || app.phoneCanonical || app.phone)] ? 'Autorizado' : 'Sem Token')}
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
