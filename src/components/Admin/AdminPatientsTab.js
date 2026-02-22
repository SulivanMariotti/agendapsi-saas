import React, { useEffect, useMemo, useRef, useState, useDeferredValue } from 'react';
import { Search, Download, UserPlus, UserMinus, X, Flag, Bell, BellOff, CheckCircle, XCircle, FileText, KeyRound, Copy, Loader2, Pencil, Lock, Unlock } from 'lucide-react';
import { Button, Card } from '../DesignSystem';
import { adminFetch } from '../../services/adminApi';

/**
 * AdminPatientsTab
 * - Lista pacientes via rota server-side (Admin SDK): POST /api/admin/patients/list
 * - Edita / cria via POST /api/admin/patient/register
 * - Desativa via POST /api/admin/patient/delete (soft delete)
 *
 * FIX URGENTE (desativação):
 * - Agora SEMPRE envia uid (docId real em users/{uid}) + patientExternalId quando existir,
 *   para o endpoint não criar um doc "p_base64(email)" e sim atualizar o doc correto.
 */

export default function AdminPatientsTab({ showToast, globalConfig }) {
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const currentContractVersion = Number(globalConfig?.contractVersion || 1);

  // --- Table viewport (UX): keep list compact (default ~8 rows visible) ---
  // We keep data loading limits (500/1000/2000) for speed, but constrain the table height
  // so the page doesn't become enormous when many patients are loaded.
  const TABLE_VIEW_ROWS_DEFAULT = 8;
  const TABLE_ROW_PX = 44;
  const TABLE_HEADER_PX = 44;
  const tableMaxHeightPx = TABLE_HEADER_PX + TABLE_ROW_PX * TABLE_VIEW_ROWS_DEFAULT;

  // --- Quick filters ---
  const [filters, setFilters] = useState({
    noPush: false,
    noContract: false,
    noCode: false,
  });

  // Mostrar pacientes desativados (soft-delete) para permitir reativação sem recadastro
  const [includeInactive, setIncludeInactive] = useState(false);


// Quando filtros mudam, refazemos a listagem via servidor (mantém resultado "completo" e rápido)
  const filtersInitRef = useRef(false);
  useEffect(() => {
    if (!filtersInitRef.current) {
      filtersInitRef.current = true;
      return;
    }
    reloadPatients(patientsTarget);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.noPush, filters.noContract, filters.noCode]);

  // Quando alterna "Mostrar desativados", refazemos a listagem via servidor
  const includeInactiveInitRef = useRef(false);
  useEffect(() => {
    if (!includeInactiveInitRef.current) {
      includeInactiveInitRef.current = true;
      return;
    }
    reloadPatients(patientsTarget);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeInactive]);



  // --- Smart search (server-side exact lookup) ---
  // Para evitar carregar 500/1000/2000 só para achar 1 paciente, fazemos lookup exato no servidor
  // quando o admin digita: telefone (DDD+número), e-mail ou ID externo (com dígito/_/-).
  const [activeSearch, setActiveSearch] = useState(null);
  const activeSearchRef = useRef(null);

  const smartSearch = useMemo(() => {
    const raw = String(deferredSearchTerm || '').trim();
    if (!raw) return null;

    const lower = raw.toLowerCase();
    const looksEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower);
    if (looksEmail) return { mode: 'email', term: lower };

    const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
    if (digits.length >= 10) return { mode: 'phone', term: digits };

    const looksExternalId =
      !/\s/.test(raw) &&
      raw.length >= 4 &&
      raw.length <= 64 &&
      /^[A-Za-z0-9_-]+$/.test(raw) &&
      (/\d/.test(raw) || raw.includes('_') || raw.includes('-'));

    if (looksExternalId) return { mode: 'externalId', term: raw };

    return null;
  }, [deferredSearchTerm]);

  // Se o termo virar uma "busca inteligente", recarrega via servidor (lookup exato).
  // Para busca por nome (substring), mantemos filtro client-side.
  useEffect(() => {
    const next = smartSearch || null;
    const prev = activeSearchRef.current || null;

    const nextKey = next ? `${next.mode}:${next.term}` : '';
    const prevKey = prev ? `${prev.mode}:${prev.term}` : '';

    if (nextKey === prevKey) return;

    activeSearchRef.current = next;
    setActiveSearch(next);

    reloadPatients(patientsTarget, { search: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smartSearch?.mode, smartSearch?.term]);


  // --- List loading / perf (cursor pagination) ---
  const PAGE_SIZE = 200; // tamanho por página (renderiza rápido)
  const [patientsTarget, setPatientsTarget] = useState(500); // meta: 500/1000/2000
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadSeqRef = useRef(0);

  // --- UI helpers (flags) ---
  const IndicatorPill = ({ kind, ok, label, title }) => {
    const base =
      'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border w-fit whitespace-nowrap';

    const palette = (() => {
      if (kind === 'status') {
        return ok
          ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
          : 'bg-red-50 text-red-700 border-red-100';
      }

      if (kind === 'contract') {
        return ok
          ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
          : 'bg-amber-50 text-amber-700 border-amber-100';
      }


      if (kind === 'access') {
        return ok
          ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
          : 'bg-amber-50 text-amber-800 border-amber-100';
      }

      // kind === 'push'
      return ok
        ? 'bg-violet-50 text-violet-700 border-violet-100'
        : 'bg-amber-50 text-amber-700 border-amber-100';
    })();

    const Icon = (() => {
      if (kind === 'status') return ok ? CheckCircle : XCircle;
      if (kind === 'contract') return FileText;
      if (kind === 'access') return ok ? Unlock : Lock;
      return ok ? Bell : BellOff; // push
    })();

    return (
      <span className={`${base} ${palette}`} title={title || ''}>
        <Flag size={12} />
        <Icon size={12} />
        <span>{label}</span>
      </span>
    );
  };

  const PairCodePill = ({ status, last4, createdAt, usedAt }) => {
    const s = String(status || '').toLowerCase();

    const base =
      'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border w-fit whitespace-nowrap';

    const palette = (() => {
      if (!s) return 'bg-slate-50 text-slate-700 border-slate-100';
      if (s === 'active') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      if (s === 'used') return 'bg-amber-50 text-amber-800 border-amber-100';
      if (s === 'revoked') return 'bg-red-50 text-red-700 border-red-100';
      return 'bg-slate-50 text-slate-700 border-slate-100';
    })();

    const mask = last4 ? `••••${last4}` : '—';

    const label = (() => {
      if (!s) return 'Sem código';
      if (s === 'active') return `Código ativo ${mask}`;
      if (s === 'used') return `Código usado ${mask}`;
      if (s === 'revoked') return `Código revogado ${mask}`;
      return `Código ${s} ${mask}`;
    })();

    const titleParts = [];
    if (s) titleParts.push(`Status: ${s}`);
    if (createdAt) titleParts.push(`Criado: ${createdAt}`);
    if (usedAt) titleParts.push(`Usado: ${usedAt}`);
    titleParts.push('Se o paciente trocar de aparelho ou perder o acesso, gere um novo código.');

    return (
      <span className={`${base} ${palette}`} title={titleParts.join(' • ')}>
        <Flag size={12} />
        <KeyRound size={12} />
        <span>{label}</span>
      </span>
    );
  };

  // Lista de pacientes carregada do servidor (Admin SDK)
  const [patients, setPatients] = useState([]);
  const [isLoadingPatients, setIsLoadingPatients] = useState(false);

  // Estado para cadastro/edição
  const [newPatient, setNewPatient] = useState({ name: '', email: '', phone: '', patientExternalId: '', accessDisabled: false });
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingPatient, setEditingPatient] = useState(null);

  // Código de Vinculação (pareamento do aparelho)
  const [showPairCodeModal, setShowPairCodeModal] = useState(false);
  const [pairCodeValue, setPairCodeValue] = useState('');
  const [pairCodePatient, setPairCodePatient] = useState(null);
  const [pairCodeLoadingUid, setPairCodeLoadingUid] = useState(null);

  const closePatientModal = () => {
    setShowUserModal(false);
    setEditingPatient(null);
    setNewPatient({ name: '', email: '', phone: '', patientExternalId: '', accessDisabled: false });
  };

  const closePairCodeModal = () => {
    setShowPairCodeModal(false);
    setPairCodeValue('');
    setPairCodePatient(null);
  };

  const copyPairCode = async () => {
    try {
      if (!pairCodeValue) return;
      await navigator.clipboard.writeText(pairCodeValue);
      showToast?.('Código copiado.', 'success');
    } catch (e) {
      console.error(e);
      showToast?.('Não foi possível copiar automaticamente. Selecione e copie manualmente.', 'error');
    }
  };

  const handleGeneratePairCode = async (u) => {
    const uid = u?.uid || u?.id;
    if (!uid) {
      showToast?.('Paciente sem uid. Atualize a lista.', 'error');
      return;
    }

    setPairCodeLoadingUid(uid);
    try {
      const res = await adminFetch('/api/admin/patient/pair-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uid }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok || !data?.pairCode) {
        throw new Error(data?.error || 'Falha ao gerar código.');
      }

      setPairCodePatient(u);
      setPairCodeValue(String(data.pairCode));
      setShowPairCodeModal(true);

      showToast?.('Código gerado. Copie e envie ao paciente.', 'success');
    } catch (e) {
      console.error(e);
      showToast?.(e?.message || 'Falha ao gerar código.', 'error');
    } finally {
      setPairCodeLoadingUid(null);
    }
  };

  const makePatientKey = (p) => {
    const uid = String(p?.uid || p?.id || '').trim();
    if (uid) return `uid:${uid}`;
    const ext = String(p?.patientExternalId || '').trim();
    if (ext) return `ext:${ext}`;
    const email = String(p?.email || '').trim().toLowerCase();
    const phone = String(p?.phoneCanonical || p?.phone || '').trim();
    return `ep:${email}|${phone}`;
  };

  const mergeUniquePatients = (prev, next) => {
    const map = new Map();
    for (const p of [...prev, ...next]) {
      const key = makePatientKey(p);
      if (!map.has(key)) {
        map.set(key, p);
        continue;
      }
      // Prefer the most recently updated record
      const prevP = map.get(key);
      const prevT = Date.parse(prevP?.updatedAt || prevP?.createdAt || '') || 0;
      const curT = Date.parse(p?.updatedAt || p?.createdAt || '') || 0;
      if (curT >= prevT) map.set(key, p);
    }
    return Array.from(map.values());
  };

  const fetchPatientsPage = async ({ cursor = null, pageSize = PAGE_SIZE, append = false, silent = false, search = activeSearchRef.current } = {}) => {
    const seq = ++loadSeqRef.current;

    if (!silent && !append) setIsLoadingPatients(true);
    if (append) setIsLoadingMore(true);

    try {
      const res = await adminFetch('/api/admin/patients/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageSize,
          cursor,
          includePush: true, // necessário para filtro "Sem Push"
          includeInactive,
          search: search || null,
          filters: { ...filters, contractVersion: currentContractVersion }
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'Falha ao carregar pacientes.');
      }

      // Ignore out-of-order responses
      if (seq !== loadSeqRef.current) return null;

      const pagePatients = Array.isArray(data.patients) ? data.patients : [];
      setPatients((prev) => (append ? mergeUniquePatients(prev, pagePatients) : pagePatients));
      setNextCursor(data?.nextCursor || null);
      setHasMore(Boolean(data?.hasMore));

      return { patients: pagePatients, nextCursor: data?.nextCursor || null, hasMore: Boolean(data?.hasMore) };
    } catch (e) {
      console.error('fetchPatientsPage failed', e);
      showToast?.(e?.message || 'Falha ao carregar pacientes.', 'error');
      return null;
    } finally {
      if (!silent && !append && seq === loadSeqRef.current) setIsLoadingPatients(false);
      if (append && seq === loadSeqRef.current) setIsLoadingMore(false);
    }
  };

  const reloadPatients = async (target = patientsTarget, opts = {}) => {
    const t = Math.max(1, Math.min(2000, Number(target) || 500));
    setPatientsTarget(t);
    setPatients([]);
    setNextCursor(null);
    setHasMore(false);

    const nextSearch = Object.prototype.hasOwnProperty.call(opts, 'search')
      ? (opts.search || null)
      : (activeSearchRef.current || null);

    activeSearchRef.current = nextSearch;
    setActiveSearch(nextSearch);

    // Primeira página (renderiza rápido)
    await fetchPatientsPage({ cursor: null, pageSize: Math.min(PAGE_SIZE, t), append: false, silent: false, search: nextSearch });
  };

  const loadMorePatients = async ({ silent = false } = {}) => {
    if (!nextCursor || !hasMore) return;

    const remaining = Math.max(1, patientsTarget - patients.length);
    const pageSize = Math.min(PAGE_SIZE, remaining);

    await fetchPatientsPage({ cursor: nextCursor, pageSize, append: true, silent, search: activeSearchRef.current });
  };

  const setTargetAndReload = async (newTarget) => {
    await reloadPatients(Number(newTarget));
  };

  const toggleFilter = (key) => {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    reloadPatients(patientsTarget);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-fill: quando o admin seleciona 500/1000/2000, vamos buscando páginas silenciosamente até atingir a meta
  useEffect(() => {
    if (isLoadingPatients || isLoadingMore) return;
    if (!nextCursor || !hasMore) return;
    if (patients.length >= patientsTarget) return;

    const t = setTimeout(() => {
      loadMorePatients({ silent: true });
    }, 60);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patients.length, patientsTarget, nextCursor, hasMore, isLoadingPatients, isLoadingMore]);


  const openNewPatientModal = () => {
    setEditingPatient(null);
    setNewPatient({ name: '', email: '', phone: '', patientExternalId: '', accessDisabled: false });
    setShowUserModal(true);
  };

  const openEditPatientModal = async (u) => {
    const prevEmail = String(u?.email || '').trim();
    const prevPhone = String(u?.phoneCanonical || u?.phone || '').trim();

    const accessSuspended = Boolean(
      u?._accessSuspended ||
      u?.accessDisabled === true ||
      u?.securityHold === true ||
      (u?.access && u?.access?.disabled === true) ||
      ["disabled", "blocked", "suspended", "hold"].includes(String(u?.accessStatus || '').toLowerCase().trim())
    );

    setEditingPatient({
      ...u,
      previousEmail: prevEmail,
      previousPhoneCanonical: prevPhone,
    });

    setNewPatient({
      name: String(u?.name || u?.nome || '').trim(),
      email: prevEmail,
      phone: prevPhone,
      patientExternalId: String(u?.patientExternalId || '').trim(),
      accessDisabled: accessSuspended,
    });

    setShowUserModal(true);
  };
  const handleRegisterPatient = async () => {
    if (!newPatient.email || !newPatient.name || !newPatient.phone) {
      return showToast?.('Preencha todos os campos.', 'error');
    }

    try {
      const payload = {
        name: newPatient.name.trim(),
        email: newPatient.email.trim().toLowerCase(),
        phone: String(newPatient.phone || '').trim(),
        patientExternalId: String(newPatient.patientExternalId || '').trim(),
        ...(editingPatient?.previousPhoneCanonical ? { previousPhoneCanonical: editingPatient.previousPhoneCanonical } : {}),
        ...(editingPatient?.previousEmail ? { previousEmail: editingPatient.previousEmail } : {}),
      };

      const res = await adminFetch('/api/admin/patient/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        return showToast?.(data?.error || 'Erro ao salvar paciente.', 'error');
      }

      showToast?.(editingPatient ? 'Paciente atualizado com sucesso!' : 'Paciente cadastrado com sucesso!');

      // Acesso do painel do paciente (segurança/privacidade) — NÃO tem relação com faltas.
      // Só aplicamos em modo edição.
      try {
        if (editingPatient) {
          const prevAccessSuspended = Boolean(
            editingPatient?._accessSuspended ||
            editingPatient?.accessDisabled === true ||
            editingPatient?.securityHold === true ||
            (editingPatient?.access && editingPatient?.access?.disabled === true) ||
            ["disabled", "blocked", "suspended", "hold"].includes(String(editingPatient?.accessStatus || '').toLowerCase().trim())
          );
          const nextAccessSuspended = Boolean(newPatient?.accessDisabled);

          if (prevAccessSuspended !== nextAccessSuspended) {
            const targetUid = String(data?.uid || editingPatient?.uid || editingPatient?.id || '').trim();
            if (targetUid) {
              const r2 = await adminFetch('/api/admin/patient/access', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  uid: targetUid,
                  accessDisabled: nextAccessSuspended,
                  reason: 'admin_ui_access_toggle',
                }),
              });
              const d2 = await r2.json().catch(() => ({}));
              if (!r2.ok || !d2?.ok) {
                showToast?.(d2?.error || 'Não foi possível atualizar o acesso do paciente.', 'error');
              } else {
                showToast?.(nextAccessSuspended ? 'Acesso do paciente suspenso (segurança).' : 'Acesso do paciente reativado.', 'success');
              }
            }
          }
        }
      } catch (e2) {
        console.error(e2);
        showToast?.('Não foi possível atualizar o acesso do paciente.', 'error');
      }

      await reloadPatients(patientsTarget);
      closePatientModal();
    } catch (e) {
      console.error(e);
      showToast?.('Erro ao salvar paciente.', 'error');
    }
  };

  const handleRemovePatient = async (u) => {
    try {
      // IMPORTANT: enviar UID real do doc, para atualizar o registro correto no Firestore
      const uid = String(u?.uid || u?.id || '').trim(); // backend usa docId real
      const patientExternalId = String(u?.patientExternalId || '').trim() || null;
      const phoneCanonical = String(u?.phoneCanonical || u?.phone || '').trim();
      const email = String(u?.email || '').trim().toLowerCase();

      if (!uid && !phoneCanonical && !email && !patientExternalId) {
        return showToast?.('Paciente inválido (sem uid/email/telefone/id externo).', 'error');
      }

      const res = await adminFetch('/api/admin/patient/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uid: uid || undefined,
          patientExternalId: patientExternalId || undefined,
          phoneCanonical: phoneCanonical || undefined,
          email: email || undefined,
          reason: 'admin_ui_remove',
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        showToast?.(data?.error || 'Erro ao remover paciente.', 'error');
        return;
      }

      showToast?.('Paciente desativado.');
      await reloadPatients(patientsTarget);
    } catch (e) {
      console.error(e);
      showToast?.('Erro ao remover paciente.', 'error');
    }
  };

  const handleReactivatePatient = async (u) => {
    try {
      const uid = String(u?.uid || u?.id || '').trim();
      const patientExternalId = String(u?.patientExternalId || '').trim() || null;
      const phoneCanonical = String(u?.phoneCanonical || u?.phone || '').trim();
      const email = String(u?.email || '').trim().toLowerCase();

      if (!uid && !phoneCanonical && !email && !patientExternalId) {
        return showToast?.('Paciente inválido (sem uid/email/telefone/id externo).', 'error');
      }

      const res = await adminFetch('/api/admin/patient/reactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: uid || undefined,
          patientExternalId: patientExternalId || undefined,
          phoneCanonical: phoneCanonical || undefined,
          email: email || undefined,
          reason: 'admin_ui_reactivate',
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        showToast?.(data?.error || 'Erro ao reativar paciente.', 'error');
        return;
      }

      showToast?.('Paciente reativado.', 'success');
      await reloadPatients(patientsTarget);
    } catch (e) {
      console.error(e);
      showToast?.('Erro ao reativar paciente.', 'error');
    }
  };

  const filteredPatients = useMemo(() => {
    const term = String(deferredSearchTerm || '').trim().toLowerCase();

    return patients.filter((p) => {
      // Quick filters
      if (filters.noContract) {
        const accepted = Number(p?.contractAcceptedVersion || 0) >= currentContractVersion;
        if (accepted) return false;
      }

      if (filters.noCode) {
        const hasCode = Boolean(String(p?.pairCodeStatus || '').trim());
        if (hasCode) return false;
      }

      if (filters.noPush) {
        if (Boolean(p?.hasPushToken)) return false;
      }

      // Search
      if (!term) return true;

      const name = String(p?.name || '').toLowerCase();
      const email = String(p?.email || '').toLowerCase();
      const phone = String(p?.phoneCanonical || p?.phone || '').toLowerCase();
      const ext = String(p?.patientExternalId || '').toLowerCase();
      return name.includes(term) || email.includes(term) || phone.includes(term) || ext.includes(term);
    });
  }, [patients, deferredSearchTerm, filters, currentContractVersion]);

  const filterStats = useMemo(() => {
    let noContract = 0;
    let noCode = 0;
    let noPush = 0;

    for (const p of patients) {
      const accepted = Number(p?.contractAcceptedVersion || 0) >= currentContractVersion;
      if (!accepted) noContract += 1;

      const hasCode = Boolean(String(p?.pairCodeStatus || '').trim());
      if (!hasCode) noCode += 1;

      if (!Boolean(p?.hasPushToken)) noPush += 1;
    }

    return {
      noContract,
      noCode,
      noPush,
    };
  }, [patients, currentContractVersion]);




  const exportCSV = () => {
    try {
      const headers = ['Nome', 'Email', 'Telefone', 'ID (externo)', 'Push', 'Cadastro', 'Contrato', 'Código'];
      const rows = filteredPatients.map((p) => [
        String(p?.name || ''),
        String(p?.email || ''),
        String(p?.phoneCanonical || p?.phone || ''),
        String(p?.patientExternalId || ''),
        p?.hasPushToken ? 'SIM' : 'NAO',
        String(p?.status || ''),
        Number(p?.contractAcceptedVersion || 0) >= Number(globalConfig?.contractVersion || 1) ? 'ACEITO' : 'PENDENTE',
        String(p?.pairCodeStatus || ''),
      ]);

      const csv = [headers, ...rows]
        .map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(','))
        .join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pacientes_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      showToast?.('Falha ao exportar CSV.', 'error');
    }
  };

  const isEditMode = Boolean(editingPatient);

  return (
    <div>
      <Card className="p-4 mb-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Search size={18} />
            <input
              className="border rounded px-3 py-2 w-full md:w-[360px]"
              placeholder="Buscar por nome, email, telefone ou ID"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={exportCSV} variant="secondary">
              <Download size={16} className="mr-2" />
              Exportar
            </Button>
            <Button onClick={openNewPatientModal}>
              <UserPlus size={16} className="mr-2" />
              Novo paciente
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500 mr-1">Filtros:</span>

            <button
              type="button"
              onClick={() => toggleFilter('noPush')}
              className={`px-3 py-1 rounded-full text-xs border transition ${
                filters.noPush ? 'bg-violet-600 text-white border-violet-600' : 'bg-white hover:bg-slate-50 border-slate-200'
              }`}
              title="Mostra somente pacientes sem Push ativo (notificações)."
            >
              Sem Push ({filterStats.noPush})
            </button>

            <button
              type="button"
              onClick={() => toggleFilter('noContract')}
              className={`px-3 py-1 rounded-full text-xs border transition ${
                filters.noContract ? 'bg-violet-600 text-white border-violet-600' : 'bg-white hover:bg-slate-50 border-slate-200'
              }`}
              title="Mostra pacientes que ainda não aceitaram a versão atual do contrato."
            >
              Sem Contrato Aceito ({filterStats.noContract})
            </button>

            <button
              type="button"
              onClick={() => toggleFilter('noCode')}
              className={`px-3 py-1 rounded-full text-xs border transition ${
                filters.noCode ? 'bg-violet-600 text-white border-violet-600' : 'bg-white hover:bg-slate-50 border-slate-200'
              }`}
              title="Mostra pacientes sem código de vinculação (útil para gerar acesso)."
            >
              Sem Código ({filterStats.noCode})
            </button>

            <button
              type="button"
              onClick={() => setIncludeInactive((v) => !v)}
              className={`px-3 py-1 rounded-full text-xs border transition ${
                includeInactive ? 'bg-slate-900 text-white border-slate-900' : 'bg-white hover:bg-slate-50 border-slate-200'
              }`}
              title="Inclui pacientes desativados (soft-delete) para reativar sem recadastro."
            >
              Mostrar desativados
            </button>

            {(filters.noPush || filters.noContract || filters.noCode || String(searchTerm || '').trim()) ? (
              <button
                type="button"
                onClick={() => {
                  setFilters({ noPush: false, noContract: false, noCode: false });
                  setSearchTerm('');
                }}
                className="px-3 py-1 rounded-full text-xs border bg-white hover:bg-slate-50 border-slate-200"
                title="Limpa filtros e busca."
              >
                Limpar
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-end">
            <span className="text-xs text-slate-500 mr-1">Carregar:</span>

            <button
              type="button"
              onClick={() => setTargetAndReload(500)}
              className={`px-2.5 py-1 rounded-full text-xs border ${
                patientsTarget === 500 ? 'bg-slate-900 text-white border-slate-900' : 'bg-white hover:bg-slate-50 border-slate-200'
              }`}
              title="Carrega até 500 pacientes (mais rápido)."
            >
              500
            </button>

            <button
              type="button"
              onClick={() => setTargetAndReload(1000)}
              className={`px-2.5 py-1 rounded-full text-xs border ${
                patientsTarget === 1000 ? 'bg-slate-900 text-white border-slate-900' : 'bg-white hover:bg-slate-50 border-slate-200'
              }`}
              title="Carrega até 1000 pacientes."
            >
              1000
            </button>

            <button
              type="button"
              onClick={() => setTargetAndReload(2000)}
              className={`px-2.5 py-1 rounded-full text-xs border ${
                patientsTarget === 2000 ? 'bg-slate-900 text-white border-slate-900' : 'bg-white hover:bg-slate-50 border-slate-200'
              }`}
              title="Carrega até 2000 pacientes (pode ser mais lento)."
            >
              2000
            </button>

            <Button
              variant="secondary"
              onClick={() => reloadPatients(patientsTarget)}
              className="px-3 py-1.5 rounded-lg text-xs"
              title="Recarregar lista"
            >
              Atualizar
            </Button>

            {hasMore && nextCursor ? (
              <Button
                variant="secondary"
                onClick={() => loadMorePatients({ silent: false })}
                className="px-3 py-1.5 rounded-lg text-xs"
                disabled={isLoadingMore}
                title="Carrega a próxima página (útil se você quiser ir além da meta)."
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 size={14} className="mr-1.5 animate-spin" />
                    Carregando
                  </>
                ) : (
                  'Carregar mais'
                )}
              </Button>
            ) : null}

          </div>
        </div>

        <div className="mt-2 text-sm opacity-80">
          {isLoadingPatients
            ? 'Carregando pacientes…'
            : `Exibidos: ${filteredPatients.length} • Carregados: ${patients.length} • Meta: ${patientsTarget}${isLoadingMore ? ' • carregando mais…' : ''}`}
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-auto" style={{ maxHeight: `${tableMaxHeightPx}px` }}>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left border-b bg-slate-50/60">
                <th className="px-3 py-2 sticky top-0 z-10 bg-slate-50/90 backdrop-blur">Paciente</th>
                <th className="px-3 py-2 sticky top-0 z-10 bg-slate-50/90 backdrop-blur">Email</th>
                <th className="px-3 py-2 sticky top-0 z-10 bg-slate-50/90 backdrop-blur">Telefone</th>
                <th className="px-3 py-2 sticky top-0 z-10 bg-slate-50/90 backdrop-blur">Push</th>
                <th className="px-3 py-2 sticky top-0 z-10 bg-slate-50/90 backdrop-blur">Cadastro</th>
                <th className="px-3 py-2 sticky top-0 z-10 bg-slate-50/90 backdrop-blur">Contrato</th>
                <th className="px-3 py-2 sticky top-0 z-10 bg-slate-50/90 backdrop-blur">Código</th>
                <th className="px-3 py-2 sticky top-0 z-10 bg-slate-50/90 backdrop-blur text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredPatients.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 opacity-70" colSpan={8}>
                    Nenhum paciente encontrado.
                  </td>
                </tr>
              ) : (
                filteredPatients.map((u) => (
                  <tr key={u.uid || u.id} className="border-b last:border-b-0 hover:bg-slate-50/40">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800 leading-tight">{u?.name || '—'}</div>
                      {u?.patientExternalId ? (
                        <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">ID: {u?.patientExternalId}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{u?.email || '—'}</td>
                    <td className="px-3 py-2">{u?.phoneCanonical || u?.phone || '—'}</td>
                    <td className="px-3 py-2">
                      <IndicatorPill
                        kind="push"
                        ok={Boolean(u?.hasPushToken)}
                        label={u?.hasPushToken ? 'Notificações ativas' : 'Sem notificações'}
                        title={
                          u?.hasPushToken
                            ? 'Este paciente tem Push ativo (token válido em subscribers).' 
                            : 'Sem Push ativo. Oriente o paciente a ativar as notificações neste aparelho.'
                        }
                      />
                    </td>
                    <td className="px-3 py-2 space-y-1">
                      <IndicatorPill
                        kind="status"
                        ok={String(u?.status || '').toLowerCase() === 'active'}
                        label={String(u?.status || '').toLowerCase() === 'active' ? 'Cadastro ativo' : 'Cadastro inativo'}
                        title={
                          String(u?.status || '').toLowerCase() === 'active'
                            ? 'Cadastro ativo (pode receber agenda/disparos).'
                            : 'Cadastro inativo/desativado (não deve receber atendimentos/disparos).'
                        }
                      />

                      <IndicatorPill
                        kind="access"
                        ok={!Boolean(u?._accessSuspended || u?.accessDisabled === true || u?.securityHold === true)}
                        label={
                          Boolean(u?._accessSuspended || u?.accessDisabled === true || u?.securityHold === true)
                            ? 'Acesso suspenso'
                            : 'Acesso liberado'
                        }
                        title={
                          Boolean(u?._accessSuspended || u?.accessDisabled === true || u?.securityHold === true)
                            ? 'Acesso ao painel do paciente está suspenso (segurança/privacidade). Não é usado como punição por falta.'
                            : 'Acesso ao painel do paciente está liberado. O paciente permanece logado para sustentar constância.'
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <IndicatorPill
                        kind="contract"
                        ok={Number(u?.contractAcceptedVersion || 0) >= currentContractVersion}
                        label={
                          Number(u?.contractAcceptedVersion || 0) >= currentContractVersion
                            ? 'Contrato aceito'
                            : 'Contrato pendente'
                        }
                        title={`Aceite do contrato: v${Number(u?.contractAcceptedVersion || 0)} • Versão atual: v${currentContractVersion}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <PairCodePill
                        status={u?.pairCodeStatus}
                        last4={u?.pairCodeLast4}
                        createdAt={u?.pairCodeCreatedAt}
                        usedAt={u?.pairCodeUsedAt}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => handleGeneratePairCode(u)}
                          disabled={pairCodeLoadingUid === (u.uid || u.id)}
                          title="Gerar novo código de vinculação (troca de aparelho/recuperação de acesso)."
                          className="px-3 py-1.5 rounded-lg text-xs"
                        >
                          {pairCodeLoadingUid === (u.uid || u.id) ? (
                            <>
                              <Loader2 size={14} className="mr-1.5 animate-spin" />
                              Gerando
                            </>
                          ) : (
                            <>
                              <KeyRound size={14} className="mr-1.5" />
                              Código
                            </>
                          )}
                        </Button>

                        <Button
                          variant="secondary"
                          onClick={() => openEditPatientModal(u)}
                          className="px-3 py-1.5 rounded-lg text-xs"
                          title="Editar paciente"
                        >
                          <Pencil size={14} className="mr-1.5" />
                          Editar
                        </Button>

                        {String(u?.status || '').toLowerCase().trim() === 'active' ? (
                          <Button
                            variant="danger"
                            onClick={() => handleRemovePatient(u)}
                            className="px-3 py-1.5 rounded-lg text-xs"
                            title="Desativar paciente"
                          >
                            <UserMinus size={14} className="mr-1.5" />
                            Desativar
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            onClick={() => handleReactivatePatient(u)}
                            className="px-3 py-1.5 rounded-lg text-xs"
                            title="Reativar paciente (undo soft-delete)"
                          >
                            <Unlock size={14} className="mr-1.5" />
                            Reativar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>


      {showPairCodeModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-xl relative">
            <div className="p-5 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold">Código de Vinculação</h3>
              <button onClick={closePairCodeModal} className="p-2 rounded hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            <div className="p-5">
              <div className="bg-slate-50 border rounded-lg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">
                      {pairCodePatient?.name || 'Paciente'}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Este código é <b>single-use</b>. Depois de vincular um aparelho, para trocar de dispositivo, gere um novo.
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 text-right">
                    Entregue ao paciente<br />
                    (preferencialmente em sessão)
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="font-mono text-lg tracking-widest text-slate-900 select-all">
                    {pairCodeValue || '—'}
                  </div>
                  <Button variant="secondary" onClick={copyPairCode}>
                    <Copy size={16} className="mr-2" />
                    Copiar
                  </Button>
                </div>
              </div>

              <div className="mt-3 text-[12px] text-slate-600 leading-snug">
                <b>Mensagem sugerida:</b> “Este é seu acesso ao seu espaço de cuidado. A constância sustenta o processo — guarde este código com atenção.”
              </div>

              <div className="mt-4 flex justify-end">
                <Button onClick={closePairCodeModal} className="bg-slate-900">
                  Fechar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showUserModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl shadow-xl relative">
            <div className="p-5 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold">{isEditMode ? 'Editar paciente' : 'Novo paciente'}</h3>
              <button onClick={closePatientModal} className="p-2 rounded hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm opacity-80 mb-1">Nome</label>
                <input
                  className="border rounded px-3 py-2 w-full"
                  value={newPatient.name}
                  onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm opacity-80 mb-1">Email</label>
                <input
                  className="border rounded px-3 py-2 w-full"
                  value={newPatient.email}
                  onChange={(e) => setNewPatient({ ...newPatient, email: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm opacity-80 mb-1">Telefone (DDD+número, sem 55)</label>
                <input
                  className="border rounded px-3 py-2 w-full"
                  value={newPatient.phone}
                  onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })}
                  placeholder="11999999999"
                />
              </div>

              <div>
                <label className="block text-sm opacity-80 mb-1">ID do seu sistema (patientExternalId)</label>
                <input
                  className="border rounded px-3 py-2 w-full"
                  value={newPatient.patientExternalId}
                  onChange={(e) => setNewPatient({ ...newPatient, patientExternalId: e.target.value })}
                  disabled={isEditMode}
                />
                <div className="text-xs opacity-70 mt-1">Modo: {isEditMode ? 'EDITAR (travado)' : 'NOVO'}</div>
              </div>

              {isEditMode ? (
                <div className="bg-slate-50 border rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">Acesso do paciente</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Este controle é <b>apenas</b> para <b>segurança/privacidade</b> (ex.: aparelho perdido, pareamento indevido).
                        <br />
                        <b>Não</b> é usado para faltas. O objetivo do sistema é sustentar vínculo e constância.
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 text-right">
                      Segurança
                    </div>
                  </div>

                  <label className="mt-3 flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={Boolean(newPatient.accessDisabled)}
                      onChange={(e) => setNewPatient({ ...newPatient, accessDisabled: e.target.checked })}
                    />
                    <span className="font-medium">
                      Suspender acesso ao painel do paciente
                    </span>
                  </label>

                  <div className="text-xs text-slate-500 mt-1">
                    Se marcado, o paciente verá “acesso indisponível” até você reativar.
                  </div>
                </div>
              ) : null}
            </div>

            <div className="p-5 border-t flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={closePatientModal}>
                Cancelar
              </Button>
              <Button onClick={handleRegisterPatient}>Salvar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}