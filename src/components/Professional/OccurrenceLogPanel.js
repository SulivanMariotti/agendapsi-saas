"use client";

import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { Button } from "@/components/DesignSystem";
import { PlusCircle, RefreshCcw } from "lucide-react";

function fmtDateTimePt(tsLike) {
  try {
    if (!tsLike) return "";
    const d =
      typeof tsLike === "string"
        ? new Date(tsLike)
        : tsLike?.seconds
        ? new Date(tsLike.seconds * 1000)
        : tsLike?._seconds
        ? new Date(tsLike._seconds * 1000)
        : null;

    if (!d || Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return "";
  }
}

function shortText(text, maxLen = 120) {
  const t = String(text || "").trim();
  if (t.length <= maxLen) return t || "—";
  return `${t.slice(0, maxLen).trim()}…`;
}

const OccurrenceLogPanel = forwardRef(function OccurrenceLogPanel(
  { occurrence, patientId, disabled = false, externalSave = false, onDirtyChange },
  ref
) {
  const occId = String(occurrence?.id || occurrence?.occurrenceId || "").trim();
  const canUse = Boolean(occId) && Boolean(patientId) && occurrence?.isBlock !== true;

  const [codes, setCodes] = useState([]);
  const [codesLoading, setCodesLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const [codeId, setCodeId] = useState("");
  const [description, setDescription] = useState("");

  const [logs, setLogs] = useState([]);
  const [patientLogs, setPatientLogs] = useState([]);
  const [patientExpandedId, setPatientExpandedId] = useState(null);

  const uiDisabled = disabled || loading || creating;

  const codesSorted = useMemo(() => {
    const list = Array.isArray(codes) ? [...codes] : [];
    list.sort((a, b) => String(a?.code || "").localeCompare(String(b?.code || "")));
    return list.filter((c) => c?.isActive !== false);
  }, [codes]);

  const selectedCodeLabel = useMemo(() => {
    const c = codesSorted.find((x) => String(x?.id || "") === String(codeId || ""));
    if (!c) return "";
    return `${c.code}${c.description ? ` — ${c.description}` : ""}`;
  }, [codesSorted, codeId]);

  const patientRecent = useMemo(() => {
    const list = Array.isArray(patientLogs) ? patientLogs : [];
    return list.filter((l) => String(l?.occurrenceId || "") !== occId);
  }, [patientLogs, occId]);

  const hasDraft = useMemo(() => {
    return Boolean(String(codeId || "").trim()) || Boolean(String(description || "").trim());
  }, [codeId, description]);

  useEffect(() => {
    onDirtyChange?.(Boolean(hasDraft));
  }, [hasDraft, onDirtyChange]);

  async function fetchCodesOnce() {
    if (codesLoading) return;
    setCodesLoading(true);
    try {
      const res = await fetch("/api/professional/occurrence-codes", { method: "GET", cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) setCodes(Array.isArray(json?.codes) ? json.codes : []);
    } catch {
      // ignore
    } finally {
      setCodesLoading(false);
    }
  }

  async function loadPatientLogs() {
    if (!canUse) return;
    try {
      const res = await fetch(
        `/api/professional/patient/occurrence-logs?patientId=${encodeURIComponent(String(patientId || ""))}&limit=12`,
        { method: "GET", cache: "no-store" }
      );
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) setPatientLogs(Array.isArray(json?.logs) ? json.logs : []);
    } catch {
      // ignore
    }
  }

  async function loadLogs() {
    if (!canUse) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/professional/occurrence/logs?occurrenceId=${encodeURIComponent(occId)}`, {
        method: "GET",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.message || "Falha ao carregar ocorrências.");
      setLogs(Array.isArray(json?.logs) ? json.logs : []);
    } catch (e) {
      setError(String(e?.message || "Erro ao carregar ocorrências."));
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }

  async function refreshAll() {
    await fetchCodesOnce();
    await loadLogs();
    await loadPatientLogs();
  }

  useEffect(() => {
    setPatientExpandedId(null);
    // reset draft when switching occurrence
    setDescription("");
    setCodeId("");
    refreshAll().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occId]);

  async function doCreateLog() {
    if (!canUse) return false;
    if (!codeId) {
      setError("Selecione um código de ocorrência.");
      return false;
    }
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/professional/occurrence/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          occurrenceId: occId,
          codeId,
          description: description || "",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.message || "Falha ao registrar ocorrência.");

      setCodeId("");
      setDescription("");
      await loadLogs();
      await loadPatientLogs();
      return true;
    } catch (e) {
      setError(String(e?.message || "Erro ao registrar ocorrência."));
      return false;
    } finally {
      setCreating(false);
    }
  }

  useImperativeHandle(
    ref,
    () => ({
      hasDraft: () => Boolean(hasDraft),
      saveDraft: async () => {
        if (!hasDraft) return true;
        return await doCreateLog();
      },
    }),
    [hasDraft, codeId, description, occId, patientId] // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (!patientId) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-3">
        <p className="text-xs text-slate-400 font-bold">Ocorrência (registro extra)</p>
        <p className="mt-1 text-xs text-slate-600">
          Este item não tem paciente vinculado (lead/hold). Ocorrências disponíveis apenas para sessões com paciente.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-slate-400 font-bold">Ocorrência (registro extra)</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Use quando for algo relevante fora do conteúdo da sessão (ex.: intercorrências, informações operacionais, etc.).
          </p>
          {externalSave ? (
            <p className="mt-1 text-[11px] text-slate-500">
              Dica: use <span className="font-extrabold">Salvar alterações</span> no rodapé do agendamento.
            </p>
          ) : null}
        </div>
        <Button variant="secondary" icon={RefreshCcw} disabled={!canUse || uiDisabled} onClick={() => void refreshAll()} title="Recarregar">
          Recarregar
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="md:col-span-1">
          <label className="text-xs text-slate-500 font-semibold">Código</label>
          <select
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
            value={codeId}
            onChange={(e) => setCodeId(e.target.value)}
            disabled={!canUse || uiDisabled}
          >
            <option value="">(selecione)</option>
            {codesSorted.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} {c.description ? `— ${c.description}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="text-xs text-slate-500 font-semibold">Descrição (livre)</label>
          <textarea
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs min-h-[90px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={selectedCodeLabel ? `Descreva: ${selectedCodeLabel}` : "Descreva a ocorrência..."}
            disabled={!canUse || uiDisabled}
          />
        </div>
      </div>

      {!externalSave ? (
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
          <Button variant="primary" icon={PlusCircle} disabled={!canUse || uiDisabled} onClick={() => void doCreateLog()}>
            Registrar ocorrência
          </Button>
          {creating ? <span className="text-xs text-slate-500">Salvando...</span> : null}
        </div>
      ) : (
        <div className="mt-3">
          {hasDraft ? <span className="text-xs text-amber-700 font-semibold">Registro pendente</span> : null}
        </div>
      )}

      {error ? <p className="mt-2 text-xs text-red-600 font-semibold">{error}</p> : null}

      <div className="mt-4">
        <p className="text-xs text-slate-400 font-bold">Ocorrências deste agendamento</p>

        {!logs.length ? (
          <p className="mt-1 text-xs text-slate-600">(nenhuma ocorrência registrada)</p>
        ) : (
          <div className="mt-2 space-y-2">
            {logs.slice(0, 8).map((l) => {
              const id = String(l?.id || "");
              const label = l?.code ? `${l.code}${l.codeDescription ? ` — ${l.codeDescription}` : ""}` : l?.codeId || "";
              const when = fmtDateTimePt(l?.createdAt) || "";
              const body = String(l?.description || "").trim() || "—";
              return (
                <div key={id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-extrabold text-slate-700 truncate">{label || "—"}</p>
                    <p className="text-[10px] text-slate-400">{when}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-700 whitespace-pre-wrap">{body}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-4">
        <p className="text-xs text-slate-400 font-bold">Histórico recente (paciente)</p>

        {!patientRecent.length ? (
          <p className="mt-1 text-xs text-slate-600">(sem ocorrências anteriores registradas)</p>
        ) : (
          <div className="mt-2 space-y-2">
            {patientRecent.slice(0, 8).map((l) => {
              const id = String(l?.id || "");
              const label = l?.code ? `${l.code}${l.codeDescription ? ` — ${l.codeDescription}` : ""}` : l?.codeId || "";
              const when = fmtDateTimePt(l?.createdAt) || "";
              const body = String(l?.description || "").trim() || "—";
              const expanded = patientExpandedId === id;

              return (
                <button
                  key={id}
                  type="button"
                  className="w-full text-left rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2"
                  onClick={() => setPatientExpandedId(expanded ? null : id)}
                  title="Clique para expandir"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-extrabold text-slate-700 truncate">{label || "—"}</p>
                      <p className="mt-0.5 text-xs text-slate-700 whitespace-pre-wrap">
                        {expanded ? body : shortText(body, 110)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-slate-400">{when}</p>
                      <span className="text-[11px] text-slate-400 font-semibold">{expanded ? "−" : "+"}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

export default OccurrenceLogPanel;
