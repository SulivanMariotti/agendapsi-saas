"use client";

import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { Button } from "@/components/DesignSystem";
import { Save, RefreshCcw } from "lucide-react";

function fmtDateShortPt(isoDate) {
  try {
    const d = new Date(`${isoDate}T00:00:00`);
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  } catch {
    return String(isoDate || "");
  }
}

function getIsoDateFromOccurrence(occurrence) {
  const v = occurrence?.dateIso ?? occurrence?.isoDate ?? occurrence?.date ?? occurrence?.dateObj;
  if (!v) return "";
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return "";
    return s.includes("T") ? s.slice(0, 10) : s;
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v?.toDate === "function") {
    try {
      return v.toDate().toISOString().slice(0, 10);
    } catch {
      return "";
    }
  }
  if (typeof v?.seconds === "number") return new Date(v.seconds * 1000).toISOString().slice(0, 10);
  if (typeof v?._seconds === "number") return new Date(v._seconds * 1000).toISOString().slice(0, 10);
  return String(v || "").slice(0, 10);
}

function shortText(t, max = 140) {
  const s = String(t || "").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

function pickTextFromEvolution(evo) {
  if (!evo) return "";
  const t = evo.text ?? evo.evolutionText ?? evo.note ?? "";
  return String(t || "");
}

const SessionEvolutionPanel = forwardRef(function SessionEvolutionPanel(
  { occurrence, patientId, disabled = false, externalSave = false, onDirtyChange },
  ref
) {
  const occId = String(occurrence?.id || "").trim();
  const isoDate = getIsoDateFromOccurrence(occurrence);
  const startTime = String(occurrence?.startTime || "").slice(0, 5);

  // "canUse" controls whether evolution exists for this context (patient + non-block occurrence).
  // UI can still be disabled during other operations, but programmatic save should still work (externalSave).
  const canUse = Boolean(occId) && Boolean(patientId) && occurrence?.isBlock !== true;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [text, setText] = useState("");
  const [loadedKey, setLoadedKey] = useState("");

  const uiDisabled = disabled || loading || saving;

  const isDirty = useMemo(() => {
    if (!loadedKey) return false;
    const base = loadedKey.split("|");
    const baseText = base.slice(1).join("|") || "";
    return String(text || "") !== baseText;
  }, [loadedKey, text]);

  useEffect(() => {
    onDirtyChange?.(Boolean(isDirty));
  }, [isDirty, onDirtyChange]);

  async function loadCurrent() {
    if (!canUse) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/professional/occurrence/evolution?occurrenceId=${encodeURIComponent(occId)}`, {
        method: "GET",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.message || "Falha ao carregar evolução.");

      const evo = json?.evolution || null;
      const nextText = pickTextFromEvolution(evo);

      setText(nextText);
      setLoadedKey(`${occId}|${nextText}`);
    } catch (e) {
      setError(String(e?.message || "Erro ao carregar evolução."));
      setLoadedKey(`${occId}|`);
    } finally {
      setLoading(false);
    }
  }

  async function refreshAll() {
    await loadCurrent();
  }

  useEffect(() => {
    if (!occId) return;
    refreshAll().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occId]);

  async function doSave() {
    if (!canUse) return false;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/professional/occurrence/evolution", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          occurrenceId: occId,
          text: text || "",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.message || "Falha ao salvar evolução.");

      setLoadedKey(`${occId}|${String(text || "")}`);
      return true;
    } catch (e) {
      setError(String(e?.message || "Erro ao salvar evolução."));
      return false;
    } finally {
      setSaving(false);
    }
  }

  useImperativeHandle(
    ref,
    () => ({
      isDirty: () => Boolean(isDirty),
      save: async () => await doSave(),
      saveIfDirty: async () => {
        if (!isDirty) return true;
        return await doSave();
      },
    }),
    [isDirty, text, occId, patientId] // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (!patientId) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-3">
        <p className="text-xs text-slate-400 font-bold">Evolução da sessão</p>
        <p className="mt-1 text-xs text-slate-600">
          Este item não tem paciente vinculado (lead/hold). Evolução disponível apenas para sessões com paciente.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-slate-400 font-bold">Evolução da sessão</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {isoDate ? `${fmtDateShortPt(isoDate)}${startTime ? ` — ${startTime}` : ""}` : "—"}
          </p>
          {externalSave ? (
            <p className="mt-1 text-[11px] text-slate-500">
              Dica: use <span className="font-extrabold">Salvar alterações</span> no rodapé do agendamento.
            </p>
          ) : null}
        </div>
        <Button
          variant="secondary"
          icon={RefreshCcw}
          disabled={!canUse || uiDisabled}
          onClick={() => void refreshAll()}
          title="Recarregar"
        >
          Recarregar
        </Button>
      </div>

      <div className="mt-3">
        <label className="text-xs text-slate-500 font-semibold">Texto (livre)</label>
        <textarea
          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs min-h-[120px]"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escreva a evolução desta sessão..."
          disabled={!canUse || uiDisabled}
        />
      </div>

      {!externalSave ? (
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
          <Button variant="primary" icon={Save} disabled={!canUse || uiDisabled || !isDirty} onClick={() => void doSave()}>
            Salvar evolução
          </Button>
          {isDirty ? <span className="text-xs text-amber-700 font-semibold">Alterações não salvas</span> : null}
          {saving ? <span className="text-xs text-slate-500">Salvando...</span> : null}
        </div>
      ) : (
        <div className="mt-3">
          {isDirty ? <span className="text-xs text-amber-700 font-semibold">Alterações pendentes</span> : null}
        </div>
      )}

      {error ? <p className="mt-2 text-xs text-red-600 font-semibold">{error}</p> : null}

      

    </div>
  );
});

export default SessionEvolutionPanel;
