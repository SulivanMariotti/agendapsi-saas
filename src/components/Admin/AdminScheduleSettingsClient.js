"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";

import { Button, Card, Toast } from "@/components/DesignSystem";

const WEEKDAYS = [
  { key: "mon", label: "Seg" },
  { key: "tue", label: "Ter" },
  { key: "wed", label: "Qua" },
  { key: "thu", label: "Qui" },
  { key: "fri", label: "Sex" },
  { key: "sat", label: "Sáb" },
  { key: "sun", label: "Dom" },
];

function clamp(n, min, max) {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function buildDefaultWeekWorkingHours() {
  const out = {};
  for (const d of WEEKDAYS) out[d.key] = { enabled: false, start: "08:00", end: "18:00" };
  return out;
}

export default function AdminScheduleSettingsClient({ initialSchedule }) {
  const router = useRouter();

  const [slotIntervalMin, setSlotIntervalMin] = useState(Number(initialSchedule?.slotIntervalMin) || 30);
  const [bufferMin, setBufferMin] = useState(Number(initialSchedule?.bufferMin) || 0);
  const [defaultDurationBlocks, setDefaultDurationBlocks] = useState(Number(initialSchedule?.defaultDurationBlocks) || 2);

  const [lunchBreakEnabled, setLunchBreakEnabled] = useState(initialSchedule?.lunchBreakEnabled === true);
  const [lunchStart, setLunchStart] = useState(initialSchedule?.lunchStart || "12:00");
  const [lunchEnd, setLunchEnd] = useState(initialSchedule?.lunchEnd || "13:00");

  const [weekWorkingHours, setWeekWorkingHours] = useState(() => {
    const wk = initialSchedule?.weekWorkingHours;
    if (wk && typeof wk === "object") {
      const merged = buildDefaultWeekWorkingHours();
      for (const k of Object.keys(merged)) {
        if (wk[k]) merged[k] = { ...merged[k], ...wk[k] };
      }
      return merged;
    }
    return buildDefaultWeekWorkingHours();
  });

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState({ message: "", type: "success" });
  const [errorMsg, setErrorMsg] = useState("");

  const defaultDurationMin = useMemo(() => {
    const blocks = clamp(defaultDurationBlocks, 1, 8);
    return blocks * clamp(slotIntervalMin, 30, 60);
  }, [defaultDurationBlocks, slotIntervalMin]);

  const timeStepSec = useMemo(() => {
    const v = Number(slotIntervalMin);
    if ([30, 45, 60].includes(v)) return v * 60;
    return 30 * 60;
  }, [slotIntervalMin]);

  function setDay(key, patch) {
    setWeekWorkingHours((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }));
  }

  async function save() {
    setBusy(true);
    setErrorMsg("");
    try {
      const payload = {
        slotIntervalMin: Number(slotIntervalMin),
        bufferMin: Number(bufferMin),
        defaultDurationBlocks: Number(defaultDurationBlocks),
        lunchBreakEnabled,
        lunchStart,
        lunchEnd,
        weekWorkingHours,
      };

      const res = await fetch("/api/admin/schedule", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || "Falha ao salvar");

      const saved = json?.schedule;
      if (saved) {
        setSlotIntervalMin(Number(saved.slotIntervalMin) || 30);
        setBufferMin(Number(saved.bufferMin) || 0);
        setDefaultDurationBlocks(Number(saved.defaultDurationBlocks) || 2);
        setLunchBreakEnabled(saved.lunchBreakEnabled === true);
        setLunchStart(saved.lunchStart || "12:00");
        setLunchEnd(saved.lunchEnd || "13:00");
        if (saved.weekWorkingHours) setWeekWorkingHours(saved.weekWorkingHours);
      }

      setToast({ message: "Configuração salva", type: "success" });
    } catch (e) {
      setErrorMsg(e?.message || "Erro ao salvar");
      setToast({ message: "Erro ao salvar", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-3 sm:p-6 text-sm">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: "", type: "success" })} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-extrabold text-slate-400">Admin</p>
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Configuração da agenda</h1>
          <p className="text-xs text-slate-500">Defina grade (intervalo), horários por dia, buffer e almoço (por tenant).</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" icon={ArrowLeft} onClick={() => router.push("/profissional")}>
            Voltar para agenda
          </Button>
          <Button variant="primary" icon={Save} onClick={save} disabled={busy}>
            Salvar
          </Button>
        </div>
      </div>

      {errorMsg ? (
        <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-800">
          {errorMsg}
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Grade e parâmetros">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-600">Intervalo da grade</label>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={slotIntervalMin}
                  onChange={(e) => setSlotIntervalMin(Number(e.target.value))}
                  disabled={busy}
                >
                  <option value={30}>30 min</option>
                  <option value={45}>45 min</option>
                  <option value={60}>60 min</option>
                </select>
                <p className="mt-1 text-[11px] text-slate-400">Todos os horários devem alinhar com este intervalo.</p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600">Buffer entre atendimentos</label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={bufferMin}
                  onChange={(e) => setBufferMin(clamp(e.target.value, 0, 60))}
                  disabled={busy}
                />
                <p className="mt-1 text-[11px] text-slate-400">Usado como padrão em novos registros.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-600">Duração padrão (em blocos)</label>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={defaultDurationBlocks}
                  onChange={(e) => setDefaultDurationBlocks(Number(e.target.value))}
                  disabled={busy}
                >
                  {Array.from({ length: 8 }).map((_, i) => {
                    const blocks = i + 1;
                    const mins = blocks * slotIntervalMin;
                    return (
                      <option key={blocks} value={blocks}>
                        {blocks} bloco(s) ({mins} min)
                      </option>
                    );
                  })}
                </select>
                <p className="mt-1 text-[11px] text-slate-400">Padrão sugerido ao criar reservas/agendamentos.</p>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-xs font-bold text-slate-600">Resumo</p>
                <div className="mt-2 text-xs text-slate-600 space-y-1">
                  <p>
                    Intervalo: <span className="font-mono font-bold">{slotIntervalMin}m</span>
                  </p>
                  <p>
                    Duração padrão: <span className="font-mono font-bold">{defaultDurationMin}m</span>
                  </p>
                  <p>
                    Buffer: <span className="font-mono font-bold">{bufferMin}m</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-extrabold text-slate-700">Pausa de almoço</p>
                  <p className="text-[11px] text-slate-400">
                    Se ativa, a pausa é aplicada aos dias habilitados (quando estiver dentro do horário do dia).
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={lunchBreakEnabled}
                    onChange={(e) => setLunchBreakEnabled(e.target.checked)}
                    disabled={busy}
                  />
                  Ativar
                </label>
              </div>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600">Início</label>
                  <input
                    type="time"
                    step={timeStepSec}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={lunchStart}
                    onChange={(e) => setLunchStart(e.target.value)}
                    disabled={busy || !lunchBreakEnabled}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">Fim</label>
                  <input
                    type="time"
                    step={timeStepSec}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={lunchEnd}
                    onChange={(e) => setLunchEnd(e.target.value)}
                    disabled={busy || !lunchBreakEnabled}
                  />
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Horário de atendimento por dia">
          <div className="space-y-3">
            {WEEKDAYS.map((d) => {
              const val = weekWorkingHours?.[d.key] || { enabled: false, start: "08:00", end: "18:00" };
              return (
                <div key={d.key} className="rounded-2xl border border-slate-100 bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-extrabold text-slate-700">{d.label}</p>
                    <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={val.enabled}
                        onChange={(e) => setDay(d.key, { enabled: e.target.checked })}
                        disabled={busy}
                      />
                      Ativar
                    </label>
                  </div>

                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-600">Início</label>
                      <input
                        type="time"
                        step={timeStepSec}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        value={val.start}
                        onChange={(e) => setDay(d.key, { start: e.target.value })}
                        disabled={busy || !val.enabled}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-600">Fim</label>
                      <input
                        type="time"
                        step={timeStepSec}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        value={val.end}
                        onChange={(e) => setDay(d.key, { end: e.target.value })}
                        disabled={busy || !val.enabled}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
