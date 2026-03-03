"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button, Card } from "../DesignSystem";
import { adminFetch } from "@/services/adminApi";
import { Plus, RefreshCcw, Save, Trash2 } from "lucide-react";

function normalizeCode(v) {
  return String(v || "").trim().toUpperCase();
}

export default function AdminAgendaPsiOccurrenceCodesTab({ showToast }) {
  const [tenantId, setTenantId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [codes, setCodes] = useState([]);

  const [newCode, setNewCode] = useState("");
  const [newDesc, setNewDesc] = useState("");

  async function loadCodes(explicitTenantId = "") {
    setBusy(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      const tid = String(explicitTenantId || tenantId || "").trim();
      if (tid) qs.set("tenantId", tid);

      const res = await adminFetch(`/api/admin/agendapsi/occurrence-codes?${qs.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || json?.message || "Falha ao carregar");

      setTenantId(json?.tenantId || tid || "");
      const list = Array.isArray(json?.codes) ? json.codes : [];
      setCodes(list);
    } catch (e) {
      setError(String(e?.message || "Erro ao carregar"));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadCodes("").catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = useMemo(() => {
    const list = Array.isArray(codes) ? [...codes] : [];
    list.sort((a, b) => String(a?.code || "").localeCompare(String(b?.code || "")));
    return list;
  }, [codes]);

  async function saveRow(row) {
    const payload = {
      codeId: row?.id || "",
      code: normalizeCode(row?.code),
      description: String(row?.description || "").trim(),
      isActive: row?.isActive !== false,
    };

    if (!payload.code) {
      showToast?.("Informe o código.", "error");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      const tid = String(tenantId || "").trim();
      if (tid) qs.set("tenantId", tid);

      const res = await adminFetch(`/api/admin/agendapsi/occurrence-codes?${qs.toString()}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.message || json?.error || "Falha ao salvar");

      showToast?.("Código salvo.", "success");
      await loadCodes(tid);
    } catch (e) {
      showToast?.(String(e?.message || "Erro ao salvar"), "error");
      setError(String(e?.message || "Erro ao salvar"));
    } finally {
      setBusy(false);
    }
  }

  async function createNew() {
    const payload = {
      code: normalizeCode(newCode),
      description: String(newDesc || "").trim(),
      isActive: true,
    };

    if (!payload.code) {
      showToast?.("Informe o código.", "error");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      const tid = String(tenantId || "").trim();
      if (tid) qs.set("tenantId", tid);

      const res = await adminFetch(`/api/admin/agendapsi/occurrence-codes?${qs.toString()}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.message || json?.error || "Falha ao criar");

      setNewCode("");
      setNewDesc("");
      showToast?.("Código criado.", "success");
      await loadCodes(tid);
    } catch (e) {
      showToast?.(String(e?.message || "Erro ao criar"), "error");
      setError(String(e?.message || "Erro ao criar"));
    } finally {
      setBusy(false);
    }
  }

  async function deactivateRow(row) {
    const id = String(row?.id || "").trim();
    if (!id) return;

    setBusy(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      const tid = String(tenantId || "").trim();
      if (tid) qs.set("tenantId", tid);
      qs.set("codeId", id);

      const res = await adminFetch(`/api/admin/agendapsi/occurrence-codes?${qs.toString()}`, {
        method: "DELETE",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.message || json?.error || "Falha ao desativar");

      showToast?.("Código desativado.", "success");
      await loadCodes(tid);
    } catch (e) {
      showToast?.(String(e?.message || "Erro ao desativar"), "error");
      setError(String(e?.message || "Erro ao desativar"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">AgendaPsi — Códigos de ocorrência</h2>
        <p className="text-xs text-slate-600 mt-1">
          Lista pré-cadastrada para registrar **Ocorrências (registro extra)** vinculadas ao agendamento/paciente. (A evolução/prontuário por sessão é texto livre.)
        </p>

        <div className="mt-4 flex flex-col md:flex-row md:items-end gap-3">
          <div className="flex-1">
            <label className="text-xs text-slate-500 font-semibold">Tenant (opcional)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder="tn_..."
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" icon={RefreshCcw} disabled={busy} onClick={() => loadCodes(tenantId)}>
              Recarregar
            </Button>
          </div>
        </div>

        {error ? <p className="mt-3 text-xs text-red-600 font-semibold">{error}</p> : null}
      </Card>

      <Card>
        <h3 className="text-sm font-extrabold text-slate-900">Criar novo</h3>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-5 gap-2">
          <div className="md:col-span-1">
            <label className="text-xs text-slate-500 font-semibold">Código</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="F01"
              disabled={busy}
            />
          </div>
          <div className="md:col-span-3">
            <label className="text-xs text-slate-500 font-semibold">Descrição</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Ex.: Sessão de acompanhamento"
              disabled={busy}
            />
          </div>
          <div className="md:col-span-1 flex items-end">
            <Button variant="primary" icon={Plus} disabled={busy} onClick={createNew} className="w-full">
              Criar
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-extrabold text-slate-900">Lista</h3>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-[780px] w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-2 pr-3">Código</th>
                <th className="py-2 pr-3">Descrição</th>
                <th className="py-2 pr-3">Ativo</th>
                <th className="py-2 pr-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="py-2 pr-3">
                    <input
                      className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
                      value={row.code || ""}
                      onChange={(e) => setCodes((prev) => prev.map((c) => (c.id === row.id ? { ...c, code: e.target.value } : c)))}
                      disabled={busy}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
                      value={row.description || ""}
                      onChange={(e) =>
                        setCodes((prev) => prev.map((c) => (c.id === row.id ? { ...c, description: e.target.value } : c)))
                      }
                      disabled={busy}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={row.isActive !== false}
                        onChange={(e) => setCodes((prev) => prev.map((c) => (c.id === row.id ? { ...c, isActive: e.target.checked } : c)))}
                        disabled={busy}
                      />
                      Ativo
                    </label>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex gap-2">
                      <Button variant="secondary" icon={Save} disabled={busy} onClick={() => saveRow(row)}>
                        Salvar
                      </Button>
                      <Button
                        variant="danger"
                        icon={Trash2}
                        disabled={busy || row.isActive === false}
                        onClick={() => deactivateRow(row)}
                        title="Desativar"
                      >
                        Desativar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}

              {!sorted.length ? (
                <tr>
                  <td colSpan={4} className="py-4 text-xs text-slate-500">
                    Nenhum código cadastrado ainda.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
