"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button, Card } from "../DesignSystem";
import { adminFetch } from "@/services/adminApi";
import { Plus, RefreshCcw, Save, Trash2 } from "lucide-react";

function normalizeTenantId(v) {
  return String(v || "").trim();
}

function toNumberSafe(v, fallback = 999) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export default function AdminAgendaPsiWhatsappTemplatesTab({ showToast }) {
  const [tenantId, setTenantId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [templates, setTemplates] = useState([]);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("Olá, {nome}! Passando para confirmar nosso horário em {data} às {hora}. Até lá 🙂");
  const [newSortOrder, setNewSortOrder] = useState(10);
  const [newActive, setNewActive] = useState(true);

  const effectiveTenantId = useMemo(() => normalizeTenantId(tenantId), [tenantId]);

  async function load() {
    setError("");
    const tid = effectiveTenantId;
    if (!tid) {
      setTemplates([]);
      return;
    }

    setBusy(true);
    try {
      const qs = new URLSearchParams();
      qs.set("tenantId", tid);

      const res = await adminFetch(`/api/admin/agendapsi/whatsapp-templates?${qs.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Falha ao carregar (${res.status})`);
      }

      setTemplates(Array.isArray(json.templates) ? json.templates : []);
      if (showToast) showToast("Templates carregados", "success");
    } catch (e) {
      setError(e?.message || "Erro ao carregar templates");
      if (showToast) showToast("Erro ao carregar templates", "error");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    // não auto-carrega sem tenantId
    if (!effectiveTenantId) return;
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTenantId]);

  function updateTemplateLocal(id, patch) {
    setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  async function createTemplate() {
    const tid = effectiveTenantId;
    if (!tid) {
      setError("Informe o tenantId");
      return;
    }
    const title = String(newTitle || "").trim();
    const body = String(newBody || "").trim();
    if (!title) {
      setError("Informe o título do template");
      return;
    }
    if (!body) {
      setError("Informe o corpo do template");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const res = await adminFetch(`/api/admin/agendapsi/whatsapp-templates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: tid,
          title,
          body,
          isActive: Boolean(newActive),
          sortOrder: toNumberSafe(newSortOrder, 10),
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Falha ao criar (${res.status})`);

      setTemplates(Array.isArray(json.templates) ? json.templates : []);
      setNewTitle("");
      if (showToast) showToast("Template criado", "success");
    } catch (e) {
      setError(e?.message || "Erro ao criar template");
      if (showToast) showToast("Erro ao criar template", "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveTemplate(t) {
    const tid = effectiveTenantId;
    if (!tid) return;

    const title = String(t?.title || "").trim();
    const body = String(t?.body || "").trim();
    if (!title || !body) {
      setError("Título e corpo são obrigatórios");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const res = await adminFetch(`/api/admin/agendapsi/whatsapp-templates`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: tid,
          templateId: t.id,
          title,
          body,
          isActive: t.isActive !== false,
          sortOrder: toNumberSafe(t.sortOrder, 999),
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Falha ao salvar (${res.status})`);

      setTemplates(Array.isArray(json.templates) ? json.templates : []);
      if (showToast) showToast("Template salvo", "success");
    } catch (e) {
      setError(e?.message || "Erro ao salvar template");
      if (showToast) showToast("Erro ao salvar template", "error");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTemplate(t) {
    const tid = effectiveTenantId;
    if (!tid) return;
    if (!window.confirm(`Excluir template "${t?.title || ""}"?`)) return;

    setBusy(true);
    setError("");
    try {
      const qs = new URLSearchParams({ tenantId: tid, templateId: t.id });
      const res = await adminFetch(`/api/admin/agendapsi/whatsapp-templates?${qs.toString()}`, {
        method: "DELETE",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Falha ao excluir (${res.status})`);

      setTemplates(Array.isArray(json.templates) ? json.templates : []);
      if (showToast) showToast("Template excluído", "success");
    } catch (e) {
      setError(e?.message || "Erro ao excluir template");
      if (showToast) showToast("Erro ao excluir template", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">WhatsApp — Templates</h2>
          <p className="text-sm text-slate-500 mt-1">
            Templates por tenant (coleção: <span className="font-semibold">tenants/&lt;tenantId&gt;/whatsappTemplates</span>). Placeholders:{" "}
            <span className="font-semibold">{`{nome}`}</span>, <span className="font-semibold">{`{data}`}</span>, <span className="font-semibold">{`{hora}`}</span>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" icon={RefreshCcw} onClick={load} disabled={!effectiveTenantId || busy}>
            Recarregar
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <label className="text-xs font-semibold text-slate-600">TenantId</label>
            <input
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              placeholder="tn_..."
              className="mt-1 w-full h-10 rounded-xl border border-slate-200 px-3 text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={load} disabled={!effectiveTenantId || busy}>
              Carregar
            </Button>
          </div>
        </div>

        {error ? <p className="mt-3 text-sm text-red-600 font-semibold">{error}</p> : null}
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-extrabold text-slate-900">Novo template</h3>
          <Button variant="primary" icon={Plus} onClick={createTemplate} disabled={!effectiveTenantId || busy}>
            Criar
          </Button>
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-4">
            <label className="text-xs font-semibold text-slate-600">Título</label>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Confirmação"
              className="mt-1 w-full h-10 rounded-xl border border-slate-200 px-3 text-sm"
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-slate-600">Ordem</label>
            <input
              value={String(newSortOrder)}
              onChange={(e) => setNewSortOrder(e.target.value)}
              className="mt-1 w-full h-10 rounded-xl border border-slate-200 px-3 text-sm"
            />
          </div>

          <div className="md:col-span-2 flex items-end">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 font-semibold">
              <input type="checkbox" checked={newActive} onChange={(e) => setNewActive(e.target.checked)} />
              Ativo
            </label>
          </div>

          <div className="md:col-span-12">
            <label className="text-xs font-semibold text-slate-600">Mensagem</label>
            <textarea
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-extrabold text-slate-900">Templates</h3>
          <span className="text-xs text-slate-500 font-semibold">{templates.length} itens</span>
        </div>

        <div className="mt-3 space-y-3">
          {templates.length ? (
            templates.map((t) => (
              <div key={t.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-4">
                    <label className="text-xs font-semibold text-slate-600">Título</label>
                    <input
                      value={String(t.title || "")}
                      onChange={(e) => updateTemplateLocal(t.id, { title: e.target.value })}
                      className="mt-1 w-full h-10 rounded-xl border border-slate-200 px-3 text-sm"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-xs font-semibold text-slate-600">Ordem</label>
                    <input
                      value={String(t.sortOrder ?? 999)}
                      onChange={(e) => updateTemplateLocal(t.id, { sortOrder: e.target.value })}
                      className="mt-1 w-full h-10 rounded-xl border border-slate-200 px-3 text-sm"
                    />
                  </div>

                  <div className="md:col-span-2 flex items-end">
                    <label className="inline-flex items-center gap-2 text-sm text-slate-700 font-semibold">
                      <input
                        type="checkbox"
                        checked={t.isActive !== false}
                        onChange={(e) => updateTemplateLocal(t.id, { isActive: e.target.checked })}
                      />
                      Ativo
                    </label>
                  </div>

                  <div className="md:col-span-4 flex items-center justify-end gap-2">
                    <Button variant="secondary" icon={Save} onClick={() => saveTemplate(t)} disabled={busy}>
                      Salvar
                    </Button>
                    <Button variant="danger" icon={Trash2} onClick={() => deleteTemplate(t)} disabled={busy}>
                      Excluir
                    </Button>
                  </div>

                  <div className="md:col-span-12">
                    <label className="text-xs font-semibold text-slate-600">Mensagem</label>
                    <textarea
                      value={String(t.body || "")}
                      onChange={(e) => updateTemplateLocal(t.id, { body: e.target.value })}
                      rows={4}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">Nenhum template cadastrado para este tenant.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
