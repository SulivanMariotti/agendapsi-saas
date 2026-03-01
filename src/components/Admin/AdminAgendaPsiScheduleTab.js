"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button, Card } from "../DesignSystem";
import { adminFetch } from "@/services/adminApi";

const WEEKDAYS = [
  { key: "mon", label: "Segunda" },
  { key: "tue", label: "Terça" },
  { key: "wed", label: "Quarta" },
  { key: "thu", label: "Quinta" },
  { key: "fri", label: "Sexta" },
  { key: "sat", label: "Sábado" },
  { key: "sun", label: "Domingo" },
];

function defaultWeek() {
  const out = {};
  for (const d of WEEKDAYS) {
    out[d.key] = {
      enabled: ["mon", "tue", "wed", "thu", "fri"].includes(d.key),
      start: "08:00",
      end: "18:00",
    };
  }
  return out;
}

function safeNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export default function AdminAgendaPsiScheduleTab({ showToast }) {
  const [tenantId, setTenantId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    slotIntervalMin: 30,
    defaultBlocks: 2,
    bufferMin: 0,
    lunch: { enabled: false, start: "12:00", end: "13:00" },
    week: defaultWeek(),
  });

  const hasRanges = useMemo(() => {
    const w = form.week || {};
    return Object.values(w).some((d) => d?.enabled);
  }, [form.week]);

  async function loadSchedule(explicitTenantId = "") {
    setBusy(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      const tid = String(explicitTenantId || tenantId || "").trim();
      if (tid) qs.set("tenantId", tid);

      const res = await adminFetch(`/api/admin/agendapsi/schedule?${qs.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao carregar configuração");
      }

      setTenantId(json?.tenantId || tid || "");
      const sch = json?.schedule || {};

      setForm({
        slotIntervalMin: safeNum(sch.slotIntervalMin, 30),
        defaultBlocks: safeNum(sch.defaultBlocks, 2),
        bufferMin: safeNum(sch.bufferMin, 0),
        lunch: {
          enabled: Boolean(sch?.lunch?.enabled),
          start: String(sch?.lunch?.start || "12:00"),
          end: String(sch?.lunch?.end || "13:00"),
        },
        week: sch.week || defaultWeek(),
      });
    } catch (e) {
      setError(String(e?.message || "Erro ao carregar"));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadSchedule("").catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveSchedule() {
    setBusy(true);
    setError("");
    try {
      const tid = String(tenantId || "").trim();
      if (!tid) {
        setError("Informe o tenantId.");
        return;
      }

      const res = await adminFetch(`/api/admin/agendapsi/schedule`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: tid, ...form }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao salvar configuração");
      }

      showToast?.("Configuração da agenda (AgendaPsi) salva.", "success");
      // Recarrega para receber o weekAvailability normalizado
      await loadSchedule(tid);
    } catch (e) {
      const msg = String(e?.message || "Erro ao salvar");
      setError(msg);
      showToast?.(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  function setWeekDay(key, patch) {
    setForm((prev) => ({
      ...prev,
      week: {
        ...(prev.week || {}),
        [key]: {
          ...(prev.week?.[key] || {}),
          ...patch,
        },
      },
    }));
  }

  return (
    <Card title="AgendaPsi — Agenda do Profissional" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-5 max-w-3xl mx-auto">
        <div className="text-sm text-slate-600 leading-relaxed">
          Esta configuração controla como a <b>grade de horários</b> aparece no painel do Profissional (Dia/Semana/Mês).
          <div className="text-xs text-slate-400 mt-1">
            Persistência: <code className="px-1 py-0.5 rounded bg-slate-100">tenants/&lt;tenantId&gt;/settings/schedule</code>
          </div>
        </div>

        {/* Tenant */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col md:flex-row gap-3 md:items-end">
            <div className="flex-1">
              <label className="block text-xs font-bold text-slate-500 uppercase ml-1">tenantId</label>
              <input
                className="mt-1 w-full p-3 border border-slate-200 rounded-xl bg-white text-slate-800 outline-none focus:ring-2 focus:ring-violet-200"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                placeholder="tn_JnA5yU"
              />
              <div className="text-[11px] text-slate-400 mt-1">
                Dica: se você está em modo single-tenant agora, pode deixar o tenant seed (ex.: tn_JnA5yU).
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="secondary" disabled={busy} onClick={() => loadSchedule(tenantId)}>
                Carregar
              </Button>
              <Button disabled={busy} onClick={saveSchedule}>
                {busy ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </div>

        {/* Config geral */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <label className="block text-xs font-bold text-slate-500 uppercase">Intervalo da grade</label>
            <select
              className="mt-2 w-full p-3 border border-slate-200 rounded-xl bg-white text-slate-800"
              value={form.slotIntervalMin}
              onChange={(e) => setForm((p) => ({ ...p, slotIntervalMin: Number(e.target.value) }))}
            >
              <option value={30}>30 min</option>
              <option value={45}>45 min</option>
              <option value={60}>60 min</option>
            </select>
            <div className="text-[11px] text-slate-400 mt-2">Controla a grade (slots) exibida na agenda.</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <label className="block text-xs font-bold text-slate-500 uppercase">Duração padrão</label>
            <select
              className="mt-2 w-full p-3 border border-slate-200 rounded-xl bg-white text-slate-800"
              value={form.defaultBlocks}
              onChange={(e) => setForm((p) => ({ ...p, defaultBlocks: Number(e.target.value) }))}
            >
              {[1,2,3,4,5,6,7,8].map((n) => (
                <option key={n} value={n}>{n} bloco(s)</option>
              ))}
            </select>
            <div className="text-[11px] text-slate-400 mt-2">Usado como sugestão ao criar hold/agendamento (multi-bloco).</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <label className="block text-xs font-bold text-slate-500 uppercase">Buffer (min)</label>
            <input
              type="number"
              min={0}
              max={120}
              className="mt-2 w-full p-3 border border-slate-200 rounded-xl bg-white text-slate-800"
              value={form.bufferMin}
              onChange={(e) => setForm((p) => ({ ...p, bufferMin: Number(e.target.value) }))}
            />
            <div className="text-[11px] text-slate-400 mt-2">Regra de intervalo entre atendimentos (usada no “próximo horário disponível”).</div>
          </div>
        </div>

        {/* Almoço */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-800">Pausa de almoço</div>
              <div className="text-xs text-slate-500">Remove este intervalo da grade do Profissional.</div>
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="w-4 h-4"
                checked={Boolean(form?.lunch?.enabled)}
                onChange={(e) => setForm((p) => ({ ...p, lunch: { ...(p.lunch || {}), enabled: e.target.checked } }))}
              />
              Ativar
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase ml-1">Início</label>
              <input
                type="time"
                step={60}
                className="mt-1 w-full p-3 border border-slate-200 rounded-xl bg-white"
                value={form?.lunch?.start || "12:00"}
                onChange={(e) => setForm((p) => ({ ...p, lunch: { ...(p.lunch || {}), start: e.target.value } }))}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase ml-1">Fim</label>
              <input
                type="time"
                step={60}
                className="mt-1 w-full p-3 border border-slate-200 rounded-xl bg-white"
                value={form?.lunch?.end || "13:00"}
                onChange={(e) => setForm((p) => ({ ...p, lunch: { ...(p.lunch || {}), end: e.target.value } }))}
              />
            </div>
          </div>
        </div>

        {/* Semana */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-slate-800">Horário de funcionamento (por dia)</div>
              <div className="text-xs text-slate-500">Dica: desative sábado/domingo se não abre.</div>
            </div>
            {!hasRanges && (
              <span className="text-xs px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
                Nenhum dia está habilitado
              </span>
            )}
          </div>

          <div className="mt-4 space-y-3">
            {WEEKDAYS.map((d) => {
              const cfg = form?.week?.[d.key] || { enabled: false, start: "08:00", end: "18:00" };
              return (
                <div key={d.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-center justify-between sm:justify-start sm:gap-3 flex-1">
                      <div className="text-sm font-bold text-slate-800">{d.label}</div>
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          className="w-4 h-4"
                          checked={Boolean(cfg.enabled)}
                          onChange={(e) => setWeekDay(d.key, { enabled: e.target.checked })}
                        />
                        Ativo
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-2 w-full sm:w-auto">
                      <input
                        type="time"
                        step={60}
                        className="w-full p-2.5 border border-slate-200 rounded-xl bg-white"
                        value={cfg.start || "08:00"}
                        disabled={!cfg.enabled}
                        onChange={(e) => setWeekDay(d.key, { start: e.target.value })}
                      />
                      <input
                        type="time"
                        step={60}
                        className="w-full p-2.5 border border-slate-200 rounded-xl bg-white"
                        value={cfg.end || "18:00"}
                        disabled={!cfg.enabled}
                        onChange={(e) => setWeekDay(d.key, { end: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    </Card>
  );
}
