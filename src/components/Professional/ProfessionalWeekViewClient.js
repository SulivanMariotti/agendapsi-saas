"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  useRouter } from "next/navigation";
import {
  BadgeCheck,
  CalendarDays,
  Layers,
  ChevronLeft,
  ChevronRight,
  Plus,
  CheckCircle,
  XCircle,
  UserX,
  RefreshCcw,
  Lock,
  Trash2,
  X,
  KeyRound,
  Copy,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/DesignSystem";
import ReschedulePanel from "@/components/Professional/ReschedulePanel";
import SessionEvolutionPanel from "@/components/Professional/SessionEvolutionPanel";
import OccurrenceLogPanel from "@/components/Professional/OccurrenceLogPanel";
import WhatsAppIcon from "@/components/Icons/WhatsAppIcon";

function toDateFromIso(iso) {
  const d = new Date(`${iso}T12:00:00.000Z`);
  return Number.isFinite(d.getTime()) ? d : new Date();
}

function normalizePhoneBR(input) {
  const digits = String(input || "").replace(/\D+/g, "");
  if (!digits) return "";
  // If already has country code (55) keep it, otherwise assume Brazil.
  if (digits.startsWith("55")) return digits;
  // Common BR numbers are 10 or 11 digits (DDD + number).
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  // Fallback: return digits as-is (better than crashing).
  return digits;
}

function buildWhatsAppHref({ phone, text }) {
  const normalized = normalizePhoneBR(phone);
  if (!normalized) return "";
  const encoded = encodeURIComponent(String(text || ""));
  return `https://wa.me/${normalized}?text=${encoded}`;
}


function OccurrenceDetailModal({ data, detail, slotIntervalMin, patientsById, busy, onClose, onOpenDay, onSaveStatus, onConvertHold, onReschedule, onAskDelete }) {
  const isoDate = detail?.isoDate;
  const occId = detail?.occId;

const [clinicalTab, setClinicalTab] = useState("evolution"); // "evolution" | "logs"

useEffect(() => {
  if (occId) setClinicalTab("evolution");
}, [occId]);

  useEffect(() => {
    if (!occId) return;
    setIsEvoDirty(false);
    setIsLogDraftDirty(false);
  }, [occId]);

  const evolutionRef = useRef(null);
  const logsRef = useRef(null);
  const [isEvoDirty, setIsEvoDirty] = useState(false);
  const [isLogDraftDirty, setIsLogDraftDirty] = useState(false);

  const occ = useMemo(() => {
    const day = (data?.days || []).find((d) => d?.isoDate === isoDate);
    const occs = Array.isArray(day?.occurrences) ? day.occurrences : [];
    return occs.find((o) => o?.id === occId) || null;
  }, [data?.days, isoDate, occId]);

  const [status, setStatus] = useState(() => occ?.status || "Agendado");
  useEffect(() => {
    setStatus(occ?.status || "Agendado");
  }, [occ?.status]);

// Paciente (MVP): gerar código de acesso (one-time) para o portal /paciente
const [patientAccessCode, setPatientAccessCode] = useState(null); // { code, expiresAt, ttlMin }
const [patientCodeBusy, setPatientCodeBusy] = useState(false);
const [patientCodeErr, setPatientCodeErr] = useState("");

useEffect(() => {
  setPatientAccessCode(null);
  setPatientCodeErr("");
}, [occId]);

const handleGeneratePatientAccessCode = async () => {
  const pid = occ?.patientId;
  if (!pid) return;

  setPatientCodeBusy(true);
  setPatientCodeErr("");
  try {
    const res = await fetch("/api/profissional/pacientes/access-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId: pid }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok || !data?.code) {
      throw new Error(data?.error || "Falha ao gerar código.");
    }

    setPatientAccessCode({ code: data.code, expiresAt: data.expiresAt, ttlMin: data.ttlMin });

    try {
      await navigator.clipboard.writeText(String(data.code));
    } catch {
      // ignore
    }
  } catch (e) {
    setPatientCodeErr(e?.message || "Falha ao gerar código.");
  } finally {
    setPatientCodeBusy(false);
  }
};

const handleCopyPatientAccessCode = async () => {
  if (!patientAccessCode?.code) return;
  try {
    await navigator.clipboard.writeText(String(patientAccessCode.code));
  } catch {
    // ignore
  }
};


  if (!occ) {
    return (
      <ModalShell title="Detalhes" onClose={onClose}>
        <p className="text-xs text-slate-600">Não encontrei este item. Tente atualizar a página.</p>
      </ModalShell>
    );
  }

  const patient = occ?.patientId ? patientsById?.[occ.patientId] : null;
  const title = patient?.fullName || occ?.leadName || "(sem nome)";
  const startTime = String(occ?.startTime || "").slice(0, 5);
  const blocks = Number(occ?.durationBlocks) > 0 ? Number(occ.durationBlocks) : 1;
  const startMin = timeToMinutes(startTime);
  const endTime = startTime ? minutesToTime(startMin + blocks * slotIntervalMin) : "";
  const isHold = occ?.isHold === true;

  const statusOriginal = occ?.status || "Agendado";
  const isStatusDirty = !isHold && status !== statusOriginal;
  const hasAnyDirty = Boolean(isStatusDirty || isEvoDirty || isLogDraftDirty);

  async function saveAll() {
    if (!occ?.id || isHold) return;
    // Save clinical drafts first, then status.
    const evoOk = await evolutionRef.current?.saveIfDirty?.();
    if (evoOk === false) return;
    const logOk = await logsRef.current?.saveDraft?.();
    if (logOk === false) return;
    if (isStatusDirty) await onSaveStatus?.(occ.id, status);
  }

  function requestClose() {
    const hasAnyDirty = Boolean(isStatusDirty || isEvoDirty || isLogDraftDirty);
    if (hasAnyDirty) {
      const ok = window.confirm("Você tem alterações não salvas neste agendamento. Deseja descartar e fechar?");
      if (!ok) return;
    }
    onClose?.();
  }

  const displayName = patient?.fullName || occ?.leadName || "";
  const phone = patient?.mobile || occ?.leadMobile || "";

  const sessionIndex = Number.isFinite(occ?.sessionIndex) ? Number(occ.sessionIndex) : null;
  const plannedTotal = Number.isFinite(occ?.plannedTotalSessions) ? Number(occ.plannedTotalSessions) : null;
  const progressLabel = sessionIndex && plannedTotal ? `${sessionIndex}/${plannedTotal}` : null;

  const patientNotes = String(patient?.notes || "").trim();

  const whatsappHref = phone ? buildWhatsAppHref({
    phone,
    text: isHold
      ? `Olá, ${displayName || "tudo bem?"}! Segurei um horário em ${fmtDateShortPt(isoDate)} às ${startTime}.`
      : `Olá, ${displayName || "tudo bem?"}! Passando para confirmar nosso horário em ${fmtDateShortPt(isoDate)} às ${startTime}. Até lá 🙂`,
  }) : "";

  return (
    <ModalShell
      title={isHold ? "Reserva" : "Agendamento"}
      onClose={requestClose}
      footer={
        occ?.isBlock === true ? null : (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="secondary" icon={RefreshCcw} disabled={busy} onClick={() => onReschedule?.(occ)}>
                Reagendar
              </Button>
              <Button
                variant="danger"
                icon={Trash2}
                disabled={busy}
                onClick={() => onAskDelete?.(occ)}
                title="Excluir"
                aria-label="Excluir"
                className="px-3"
              >
                <span className="sr-only">Excluir</span>
              </Button>
            </div>

            {isHold ? (
              <p className="text-[11px] text-slate-500 font-semibold">Reserva</p>
            ) : (
              <div className="flex items-center gap-3">
                <p className="text-[11px] text-slate-500 font-semibold">
                  {hasAnyDirty ? "Alterações pendentes" : "Nenhuma alteração pendente"}
                </p>
                <Button variant="primary" icon={CheckCircle} disabled={busy || !hasAnyDirty} onClick={() => void saveAll()}>
                  Salvar alterações
                </Button>
              </div>
            )}
          </div>
        )
      }
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-base font-extrabold text-slate-900 truncate">{fmtDateShortPt(isoDate)} — {startTime}{endTime ? `–${endTime}` : ""}</p>
              <p className="mt-0.5 text-[11px] uppercase tracking-wider text-slate-400 font-bold">{isHold ? "Reserva" : "Agendamento"}</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1">
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-extrabold text-slate-700">
                <CalendarDays size={14} /> Atendimento: Sessão
              </span>
              {progressLabel ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-extrabold text-slate-700">
                  <Layers size={14} /> Plano: {progressLabel}
                </span>
              ) : null}
              {isHold ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-[11px] font-extrabold text-slate-700">
                  <Lock size={14} /> Reserva
                </span>
              ) : status === "Cancelado" ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-extrabold text-red-700">
                  <XCircle size={14} /> Cancelado
                </span>
              ) : (
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-extrabold ${statusPillClass(status)}`}>
                  <BadgeCheck size={14} /> {status}
                </span>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs text-slate-400 font-bold">Paciente/Lead</p>
            <p className="text-sm font-extrabold text-slate-900">{title}</p>

{occ?.patientId ? (
  <div className="mt-3 rounded-2xl border border-slate-100 bg-white p-3">
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] text-slate-400 font-bold">Código de acesso do paciente</p>

        {patientAccessCode?.code ? (
          <div className="mt-1 flex items-center gap-2">
            <span className="text-sm font-extrabold tracking-widest text-slate-900">
              {patientAccessCode.code}
            </span>

            <button
              type="button"
              onClick={handleCopyPatientAccessCode}
              className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700"
              title="Copiar"
            >
              <Copy size={16} />
            </button>

            <span className="text-[11px] text-slate-500">
              expira em {patientAccessCode.ttlMin || 15} min
            </span>
          </div>
        ) : (
          <p className="mt-1 text-xs text-slate-600">Gere um código para o paciente acessar o painel.</p>
        )}

        {patientCodeErr ? <p className="mt-1 text-xs text-rose-600">{patientCodeErr}</p> : null}
      </div>

      <button
        type="button"
        onClick={handleGeneratePatientAccessCode}
        disabled={patientCodeBusy}
        className={`shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border ${
          patientCodeBusy
            ? "bg-slate-100 text-slate-400 border-slate-200"
            : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
        }`}
      >
        {patientCodeBusy ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
        {patientAccessCode?.code ? "Gerar outro" : "Gerar"}
      </button>
    </div>
  </div>
) : null}

          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-3">
            <p className="text-xs text-slate-400 font-bold">Status</p>
            <div className="mt-2 flex items-center gap-2">
              <select
                className="h-8 w-[132px] rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={busy || isHold}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-2">
              {isHold ? (
                <p className="mt-2 text-[11px] font-semibold text-slate-500">Reserva: status travado até converter em agendamento.</p>
              ) : null}
              <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full border text-xs font-extrabold ${isHold ? "bg-slate-100 text-slate-700 border-slate-200" : statusPillClass(status)}`}>
                <BadgeCheck size={14} /> {isHold ? "Reserva" : status}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
            isHold && occ?.isBlock !== true ? (
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
  <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
    <button
      type="button"
      className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
        clinicalTab === "evolution" ? "bg-violet-600 text-white" : "text-slate-700 hover:bg-slate-50"
      }`}
      onClick={() => setClinicalTab("evolution")}
    >
      Evolução
    </button>
    <button
      type="button"
      className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
        clinicalTab === "logs" ? "bg-violet-600 text-white" : "text-slate-700 hover:bg-slate-50"
      }`}
      onClick={() => setClinicalTab("logs")}
    >
      Ocorrências (extra)
    </button>
  </div>
  <p className="text-[11px] text-slate-400 font-semibold">Registros clínicos</p>
</div>

<div className={clinicalTab === "evolution" ? "" : "hidden"}>
  <SessionEvolutionPanel ref={evolutionRef} externalSave occurrence={occ} patientId={occ?.patientId || ""} disabled={busy} onDirtyChange={setIsEvoDirty} />
</div>
<div className={clinicalTab === "logs" ? "" : "hidden"}>
  <OccurrenceLogPanel ref={logsRef} externalSave occurrence={occ} patientId={occ?.patientId || ""} disabled={busy} onDirtyChange={setIsLogDraftDirty} />
</div>
</div>

        <div className="w-full sm:w-[260px] shrink-0">
          <div className="rounded-2xl border border-slate-100 bg-white p-3">
            <p className="text-xs text-slate-400 font-bold">Resumo do paciente</p>

            <div className="mt-2">
              <p className="text-[11px] font-bold text-slate-400">Nome</p>
              <p className="text-sm font-extrabold text-slate-900">{displayName || "(sem nome)"}</p>
            </div>

            {progressLabel ? (
              <div className="mt-3">
                <p className="text-[11px] font-bold text-slate-400">Plano</p>
                <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-extrabold text-slate-700">
                  {progressLabel}
                </span>
              </div>
            ) : null}

            <div className="mt-3">
              <p className="text-[11px] font-bold text-slate-400">WhatsApp</p>
              {phone ? (
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-800 hover:bg-slate-50"
                  title="Abrir conversa no WhatsApp"
                >
                  <WhatsAppIcon size={16} /> WhatsApp
                </a>
              ) : (
                <button
                  type="button"
                  className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-extrabold text-slate-400"
                  disabled
                  title="Sem telefone cadastrado"
                >
                  <WhatsAppIcon size={16} /> Sem telefone
                </button>
              )}
            </div>

            <div className="mt-3">
              <p className="text-[11px] font-bold text-slate-400">Observações</p>
              <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">
                {patientNotes ? patientNotes : "—"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

function CreateModal({ modal, slotIntervalMin, defaultDurationBlocks = 2, onClose, onCreated, busy, setBusy, setErrorMsg }) {
  const isoDate = modal?.isoDate;
  const startTime = modal?.startTime || "00:00";
  const type = modal?.type; // "hold" | "appointment"
  const fromHoldOccurrenceId = modal?.fromHoldOccurrenceId || null;
  const intervalMin = slotIntervalMin || 30;

  const [leadName, setLeadName] = useState("");
  const [leadMobile, setLeadMobile] = useState("");

  const [fullName, setFullName] = useState("");
  const [cpf, setCpf] = useState("");
  const [mobile, setMobile] = useState("");

  const [useRecurrence, setUseRecurrence] = useState(false);
  const [sessionsOption, setSessionsOption] = useState("1");
  const [sessionsCustom, setSessionsCustom] = useState(30);
  const [repeatFrequency, setRepeatFrequency] = useState("weekly");

  const [durationBlocks, setDurationBlocks] = useState(() => {
    const mv = parseInt(modal?.durationBlocks, 10);
    if (Number.isFinite(mv) && mv > 0) return Math.max(1, Math.min(8, mv));
    const v = parseInt(defaultDurationBlocks, 10);
    if (Number.isFinite(v) && v > 0) return Math.max(1, Math.min(8, v));
    return 2;
  });

  useEffect(() => {
    if (type === "appointment") {
      setFullName(String(modal?.prefillFullName || ""));
      setMobile(String(modal?.prefillMobile || ""));
      setCpf("");
    } else {
      setLeadName("");
      setLeadMobile("");
      setFullName("");
      setCpf("");
      setMobile("");
    }

    setUseRecurrence(false);
    setSessionsOption("1");
    setSessionsCustom(30);
    setRepeatFrequency("weekly");

    const mv = parseInt(modal?.durationBlocks, 10);
    if (Number.isFinite(mv) && mv > 0) setDurationBlocks(Math.max(1, Math.min(8, mv)));
  }, [type, modal?.prefillFullName, modal?.prefillMobile, modal?.durationBlocks, modal?.startTime]);

  const plannedTotalSessions = useRecurrence
    ? sessionsOption === "more"
      ? Math.max(1, parseInt(String(sessionsCustom || "1"), 10) || 1)
      : Math.max(1, parseInt(String(sessionsOption || "1"), 10) || 1)
    : 1;

  const repeatFrequencyToSend = useRecurrence ? repeatFrequency : null;

  async function submitHold() {
    setBusy(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/professional/hold", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          isoDate,
          startTime,
          leadName,
          leadMobile,
          durationBlocks,
          plannedTotalSessions,
          repeatFrequency: repeatFrequencyToSend,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.message || "Falha ao criar reserva");
      await onCreated?.({});
    } catch (e) {
      setErrorMsg(e?.message || "Erro ao criar reserva");
    } finally {
      setBusy(false);
    }
  }

  async function submitAppointment() {
    setBusy(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/professional/appointment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          isoDate,
          startTime,
          fullName,
          cpf,
          mobile,
          durationBlocks,
          plannedTotalSessions,
          repeatFrequency: repeatFrequencyToSend,
          fromHoldOccurrenceId,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.message || "Falha ao agendar");
      await onCreated?.({ selectOccurrenceId: j?.occurrenceId });
    } catch (e) {
      setErrorMsg(e?.message || "Erro ao agendar");
    } finally {
      setBusy(false);
    }
  }

  if (!type || !isoDate) return null;

  return (
    <ModalShell
      title={`${type === "hold" ? "Criar reserva (hold)" : "Agendar (pré-cadastro rápido)"} — ${fmtDateShortPt(isoDate)} às ${startTime}`}
      onClose={onClose}
      maxWidthClass="max-w-4xl"
    >
      <div className="flex flex-col gap-3">
        {type === "hold" ? (
          <>
            <div>
              <label className="text-xs font-bold text-slate-600">Nome (lead)</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                value={leadName}
                onChange={(e) => setLeadName(e.target.value)}
                placeholder="Ex.: Maria Silva"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600">Celular/WhatsApp</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                value={leadMobile}
                onChange={(e) => setLeadMobile(e.target.value)}
                placeholder="Ex.: (11) 9xxxx-xxxx"
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="text-xs font-bold text-slate-600">Nome completo</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ex.: Maria Silva"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-600">CPF</label>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                  value={cpf}
                  onChange={(e) => setCpf(e.target.value)}
                  placeholder="Somente números"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600">Celular/WhatsApp</label>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="(11) 9xxxx-xxxx"
                />
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-extrabold text-amber-800">Pré-cadastro</p>
              <p className="text-xs text-amber-800">
                O cadastro completo do paciente é feito depois. Aqui salvamos o mínimo para garantir o horário.
              </p>
            </div>
          </>
        )}

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold text-slate-700">Recorrência (opcional)</p>
              <p className="text-[11px] text-slate-500">Defina o total de sessões e a frequência.</p>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input type="checkbox" checked={useRecurrence} onChange={(e) => setUseRecurrence(e.target.checked)} />
              Ativar
            </label>
          </div>

          {useRecurrence ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-600">Sessões</label>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                  value={sessionsOption}
                  onChange={(e) => setSessionsOption(e.target.value)}
                >
                  {Array.from({ length: 30 }).map((_, i) => {
                    const v = String(i + 1).padStart(2, "0");
                    return (
                      <option key={v} value={String(i + 1)}>
                        {v}
                      </option>
                    );
                  })}
                  <option value="more">Mais...</option>
                </select>
                {sessionsOption === "more" ? (
                  <input
                    type="number"
                    min={1}
                    max={200}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                    value={sessionsCustom}
                    onChange={(e) => setSessionsCustom(parseInt(e.target.value, 10) || 1)}
                    placeholder="Ex.: 30"
                  />
                ) : null}
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600">Frequência</label>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                  value={repeatFrequency}
                  onChange={(e) => setRepeatFrequency(e.target.value)}
                >
                  <option value="daily">Diário</option>
                  <option value="weekly">Semanal</option>
                  <option value="biweekly">Quinzenal</option>
                  <option value="monthly">Mensal</option>
                </select>
              </div>
            </div>
          ) : null}
        </div>

        <div>
          <label className="text-xs font-bold text-slate-600">Duração (blocos)</label>
          <select
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
            value={durationBlocks}
            onChange={(e) => setDurationBlocks(parseInt(e.target.value, 10) || 1)}
          >
            {Array.from({ length: 8 }).map((_, i) => {
              const b = i + 1;
              return (
                <option key={b} value={b}>
                  {b} bloco{b > 1 ? "s" : ""} ({b * intervalMin} min)
                </option>
              );
            })}
          </select>
          <p className="mt-1 text-[11px] text-slate-400">Se escolher mais de 1 bloco, o próximo horário precisa estar livre.</p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </button>

          {type === "hold" ? (
            <button
              type="button"
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-extrabold text-white hover:bg-slate-800"
              onClick={submitHold}
              disabled={busy}
            >
              Criar reserva
            </button>
          ) : (
            <button
              type="button"
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-xs font-extrabold text-white hover:bg-violet-700"
              onClick={submitAppointment}
              disabled={busy || !fullName || !cpf}
            >
              Agendar
            </button>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

function addDaysIso(iso, deltaDays) {
  const d = toDateFromIso(iso);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function fmtWeekRangePt(weekStartIso) {
  const start = toDateFromIso(weekStartIso);
  const end = toDateFromIso(addDaysIso(weekStartIso, 6));

  const fmt = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

  const fmtYear = new Intl.DateTimeFormat("pt-BR", {
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });

  return `${fmt.format(start)} – ${fmt.format(end)} / ${fmtYear.format(start)}`;
}

function fmtDayHeaderPt(iso) {
  const d = toDateFromIso(iso);
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(d);
}

function minutesToTime(m) {
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function timeToMinutes(t) {
  const [h, m] = String(t || "0:0")
    .split(":")
    .map((x) => parseInt(x, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function statusBlockClass({ status, isHold }) {
  if (isHold) return "bg-slate-100/60 border-slate-200 text-slate-800";
  switch (status) {
    case "Agendado":
      return "bg-violet-100 border-violet-300 text-violet-900";
    case "Confirmado":
      return "bg-emerald-100 border-emerald-300 text-emerald-900";
    case "Finalizado":
      return "bg-slate-100 border-slate-300 text-slate-700";
    case "Não comparece":
      return "bg-amber-100 border-amber-300 text-amber-900";
    case "Cancelado":
      return "bg-red-100 border-red-300 text-red-900";
    case "Reagendado":
      return "bg-blue-100 border-blue-300 text-blue-900";
    default:
      return "bg-slate-50 border-slate-200 text-slate-800";
  }
}

function statusPillClass(status) {
  switch (status) {
    case "Agendado":
      return "bg-violet-50 text-violet-800 border-violet-200";
    case "Confirmado":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "Finalizado":
      return "bg-slate-100 text-slate-700 border-slate-200";
    case "Não comparece":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "Cancelado":
      return "bg-red-50 text-red-800 border-red-200";
    case "Reagendado":
      return "bg-blue-50 text-blue-800 border-blue-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

function statusIconColorClass(status) {
  switch (status) {
    case "Agendado":
      return "text-violet-700";
    case "Confirmado":
      return "text-emerald-700";
    case "Finalizado":
      return "text-slate-600";
    case "Não comparece":
      return "text-amber-700";
    case "Cancelado":
      return "text-red-700";
    case "Reagendado":
      return "text-blue-700";
    default:
      return "text-slate-600";
  }
}

function StatusIcon({ status, size = 14, className = "" }) {
  const Icon =
    status === "Agendado"
      ? CalendarDays
      : status === "Confirmado"
      ? BadgeCheck
      : status === "Finalizado"
      ? CheckCircle
      : status === "Não comparece"
      ? UserX
      : status === "Cancelado"
      ? XCircle
      : status === "Reagendado"
      ? RefreshCcw
      : BadgeCheck;

  return <Icon size={size} className={className} />;
}


function isMinuteInRanges(minute, ranges) {
  for (const r of ranges || []) {
    const s = r?.start ? timeToMinutes(r.start) : null;
    const e = r?.end ? timeToMinutes(r.end) : null;
    if (s == null || e == null) continue;
    if (minute >= s && minute < e) return true;
  }
  return false;
}

function fmtDateShortPt(iso) {
  const d = toDateFromIso(iso);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(d);
}

function ModalShell({ title, onClose, children, footer = null, maxWidthClass = "max-w-lg" }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-3">
      <div className={`w-full ${maxWidthClass} max-h-[85dvh] rounded-2xl bg-white border border-slate-200 shadow-xl overflow-hidden flex flex-col`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <p className="text-xs font-extrabold text-slate-900">{title}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            title="Fechar"
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-4 overflow-auto">{children}</div>
        {footer ? (
          <div className="border-t border-slate-100 px-4 py-3">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

const STATUSES = ["Agendado", "Confirmado", "Finalizado", "Não comparece", "Cancelado", "Reagendado"];

function computeWeekBounds(days, slotIntervalMin) {
  const starts = [];
  const ends = [];

  for (const day of days || []) {
    const ranges = Array.isArray(day?.dayRanges) ? day.dayRanges : [];
    if (ranges.length) {
      for (const r of ranges) {
        if (r?.start) starts.push(timeToMinutes(r.start));
        if (r?.end) ends.push(timeToMinutes(r.end));
      }
    } else if (day?.dayBounds) {
      if (day.dayBounds.start) starts.push(timeToMinutes(day.dayBounds.start));
      if (day.dayBounds.end) ends.push(timeToMinutes(day.dayBounds.end));
    }
  }

  let startMin = starts.length ? Math.min(...starts) : timeToMinutes("07:00");
  let endMin = ends.length ? Math.max(...ends) : timeToMinutes("20:00");

  // snap to grid
  startMin = Math.max(0, Math.floor(startMin / slotIntervalMin) * slotIntervalMin);
  endMin = Math.min(24 * 60, Math.ceil(endMin / slotIntervalMin) * slotIntervalMin);

  if (!(endMin > startMin)) {
    startMin = timeToMinutes("07:00");
    endMin = timeToMinutes("20:00");
  }

  // hard cap to avoid huge renders
  const maxSpan = 12 * 60; // 12h
  if (endMin - startMin > maxSpan) endMin = startMin + maxSpan;

  return { startMin, endMin };
}

function buildTimeRows({ startMin, endMin, slotIntervalMin }) {
  const out = [];
  for (let m = startMin; m < endMin; m += slotIntervalMin) out.push(m);
  return out;
}

function todayIsoSP() {
  // hoje no fuso de SP (evita virar o dia por UTC)
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return y && m && d ? `${y}-${m}-${d}` : new Date().toISOString().slice(0, 10);
}

export default function ProfessionalWeekViewClient({ initialData }) {
  const router = useRouter();

  // Keep a copy in state so router.refresh() updates the UI when props change.
  const [data, setData] = useState(initialData);
  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  const [slotPick, setSlotPick] = useState(null); // { isoDate, startTime }
  const [createModal, setCreateModal] = useState(null); // { type:'hold'|'appointment', isoDate, startTime }
  const [detail, setDetail] = useState(null); // { isoDate, occId }
  const [deleteOcc, setDeleteOcc] = useState(null); // occurrence object for delete confirmation
  const [rescheduleOcc, setRescheduleOcc] = useState(null); // occurrence object
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const overlayRef = useRef(null);

  const weekStartIso = data?.weekStartIso;
  const weekRangeLabel = useMemo(() => (weekStartIso ? fmtWeekRangePt(weekStartIso) : ""), [weekStartIso]);

  const days = Array.isArray(data?.days) ? data.days : [];
  const patientsById = data?.patientsById || {};

  const slotIntervalMin = useMemo(() => {
    const v = Number(data?.schedule?.slotIntervalMin);
    return Number.isFinite(v) && v > 0 ? v : 30;
  }, [data?.schedule?.slotIntervalMin]);

  const bounds = useMemo(() => computeWeekBounds(days, slotIntervalMin), [days, slotIntervalMin]);
  const rows = useMemo(
    () => buildTimeRows({ startMin: bounds.startMin, endMin: bounds.endMin, slotIntervalMin }),
    [bounds.startMin, bounds.endMin, slotIntervalMin]
  );

  const todayIso = useMemo(() => todayIsoSP(), []);

  function goWeek(deltaWeeks) {
    const nextDate = addDaysIso(weekStartIso, deltaWeeks * 7);
    router.push(`/profissional?view=week&date=${encodeURIComponent(nextDate)}`);
    router.refresh();
  }

  function goDay(isoDate) {
    router.push(`/profissional?date=${encodeURIComponent(isoDate)}`);
  }

  function goDayWithOcc(isoDate, occId) {
    // MVP: open the day view. We'll add query-driven auto-open later.
    void occId;
    goDay(isoDate);
  }

  async function saveStatus(occurrenceId, nextStatus) {
    if (!occurrenceId || !nextStatus) return;
    setBusy(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/professional/occurrence/status", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ occurrenceId, status: nextStatus }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.message || "Falha ao salvar status");
      router.refresh();
    } catch (e) {
      setErrorMsg(e?.message || "Erro ao salvar status");
    } finally {
      setBusy(false);
    }
  }
  async function runDelete(occurrenceId, scope) {
    if (!occurrenceId) return;
    setBusy(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/professional/occurrence/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ occurrenceId, scope }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.message || "Falha ao excluir");
      setDeleteOcc(null);
      router.refresh();
    } catch (e) {
      setErrorMsg(e?.message || "Erro ao excluir");
    } finally {
      setBusy(false);
    }
  }



  // Grid sizing
  const headerH = 44;
  // 30min blocks were too tight and allowed text/pills to overflow into adjacent blocks.
  // We intentionally increase row height (~1.5x) to improve readability and avoid overlap.
  const rowH = 42;
  const colWTime = 72;
  const colMinW = 148;

  const gridStyle = {
    display: "grid",
    gridTemplateColumns: `${colWTime}px repeat(7, minmax(${colMinW}px, 1fr))`,
    gridTemplateRows: `${headerH}px repeat(${rows.length}, ${rowH}px)`,
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] px-3 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white">
            <CalendarDays className="h-5 w-5 text-slate-700" />
          </div>
          <div>
            <p className="text-xs text-slate-900">Semana</p>
            <p className="text-xs text-slate-600">{weekRangeLabel}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
            <button
              type="button"
              className="px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-700 hover:bg-slate-50"
              onClick={() => goDay(weekStartIso)}
            >
              Dia
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-600 text-white"
              onClick={() => {
                // already on week
              }}
            >
              Semana
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-700 hover:bg-slate-50"
              onClick={() => router.push(`/profissional?view=month&date=${encodeURIComponent(data?.isoDate || weekStartIso)}`)}
            >
              Mês
            </button>
          </div>

          <Button variant="secondary" onClick={() => goWeek(-1)} title="Semana anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="secondary" onClick={() => goWeek(1)} title="Próxima semana">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {errorMsg ? (
        <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-800">
          {errorMsg}
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white" ref={overlayRef}>
        <div style={gridStyle} className="min-w-[980px]">
          {/* Top-left corner */}
          <div
            className="sticky left-0 top-0 z-30 border-b border-r border-slate-200 bg-white"
            style={{ gridColumn: 1, gridRow: 1 }}
          />

          {/* Day headers */}
          {days.map((day, idx) => {
            const iso = day?.isoDate;
            const label = iso ? fmtDayHeaderPt(iso) : "";
            const isToday = iso === todayIso;

            return (
              <button
                key={iso}
                type="button"
                onClick={() => goDay(iso)}
                className={`sticky top-0 z-20 border-b border-r border-slate-200 px-3 text-left text-xs capitalize hover:bg-slate-50 ${
                  isToday ? "bg-violet-50" : "bg-white"
                }`}
                style={{ gridColumn: idx + 2, gridRow: 1 }}
                title="Abrir este dia"
              >
                <div className="flex items-center justify-between">
                  <span className="text-slate-900">{label}</span>
                  {isToday ? <span className="text-[10px] text-violet-700">hoje</span> : null}
                </div>
              </button>
            );
          })}

          {/* Time labels (left column) */}
          {rows.map((m, rIdx) => {
            const label = minutesToTime(m);
            const isHour = m % 60 === 0;
            return (
              <div
                key={`t-${m}`}
                className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-2 text-[11px] text-slate-600"
                style={{ gridColumn: 1, gridRow: rIdx + 2 }}
              >
                <span className={isHour ? "text-slate-800" : "text-slate-400"}>{label}</span>
              </div>
            );
          })}

          {/* Background grid cells */}
          {days.map((day, cIdx) => {
            const iso = day?.isoDate;
            const dayRanges = Array.isArray(day?.dayRanges) ? day.dayRanges : [];
            const isClosed = !dayRanges.length;

            const occupied = new Set(
              (Array.isArray(day?.occurrences) ? day.occurrences : [])
                .map((o) => String(o?.startTime || "").slice(0, 5))
                .filter(Boolean)
            );

            return rows.map((m, rIdx) => {
              const key = `cell-${iso}-${m}`;
              const isToday = iso === todayIso;

              const startTime = minutesToTime(m);
              const inOpen = !isClosed && isMinuteInRanges(m, dayRanges);
              const isOccupied = occupied.has(startTime);
              const canPick = inOpen && !isOccupied;

              return (
                <button
                  key={key}
                  type="button"
                  disabled={!canPick}
                  onClick={() => {
                    if (!canPick) return;
                    setSlotPick({ isoDate: iso, startTime });
                  }}
                  className={`border-b border-r border-slate-100 text-left ${
                    isClosed || !inOpen ? "bg-slate-50" : isToday ? "bg-violet-50/30" : "bg-white"
                  } ${canPick ? "hover:bg-slate-50" : "cursor-default"}`}
                  style={{ gridColumn: cIdx + 2, gridRow: rIdx + 2 }}
                  title={canPick ? "Clique para agendar ou reservar" : undefined}
                />
              );
            });
          })}

          {/* Events overlay */}
          {days.map((day, cIdx) => {
            const iso = day?.isoDate;
            const occ = Array.isArray(day?.occurrences) ? day.occurrences : [];
            const mainOcc = occ
              .filter((o) => o && o.isBlock !== true)
              .sort((a, b) => timeToMinutes(a?.startTime) - timeToMinutes(b?.startTime));

            return mainOcc.map((o) => {
              const startTime = String(o?.startTime || "").slice(0, 5);
              if (!startTime) return null;

              const startMin = timeToMinutes(startTime);
              const blocks = Number(o?.durationBlocks) > 0 ? Number(o.durationBlocks) : 1;

              const rel = (startMin - bounds.startMin) / slotIntervalMin;
              const rowStart = 2 + Math.max(0, Math.round(rel));
              const rowSpan = Math.max(1, Math.min(rows.length, blocks));

              const endTime = minutesToTime(startMin + blocks * slotIntervalMin);

              const pid = o?.patientId;
              const patient = pid ? patientsById?.[pid] : null;
              const title = patient?.fullName || o?.leadName || "(sem nome)";
              const status = o?.status || "Agendado";
              const isHold = o?.isHold === true;

              const labelForIcon = isHold ? "Reserva" : status;

              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setDetail({ isoDate: iso, occId: o.id })}
                  title="Abrir detalhes"
                  className={`z-20 m-0.5 flex h-full flex-col justify-between overflow-hidden rounded-xl border px-2 py-1 text-left text-[11px] leading-tight shadow-sm hover:shadow-md ${statusBlockClass({
                    status,
                    isHold,
                  })}`}
                  style={{
                    gridColumn: cIdx + 2,
                    gridRow: `${rowStart} / span ${rowSpan}`,
                  }}
                >
                  <div className="min-w-0">
                    <div className="truncate text-slate-900">{title}</div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="text-[10px] text-slate-700/90">
                        {startTime}–{endTime}
                      </span>

                      <div className="flex items-center justify-end gap-1 shrink-0">
                        {Number.isFinite(o?.sessionIndex) && Number.isFinite(o?.plannedTotalSessions) ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-slate-200 bg-white/70 text-[10px] font-semibold text-slate-700">
                            {o.sessionIndex}/{o.plannedTotalSessions}
                          </span>
                        ) : null}

                        <span
                          title={labelForIcon}
                          aria-label={labelForIcon}
                          className={`inline-flex items-center justify-center shrink-0 ${isHold ? "text-slate-600" : statusIconColorClass(status)}`}
                        >
                          {isHold ? <Lock size={14} /> : <StatusIcon status={status} size={14} />}
                          <span className="sr-only">{labelForIcon}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            });
          })}
        </div>
      </div>

      <p className="mt-2 text-[11px] text-slate-500">
        Dica: clique em um bloco para ver detalhes. Clique em um horário livre para escolher entre agendar ou reservar.
      </p>

      {slotPick ? (
        <ModalShell
          title={`Horário livre — ${fmtDateShortPt(slotPick.isoDate)} às ${slotPick.startTime}`}
          onClose={() => {
            setSlotPick(null);
            setErrorMsg("");
          }}
        >
          <div className="flex flex-col gap-3">
            <p className="text-xs text-slate-600">O que você quer fazer neste horário?</p>
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
              <button
                type="button"
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setCreateModal({ type: "hold", ...slotPick });
                  setSlotPick(null);
                }}
              >
                <Plus size={14} /> Reservar (Hold)
              </button>
              <button
                type="button"
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-xs font-extrabold text-white hover:bg-violet-700"
                onClick={() => {
                  setCreateModal({ type: "appointment", ...slotPick });
                  setSlotPick(null);
                }}
              >
                <Plus size={14} /> Agendar
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {detail ? (
        <OccurrenceDetailModal
          data={data}
          detail={detail}
          slotIntervalMin={slotIntervalMin}
          patientsById={patientsById}
          busy={busy}
          onClose={() => {
            setDetail(null);
            setErrorMsg("");
          }}
          onOpenDay={(isoDate, occId) => goDayWithOcc(isoDate, occId)}
          onSaveStatus={(occId, nextStatus) => saveStatus(occId, nextStatus)}
          onConvertHold={(occ) => {
            setDetail(null);
            setErrorMsg("");
            setCreateModal({
              type: "appointment",
              isoDate: detail?.isoDate,
              startTime: String(occ?.startTime || "00:00"),
              fromHoldOccurrenceId: occ?.id,
              prefillFullName: occ?.leadName || "",
              prefillMobile: occ?.leadMobile || "",
            });
          }}
          onReschedule={(occ) => {
            setDetail(null);
            setRescheduleOcc(occ || null);
          }}
          onAskDelete={(occ) => {
            setDetail(null);
            setDeleteOcc(occ || null);
          }}
        />
      ) : null}


      {deleteOcc ? (
        <ModalShell
          title={`Excluir ${deleteOcc?.isHold ? "reserva" : "agendamento"}?`}
          onClose={() => setDeleteOcc(null)}
          maxWidthClass="max-w-md"
        >
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-700">
              Isso remove o horário da agenda (libera o slot). O prontuário/histórico do paciente não é apagado.
            </p>

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <Button variant="danger" icon={Trash2} disabled={busy} onClick={() => runDelete(deleteOcc.id, "single")}>
                Excluir só esta ocorrência
              </Button>
              {Boolean(deleteOcc?.seriesId) &&
              Number(deleteOcc?.plannedTotalSessions) > 1 &&
              Number(deleteOcc?.sessionIndex) < Number(deleteOcc?.plannedTotalSessions) ? (
                <Button variant="danger" icon={Trash2} disabled={busy} onClick={() => runDelete(deleteOcc.id, "future")}>
                  Excluir esta e futuras
                </Button>
              ) : null}
              <Button variant="secondary" disabled={busy} onClick={() => setDeleteOcc(null)}>
                Cancelar
              </Button>
            </div>

            {errorMsg ? <p className="text-xs text-red-600">{errorMsg}</p> : null}
          </div>
        </ModalShell>
      ) : null}

      {rescheduleOcc ? (
        <ModalShell
          title="Reagendar"
          onClose={() => {
            setRescheduleOcc(null);
            setErrorMsg("");
          }}
        >
          <ReschedulePanel
            occurrence={rescheduleOcc}
            slotIntervalMin={slotIntervalMin}
            onCancel={() => {
              setRescheduleOcc(null);
              setErrorMsg("");
            }}
            onDone={() => {
              setRescheduleOcc(null);
              setDetail(null);
              setErrorMsg("");
              router.refresh();
            }}
          />
        </ModalShell>
      ) : null}

      {createModal ? (
        <CreateModal
          modal={createModal}
          slotIntervalMin={slotIntervalMin}
          defaultDurationBlocks={(() => {
            const v = Number(data?.schedule?.defaultDurationBlocks ?? data?.schedule?.defaultBlocks);
            return Number.isFinite(v) && v > 0 ? Math.max(1, Math.min(8, v)) : 2;
          })()}
          onClose={() => {
            setCreateModal(null);
            setErrorMsg("");
          }}
          onCreated={async () => {
            setCreateModal(null);
            router.refresh();
          }}
          busy={busy}
          setBusy={setBusy}
          setErrorMsg={setErrorMsg}
        />
      ) : null}
    </div>
  );
}
