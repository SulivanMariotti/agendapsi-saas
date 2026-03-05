"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card } from "@/components/DesignSystem";

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

export default function TenantPatientPortalTab({ showToast }) {
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

  async function loadConfig() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/professional/admin/patient-portal", {
        method: "GET",
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao carregar configuração");
      }

      const cfg = json?.config || {};
      setTenantId(String(json?.tenantId || ""));
      setForm({
        termsVersion: safeInt(cfg.termsVersion, 1) || 1,
        termsText: String(cfg.termsText || ""),
        libraryEnabled: cfg.libraryEnabled !== false,
        notesEnabled: cfg.notesEnabled === true,
        remindersEnabled: cfg.remindersEnabled !== false,
      });
    } catch (e) {
      const msg = String(e?.message || "Erro ao carregar");
      setError(msg);
      showToast?.(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadConfig().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveConfig() {
    setBusy(true);
    setError("");
    try {
      const payload = {
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

      const res = await fetch("/api/professional/admin/patient-portal", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao salvar configuração");
      }

      showToast?.("Configuração do Portal do Paciente salva.", "success");
      await loadConfig();
    } catch (e) {
      const msg = String(e?.message || "Erro ao salvar");
      setError(msg);
      showToast?.(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="AgendaPsi — Portal do Paciente (Contrato e Módulos)"
      className="animate-in fade-in slide-in-from-bottom-4 duration-500"
    >
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
          <div className="text-sm text-slate-700">
            <div className="font-semibold">Como funciona</div>
            <ul className="list-disc ml-5 mt-2 space-y-1 text-[13px] text-slate-600">
              <li>
                <b>termsVersion</b>: aumentar a versão força o paciente a aceitar o termo novamente.
              </li>
              <li>Os módulos do portal (Biblioteca / Anotações / Lembretes) podem ser ativados/desativados por tenant.</li>
              <li>O portal do paciente continua <b>sem Firestore no client</b> (APIs server-side).</li>
            </ul>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="text-sm font-semibold text-slate-700">Tenant ativo</label>
            <input
              className="mt-1 w-full p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 outline-none"
              value={tenantId}
              readOnly
            />
            <div className="text-[11px] text-slate-400 mt-1">Este painel salva diretamente no seu tenant atual.</div>
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
            <div className="text-[11px] text-slate-400 mt-1">Mínimo 1 • Máximo 999</div>
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold text-slate-700">Texto do termo</label>
          <textarea
            className="mt-1 w-full min-h-[260px] p-3 border border-slate-200 rounded-xl bg-white text-slate-800 outline-none focus:ring-2 focus:ring-violet-200"
            value={form.termsText}
            onChange={(e) => setForm((p) => ({ ...p, termsText: e.target.value }))}
            placeholder="Digite o contrato/termo exibido no Portal do Paciente..."
          />
          <div className="flex items-center justify-between mt-1">
            <div className="text-[11px] text-slate-400">Mínimo 20 caracteres • Máximo 20.000</div>
            <div className={`text-[11px] ${termsLen < 20 ? "text-red-500" : "text-slate-400"}`}>{termsLen} chars</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.libraryEnabled === true}
              onChange={(e) => setForm((p) => ({ ...p, libraryEnabled: e.target.checked }))}
            />
            Biblioteca ativa
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.notesEnabled === true}
              onChange={(e) => setForm((p) => ({ ...p, notesEnabled: e.target.checked }))}
            />
            Anotações ativas
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.remindersEnabled === true}
              onChange={(e) => setForm((p) => ({ ...p, remindersEnabled: e.target.checked }))}
            />
            Lembretes ativos
          </label>
        </div>

        {error ? (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={saveConfig} disabled={busy}>
            {busy ? "Salvando..." : "Salvar"}
          </Button>

          <Button variant="secondary" onClick={loadConfig} disabled={busy}>
            {busy ? "Carregando..." : "Recarregar"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
