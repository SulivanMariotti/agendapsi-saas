"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "@/components/DesignSystem";
import { Plus, RefreshCcw, Save, Trash2 } from "lucide-react";

function toNumberSafe(v, fallback = 999) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export default function TenantWhatsappTemplatesTab({ showToast }) {
  const [tenantId, setTenantId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [templates, setTemplates] = useState([]);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("Olá, {nome}! Passando para confirmar nosso horário em {data} às {hora}. Até lá 🙂");
  const [newSortOrder, setNewSortOrder] = useState(10);
  const [newActive, setNewActive] = useState(true);

  async function load() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/professional/admin/whatsapp-templates", {
        method: "GET",
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Falha ao carregar (${res.status})`);
      }

      setTenantId(String(json?.tenantId || ""));
      setTemplates(Array.isArray(json.templates) ? json.templates : []);
      showToast?.("Templates carregados", "success");
    } catch (e) {
      const msg = e?.message || "Erro ao carregar templates";
      setError(msg);
      showToast?.(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateTemplateLocal(id, patch) {
    setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  async function createTemplate() {
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
      const res = await fetch("/api/professional/admin/whatsapp-templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
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
      showToast?.("Template criado", "success");
    } catch (e) {
      const msg = e?.message || "Erro ao criar template";
      setError(msg);
      showToast?.(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveTemplate(t) {
    const title = String(t?.title || "").trim();
    const body = String(t?.body || "").trim();
    if (!title || !body) {
      setError("Título e corpo são obrigatórios");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/professional/admin/whatsapp-templates", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
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
      showToast?.("Template salvo", "success");
    } catch (e) {
      const msg = e?.message || "Erro ao salvar template";
      setError(msg);
      showToast?.(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTemplate(t) {
    if (!window.confirm(`Excluir template "${t?.title || ""}"?`)) return;

    setBusy(true);
    setError("");
    try {
      const qs = new URLSearchParams({ templateId: t.id });
      const res = await fetch(`/api/professional/admin/whatsapp-templates?${qs.toString()}`, {
        method: "DELETE",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Falha ao excluir (${res.status})`);

      setTemplates(Array.isArray(json.templates) ? json.templates : []);
      showToast?.("Template excluído", "success");
    } catch (e) {
      const msg = e?.message || "Erro ao excluir template";
      setError(msg);
      showToast?.(msg, "error");
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
            Templates do seu tenant (coleção: <span className="font-semibold">tenants/&lt;tenantId&gt;/whatsappTemplates</span>). Placeholders:{" "}
            <span className="font-semibold">{`{nome}`}</span>, <span className="font-semibold">{`{data}`}</span>, <span className="font-semibold">{`{hora}`}</span>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" icon={RefreshCcw} onClick={load} disabled={busy}>
            Recarregar
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <label className="text-xs font-semibold text-slate-600">Tenant ativo</label>
            <input
              value={tenantId}
              readOnly
              className="mt-1 w-full h-10 rounded-xl border border-slate-200 px-3 text-sm bg-slate-50 text-slate-700"
            />
          </div>
        </div>

        {error ? <p className="mt-3 text-sm text-red-600 font-semibold">{error}</p> : null}
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-extrabold text-slate-900">Novo template</h3>
          <Button variant="primary" icon={Plus} onClick={createTemplate} disabled={busy}>
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
