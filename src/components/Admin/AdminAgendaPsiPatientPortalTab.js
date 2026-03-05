"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button, Card } from "../DesignSystem";
import { adminFetch } from "@/services/adminApi";

function safeInt(v, fallback) {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function norm(v) {
  return String(v ?? "").trim();
}

export default function AdminAgendaPsiPatientPortalTab({ showToast }) {
  const [tenantId, setTenantId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    termsVersion: 1,
    termsText: "",
    libraryEnabled: true,
    notesEnabled: true,
    remindersEnabled: true,
  });

  const termsLen = useMemo(() => norm(form.termsText).length, [form.termsText]);

  async function loadConfig(explicitTenantId = "") {
    setBusy(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      const tid = norm(explicitTenantId || tenantId);
      if (tid) qs.set("tenantId", tid);

      const res = await adminFetch(`/api/admin/agendapsi/patient-portal?${qs.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao carregar configuração");
      }

      const cfg = json?.config || {};
      setTenantId(json?.tenantId || tid || "");
      setForm({
        termsVersion: safeInt(cfg.termsVersion, 1) || 1,
        termsText: String(cfg.termsText || ""),
        libraryEnabled: cfg.libraryEnabled !== false,
        notesEnabled: cfg.notesEnabled === true,
        remindersEnabled: cfg.remindersEnabled !== false,
      });
    } catch (e) {
      setError(String(e?.message || "Erro ao carregar"));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadConfig("").catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveConfig() {
    setBusy(true);
    setError("");
    try {
      const tid = norm(tenantId);
      if (!tid) {
        setError("Informe o tenantId.");
        return;
      }

      const payload = {
        tenantId: tid,
        termsVersion: clamp(safeInt(form.termsVersion, 1) || 1, 1, 999),
        termsText: String(form.termsText || ""),
        libraryEnabled: form.libraryEnabled === true,
        notesEnabled: form.notesEnabled === true,
        remindersEnabled: form.remindersEnabled === true,
      };

      if (norm(payload.termsText).length < 20) {
        setError("O texto do termo deve ter pelo menos 20 caracteres.");
        return;
      }

      const res = await adminFetch(`/api/admin/agendapsi/patient-portal`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao salvar configuração");
      }

      showToast?.("Configuração do Portal do Paciente salva.", "success");
      await loadConfig(tid);
    } catch (e) {
      const msg = String(e?.message || "Erro ao salvar");
      setError(msg);
      showToast?.(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="AgendaPsi — Portal do Paciente (Contrato e Módulos)" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
          <div className="text-sm text-slate-700">
            <div className="font-semibold">Como funciona</div>
            <ul className="list-disc ml-5 mt-2 space-y-1 text-[13px] text-slate-600">
              <li><b>termsVersion</b>: aumentar a versão força o paciente a aceitar o termo novamente.</li>
              <li>Os módulos do portal (Biblioteca / Anotações / Lembretes) podem ser ativados/desativados por tenant.</li>
              <li>O portal do paciente continua <b>sem Firestore no client</b> (APIs server-side).</li>
            </ul>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="text-sm font-semibold text-slate-700">TenantId</label>
            <input
              className="mt-1 w-full p-3 border border-slate-200 rounded-xl bg-white text-slate-800 outline-none focus:ring-2 focus:ring-violet-200"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              placeholder="tn_JnA5yU"
            />
            <div className="text-[11px] text-slate-400 mt-1">
              Dica: se você está em modo single-tenant agora, pode usar o tenant seed (ex.: tn_JnA5yU).
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700">termsVersion</label>
            <input
              type="number"
              min={1}
              max={999}
              className="mt-1 w-full p-3 border border-slate-200 rounded-xl bg-white text-slate-800 outline-none focus:ring-2 focus:ring-violet-200"
              value={form.termsVersion}
              onChange={(e) => setForm((p) => ({ ...p, termsVersion: e.target.value }))}
            />
            <div className="text-[11px] text-slate-400 mt-1">
              Versão atual do termo no portal.
            </div>
          </div>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-100">
          <div className="font-semibold text-slate-800 text-sm mb-3">Módulos do Portal</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={form.libraryEnabled === true}
                onChange={(e) => setForm((p) => ({ ...p, libraryEnabled: e.target.checked }))}
              />
              Biblioteca
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={form.notesEnabled === true}
                onChange={(e) => setForm((p) => ({ ...p, notesEnabled: e.target.checked }))}
              />
              Anotações do paciente
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={form.remindersEnabled === true}
                onChange={(e) => setForm((p) => ({ ...p, remindersEnabled: e.target.checked }))}
              />
              Lembretes (opt-in/out)
            </label>
          </div>

          <div className="text-[12px] text-slate-500 mt-3">
            Observação: desativar “Lembretes” esconde o toggle do paciente, mas não apaga preferências já salvas.
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label className="text-sm font-semibold text-slate-700">Texto do Termo (Contrato)</label>
            <div className="text-[11px] text-slate-400">{termsLen}/20000</div>
          </div>

          <textarea
            className="mt-2 w-full min-h-[260px] p-3 border border-slate-200 rounded-xl bg-white text-slate-800 outline-none focus:ring-2 focus:ring-violet-200"
            value={form.termsText}
            onChange={(e) => setForm((p) => ({ ...p, termsText: e.target.value }))}
            placeholder="Cole aqui o termo/contrato que o paciente deve aceitar."
          />
          <div className="text-[12px] text-slate-500 mt-2">
            Importante: o portal do paciente não exibe CTA de cancelar/remarcar. O termo deve reforçar presença/constância.
          </div>
        </div>

        {error ? (
          <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">
            {error}
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => loadConfig(tenantId)} disabled={busy}>
            Recarregar
          </Button>
          <Button onClick={saveConfig} disabled={busy}>
            Salvar
          </Button>

          {busy ? <span className="text-sm text-slate-400 ml-2">Processando...</span> : null}
        </div>
      </div>
    </Card>
  );
}
