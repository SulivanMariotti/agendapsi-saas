"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button, Card } from "../DesignSystem";
import { adminFetch } from "../../services/adminApi";
import {
  BookOpen,
  PlusCircle,
  Save,
  Trash2,
  RefreshCcw,
  UploadCloud,
  Search,
  Star,
  Tags,
  CheckCircle2,
  X,
} from "lucide-react";

function StatusPill({ status }) {
  const s = String(status || "draft").toLowerCase();
  const isPub = s === "published";
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
        isPub
          ? "bg-emerald-50 text-emerald-700 border-emerald-100"
          : "bg-slate-50 text-slate-700 border-slate-100"
      }`}
    >
      {isPub ? "Publicado" : "Rascunho"}
    </span>
  );
}

async function readJsonSafe(res) {
  try {
    return await res.json();
  } catch (_) {
    return {};
  }
}

function pill(active) {
  return {
    className: `px-3 py-2 rounded-2xl text-sm font-semibold border transition-all ${
      active
        ? "bg-violet-600 text-white border-violet-600"
        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
    }`,
  };
}

export default function AdminLibraryTab({ showToast }) {
  const [mode, setMode] = useState("articles"); // articles | categories

  // ===== Articles =====
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");

  const [activeId, setActiveId] = useState(null);
  const [form, setForm] = useState({
    title: "",
    categoryId: "geral",
    categoryLabel: "Geral",
    summary: "",
    content: "",
    status: "draft",
    pinned: false,
    order: 100,
    readingTime: "",
  });

  // ===== Categories =====
  const [categories, setCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(false);

  const [catActiveId, setCatActiveId] = useState(null);
  const [catForm, setCatForm] = useState({ name: "", order: 100, isActive: true });

  const [inlineNewCatOpen, setInlineNewCatOpen] = useState(false);
  const [inlineNewCatName, setInlineNewCatName] = useState("");
  const [inlineNewCatOrder, setInlineNewCatOrder] = useState(100);

  const activeItem = useMemo(() => {
    return (items || []).find((x) => x.id === activeId) || null;
  }, [items, activeId]);

  const activeCategory = useMemo(() => {
    return (categories || []).find((c) => c.id === catActiveId) || null;
  }, [categories, catActiveId]);

  function getCategoryLabelById(id) {
    const found = (categories || []).find((c) => c.id === id);
    return found?.name || "Geral";
  }

  function pickDefaultCategoryId(list) {
    const arr = Array.isArray(list) ? list : [];
    return (
      arr.find((c) => c.id === "geral")?.id ||
      arr.find((c) => c.isActive)?.id ||
      arr[0]?.id ||
      "geral"
    );
  }

  function ensureFormCategoryDefaults(nextForm) {
    const list = categories || [];
    const id = String(nextForm?.categoryId || "").trim() || pickDefaultCategoryId(list);
    const label = String(nextForm?.categoryLabel || "").trim() || getCategoryLabelById(id) || "Geral";
    return { ...nextForm, categoryId: id, categoryLabel: label };
  }

  async function loadArticles() {
    setLoading(true);
    try {
      const qs = filterStatus && filterStatus !== "all" ? `?status=${encodeURIComponent(filterStatus)}` : "";
      const res = await adminFetch(`/api/admin/library/articles${qs}`);
      const data = await readJsonSafe(res);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Falha ao carregar artigos.");
      }
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      showToast?.(e?.message || "Falha ao carregar artigos.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function loadCategories() {
    setLoadingCategories(true);
    try {
      const res = await adminFetch("/api/admin/library/categories");
      const data = await readJsonSafe(res);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Falha ao carregar categorias.");
      }
      const list = Array.isArray(data?.items) ? data.items : [];
      setCategories(list);

      // Ajusta defaults do editor depois que categorias carregam
      setForm((p) => ensureFormCategoryDefaults(p));
    } catch (e) {
      showToast?.(e?.message || "Falha ao carregar categorias.", "error");
    } finally {
      setLoadingCategories(false);
    }
  }

  useEffect(() => {
    loadArticles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus]);

  useEffect(() => {
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setActiveId(null);
    setForm((prev) =>
      ensureFormCategoryDefaults({
        title: "",
        categoryId: prev?.categoryId || "geral",
        categoryLabel: prev?.categoryLabel || "Geral",
        summary: "",
        content: "",
        status: "draft",
        pinned: false,
        order: 100,
        readingTime: "",
      })
    );
  }

  function selectItem(it) {
    setActiveId(it.id);
    const resolvedCategoryId = String(it?.categoryId || "").trim() || "geral";
    const resolvedCategoryLabel = String(it?.categoryLabel || it?.category || "Geral").trim() || "Geral";
    setForm(
      ensureFormCategoryDefaults({
        title: String(it?.title || ""),
        categoryId: resolvedCategoryId,
        categoryLabel: resolvedCategoryLabel,
        summary: String(it?.summary || ""),
        content: String(it?.content || ""),
        status: String(it?.status || "draft"),
        pinned: Boolean(it?.pinned),
        order: typeof it?.order === "number" ? it.order : parseInt(String(it?.order || 100), 10) || 100,
        readingTime: String(it?.readingTime || ""),
      })
    );
  }

  const filtered = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();
    if (!q) return items || [];
    return (items || []).filter((x) => {
      const label = String(x?.categoryLabel || x?.category || "");
      const hay = `${x?.title || ""} ${label} ${x?.summary || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, search]);

  async function handleSaveArticle() {
    const payload = {
      title: String(form.title || "").trim(),
      categoryId: String(form.categoryId || "geral").trim() || "geral",
      categoryLabel: String(form.categoryLabel || "Geral").trim() || "Geral",
      summary: String(form.summary || "").trim(),
      content: String(form.content || "").trim(),
      status: String(form.status || "draft"),
      pinned: Boolean(form.pinned),
      order: Number.isFinite(Number(form.order)) ? Number(form.order) : 100,
      readingTime: String(form.readingTime || "").trim(),
    };

    if (!payload.title) {
      showToast?.("Título é obrigatório.", "error");
      return;
    }
    if (!payload.content) {
      showToast?.("Conteúdo é obrigatório.", "error");
      return;
    }

    try {
      const isUpdate = Boolean(activeId);
      const url = isUpdate ? `/api/admin/library/articles/${encodeURIComponent(activeId)}` : "/api/admin/library/articles";
      const method = isUpdate ? "PATCH" : "POST";

      const res = await adminFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await readJsonSafe(res);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Falha ao salvar.");
      }

      showToast?.(isUpdate ? "Artigo atualizado." : "Artigo criado.");
      const newId = data?.id || activeId;

      await loadArticles();
      await loadCategories();

      if (!isUpdate && newId) setActiveId(newId);
    } catch (e) {
      showToast?.(e?.message || "Falha ao salvar.", "error");
    }
  }

  async function handleDeleteArticle() {
    if (!activeId) return;
    const ok = window.confirm("Excluir este artigo? (ação definitiva)");
    if (!ok) return;

    try {
      const res = await adminFetch(`/api/admin/library/articles/${encodeURIComponent(activeId)}`, {
        method: "DELETE",
      });
      const data = await readJsonSafe(res);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Falha ao excluir.");
      }
      showToast?.("Artigo excluído.");
      resetForm();
      await loadArticles();
    } catch (e) {
      showToast?.(e?.message || "Falha ao excluir.", "error");
    }
  }

  async function handleSeed() {
    const ok = window.confirm("Criar artigos modelo no Firestore? (não sobrescreve o que já existe)");
    if (!ok) return;

    try {
      const res = await adminFetch("/api/admin/library/seed", { method: "POST" });
      const data = await readJsonSafe(res);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Falha ao criar modelos.");
      }

      const extra = data?.categoriesCreated ? ` | Categorias: ${data.categoriesCreated} criadas.` : "";
      showToast?.(`Modelos: ${data.created} criados, ${data.skipped} já existiam.${extra}`);
      await loadArticles();
      await loadCategories();
    } catch (e) {
      showToast?.(e?.message || "Falha ao criar modelos.", "error");
    }
  }

  async function handleBootstrapCategories() {
    const ok = window.confirm("Gerar categorias a partir dos artigos existentes? (idempotente)");
    if (!ok) return;

    try {
      const res = await adminFetch("/api/admin/library/categories/bootstrap", { method: "POST" });
      const data = await readJsonSafe(res);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Falha ao gerar categorias.");
      }
      showToast?.(`Categorias: ${data.created} criadas, ${data.skipped} já existiam.`);
      await loadCategories();
    } catch (e) {
      showToast?.(e?.message || "Falha ao gerar categorias.", "error");
    }
  }

  function resetCategoryForm() {
    setCatActiveId(null);
    setCatForm({ name: "", order: 100, isActive: true });
  }

  function selectCategory(c) {
    setCatActiveId(c.id);
    setCatForm({
      name: String(c?.name || "").trim(),
      order: typeof c?.order === "number" ? c.order : parseInt(String(c?.order || 100), 10) || 100,
      isActive: c?.isActive == null ? true : Boolean(c.isActive),
    });
  }

  async function handleSaveCategory() {
    const payload = {
      name: String(catForm.name || "").trim(),
      order: Number.isFinite(Number(catForm.order)) ? Number(catForm.order) : 100,
      isActive: Boolean(catForm.isActive),
    };

    if (!payload.name) {
      showToast?.("Nome é obrigatório.", "error");
      return;
    }

    try {
      const isUpdate = Boolean(catActiveId);
      const url = isUpdate
        ? `/api/admin/library/categories/${encodeURIComponent(catActiveId)}`
        : "/api/admin/library/categories";
      const method = isUpdate ? "PATCH" : "POST";

      const res = await adminFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await readJsonSafe(res);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Falha ao salvar categoria.");
      }

      showToast?.(isUpdate ? "Categoria atualizada." : "Categoria criada.");
      const newId = data?.id || catActiveId;

      await loadCategories();
      if (!isUpdate && newId) setCatActiveId(newId);
    } catch (e) {
      showToast?.(e?.message || "Falha ao salvar categoria.", "error");
    }
  }

  async function handleDeleteCategory() {
    if (!catActiveId) return;
    const ok = window.confirm(
      "Excluir esta categoria? (os artigos continuam com o rótulo salvo, mas ela some do seletor)"
    );
    if (!ok) return;

    try {
      const res = await adminFetch(`/api/admin/library/categories/${encodeURIComponent(catActiveId)}`, {
        method: "DELETE",
      });
      const data = await readJsonSafe(res);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Falha ao excluir categoria.");
      }

      showToast?.("Categoria excluída.");
      resetCategoryForm();
      await loadCategories();
    } catch (e) {
      showToast?.(e?.message || "Falha ao excluir categoria.", "error");
    }
  }

  async function handleInlineCreateCategory() {
    const name = String(inlineNewCatName || "").trim();
    const order = Number.isFinite(Number(inlineNewCatOrder)) ? Number(inlineNewCatOrder) : 100;
    if (!name) {
      showToast?.("Nome da categoria é obrigatório.", "error");
      return;
    }

    try {
      const res = await adminFetch("/api/admin/library/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, order, isActive: true }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Falha ao criar categoria.");
      }

      const newId = data?.id;
      await loadCategories();

      if (newId) {
        setForm((p) => ({ ...p, categoryId: newId, categoryLabel: name }));
      }

      setInlineNewCatOpen(false);
      setInlineNewCatName("");
      setInlineNewCatOrder(100);
      showToast?.("Categoria criada e selecionada.");
    } catch (e) {
      showToast?.(e?.message || "Falha ao criar categoria.", "error");
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-2xl bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-700">
                <BookOpen size={18} />
              </div>
              <div className="min-w-0">
                <div className="text-lg font-extrabold text-slate-900">Biblioteca</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Psicoeducação para sustentar constância. Leitura apoia — não substitui sessão.
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={pill(mode === "articles").className}
              onClick={() => setMode("articles")}
            >
              Artigos
            </button>
            <button
              type="button"
              className={pill(mode === "categories").className}
              onClick={() => setMode("categories")}
            >
              Categorias
            </button>

            <Button variant="secondary" icon={UploadCloud} onClick={handleSeed}>
              Criar modelos
            </Button>
            <Button variant="secondary" icon={RefreshCcw} onClick={loadArticles} disabled={loading}>
              Atualizar
            </Button>
            <Button icon={PlusCircle} onClick={resetForm}>
              Novo artigo
            </Button>
          </div>
        </div>
      </div>

      {mode === "categories" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5">
            <Card title="Categorias" className="min-h-[520px]">
              <div className="space-y-4">
                <div className="text-[11px] text-slate-500">
                  Categorias ajudam a organizar a biblioteca e evitam duplicação por erro de digitação.
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button icon={PlusCircle} onClick={resetCategoryForm}>
                    Nova categoria
                  </Button>
                  <Button
                    variant="secondary"
                    icon={RefreshCcw}
                    onClick={loadCategories}
                    disabled={loadingCategories}
                  >
                    Atualizar
                  </Button>
                  <Button variant="secondary" icon={CheckCircle2} onClick={handleBootstrapCategories}>
                    Gerar dos artigos
                  </Button>
                </div>

                <div className="space-y-2 max-h-[380px] overflow-auto pr-1">
                  {(categories || []).length === 0 ? (
                    <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50 text-sm text-slate-700">
                      Nenhuma categoria cadastrada.
                    </div>
                  ) : (
                    categories.map((c) => {
                      const isActive = c.id === catActiveId;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => selectCategory(c)}
                          className={`w-full text-left p-4 rounded-2xl border transition-all ${
                            isActive
                              ? "border-violet-200 bg-violet-50/40"
                              : "border-slate-100 bg-white hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-extrabold text-slate-900 truncate">{c.name}</div>
                              <div className="mt-1 text-xs text-slate-500 truncate">slug: {c.id}</div>
                            </div>
                            <div className="shrink-0 text-xs text-slate-600">
                              {c.isActive ? (
                                <span className="inline-flex items-center px-2 py-1 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-100 font-semibold">
                                  Ativa
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-1 rounded-full border bg-slate-50 text-slate-700 border-slate-100 font-semibold">
                                  Inativa
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="text-xs text-slate-400">Total: {(categories || []).length}</div>
              </div>
            </Card>
          </div>

          <div className="lg:col-span-7">
            <Card title={catActiveId ? "Editar categoria" : "Nova categoria"} className="min-h-[520px]">
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600">Nome</label>
                  <input
                    value={catForm.name}
                    onChange={(e) => setCatForm((p) => ({ ...p, name: e.target.value }))}
                    className="mt-1 w-full px-3 py-2.5 rounded-2xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-200"
                    placeholder="Ex.: Constância e vínculo"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-600">Ordem</label>
                    <input
                      value={catForm.order}
                      onChange={(e) => setCatForm((p) => ({ ...p, order: e.target.value }))}
                      type="number"
                      className="mt-1 w-full px-3 py-2.5 rounded-2xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-200"
                    />
                  </div>

                  <div className="flex items-end">
                    <label className="inline-flex items-center gap-2 text-sm text-slate-700 mt-6">
                      <input
                        type="checkbox"
                        checked={Boolean(catForm.isActive)}
                        onChange={(e) => setCatForm((p) => ({ ...p, isActive: e.target.checked }))}
                        className="w-4 h-4 accent-violet-600"
                      />
                      Ativa
                    </label>
                  </div>

                  <div className="flex items-end">
                    {catActiveId ? (
                      <div className="text-[11px] text-slate-400">slug: {catActiveId}</div>
                    ) : (
                      <div className="text-[11px] text-slate-400">slug: gerado automaticamente</div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button icon={Save} onClick={handleSaveCategory}>
                    Salvar categoria
                  </Button>
                  {catActiveId ? (
                    <Button variant="danger" icon={Trash2} onClick={handleDeleteCategory}>
                      Excluir
                    </Button>
                  ) : null}
                  <Button variant="secondary" onClick={resetCategoryForm}>
                    Limpar
                  </Button>
                </div>

                {activeCategory?.updatedAt ? (
                  <div className="text-[11px] text-slate-400">
                    Última atualização: {new Date(Number(activeCategory.updatedAt)).toLocaleString()}
                  </div>
                ) : null}
              </div>
            </Card>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Lista */}
          <div className="lg:col-span-5">
            <Card title="Artigos cadastrados" className="min-h-[520px]">
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <div className="flex-1 relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar por título/categoria..."
                      className="w-full pl-9 pr-3 py-2.5 rounded-2xl border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                    />
                  </div>

                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="px-3 py-2.5 rounded-2xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-200"
                  >
                    <option value="all">Todos</option>
                    <option value="published">Publicados</option>
                    <option value="draft">Rascunhos</option>
                  </select>
                </div>

                <div className="text-[11px] text-slate-500">
                  Dica clínica: publique só o que ajuda a sustentar presença/constância (sem CTA de cancelar/remarcar).
                </div>

                <div className="space-y-2 max-h-[380px] overflow-auto pr-1">
                  {(filtered || []).length === 0 ? (
                    <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50 text-sm text-slate-700">
                      Nenhum artigo encontrado.
                    </div>
                  ) : (
                    filtered.map((it) => {
                      const isActive = it.id === activeId;
                      const label = String(it?.categoryLabel || it?.category || "Geral").trim() || "Geral";
                      return (
                        <button
                          key={it.id}
                          type="button"
                          onClick={() => selectItem(it)}
                          className={`w-full text-left p-4 rounded-2xl border transition-all ${
                            isActive
                              ? "border-violet-200 bg-violet-50/40"
                              : "border-slate-100 bg-white hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-extrabold text-slate-900 truncate">{it.title}</div>
                              <div className="mt-1 text-xs text-slate-600 truncate">{label}</div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {it.pinned ? (
                                <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 px-2 py-1 rounded-full font-semibold">
                                  <Star size={12} /> Destaque
                                </span>
                              ) : null}
                              <StatusPill status={it.status} />
                            </div>
                          </div>

                          {it.summary ? (
                            <div className="mt-2 text-xs text-slate-600 line-clamp-2">{it.summary}</div>
                          ) : null}
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="text-xs text-slate-400">
                  Total: {(items || []).length} | Mostrando: {(filtered || []).length}
                </div>
              </div>
            </Card>
          </div>

          {/* Editor */}
          <div className="lg:col-span-7">
            <Card title={activeId ? "Editar artigo" : "Novo artigo"} className="min-h-[520px]">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-600">Título</label>
                    <input
                      value={form.title}
                      onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                      className="mt-1 w-full px-3 py-2.5 rounded-2xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-200"
                      placeholder="Ex.: Constância: por que vir..."
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-600">Categoria</label>

                    <div className="mt-1 flex gap-2">
                      <select
                        value={String(form.categoryId || "geral")}
                        onChange={(e) => {
                          const val = String(e.target.value || "");
                          if (val === "__new__") {
                            setInlineNewCatOpen(true);
                            return;
                          }
                          const label = getCategoryLabelById(val);
                          setForm((p) => ({ ...p, categoryId: val, categoryLabel: label }));
                        }}
                        className="flex-1 px-3 py-2.5 rounded-2xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-200"
                      >
                        {(categories || []).length === 0 ? (
                          <option value="geral">Geral</option>
                        ) : null}
                        {(categories || []).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}{c.isActive ? "" : " (inativa)"}
                          </option>
                        ))}
                        <option value="__new__">+ Criar nova categoria…</option>
                      </select>
                      <Button variant="secondary" icon={Tags} onClick={() => setInlineNewCatOpen(true)}>
                        Nova
                      </Button>
                    </div>

                    {inlineNewCatOpen ? (
                      <div className="mt-2 p-3 rounded-2xl border border-slate-200 bg-slate-50">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-semibold text-slate-700">Criar categoria agora</div>
                          <button
                            type="button"
                            onClick={() => setInlineNewCatOpen(false)}
                            className="p-1.5 rounded-xl hover:bg-white border border-transparent hover:border-slate-200 text-slate-600"
                            aria-label="Fechar"
                          >
                            <X size={16} />
                          </button>
                        </div>

                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <input
                            value={inlineNewCatName}
                            onChange={(e) => setInlineNewCatName(e.target.value)}
                            className="sm:col-span-2 w-full px-3 py-2.5 rounded-2xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-200"
                            placeholder="Nome (ex.: Constância e vínculo)"
                          />
                          <input
                            value={inlineNewCatOrder}
                            onChange={(e) => setInlineNewCatOrder(e.target.value)}
                            type="number"
                            className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-200"
                            placeholder="Ordem"
                          />
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button icon={CheckCircle2} onClick={handleInlineCreateCategory}>
                            Criar e selecionar
                          </Button>
                          <Button variant="secondary" onClick={() => setInlineNewCatOpen(false)}>
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-1 text-[11px] text-slate-500">
                      Dica: evite criar muitas categorias. Poucas trilhas bem curadas sustentam melhor a constância.
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600">Resumo (opcional)</label>
                  <textarea
                    value={form.summary}
                    onChange={(e) => setForm((p) => ({ ...p, summary: e.target.value }))}
                    rows={3}
                    className="mt-1 w-full px-3 py-2.5 rounded-2xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-200"
                    placeholder="1–2 frases para o paciente entender o foco do texto"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600">
                    Conteúdo (parágrafos separados por linha em branco)
                  </label>
                  <textarea
                    value={form.content}
                    onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
                    rows={10}
                    className="mt-1 w-full px-3 py-2.5 rounded-2xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-200 whitespace-pre-wrap"
                    placeholder={`Escreva o texto aqui.\n\nDica: parágrafos com uma linha em branco entre eles.`}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-600">Status</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                      className="mt-1 w-full px-3 py-2.5 rounded-2xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-200"
                    >
                      <option value="draft">Rascunho</option>
                      <option value="published">Publicado</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-600">Ordem</label>
                    <input
                      value={form.order}
                      onChange={(e) => setForm((p) => ({ ...p, order: e.target.value }))}
                      type="number"
                      className="mt-1 w-full px-3 py-2.5 rounded-2xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-200"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-600">Leitura (opcional)</label>
                    <input
                      value={form.readingTime}
                      onChange={(e) => setForm((p) => ({ ...p, readingTime: e.target.value }))}
                      className="mt-1 w-full px-3 py-2.5 rounded-2xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-200"
                      placeholder="Ex.: 2–3 min"
                    />
                  </div>

                  <div className="flex items-end">
                    <label className="inline-flex items-center gap-2 text-sm text-slate-700 mt-6">
                      <input
                        type="checkbox"
                        checked={Boolean(form.pinned)}
                        onChange={(e) => setForm((p) => ({ ...p, pinned: e.target.checked }))}
                        className="w-4 h-4 accent-violet-600"
                      />
                      Destaque
                    </label>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button icon={Save} onClick={handleSaveArticle}>
                    Salvar
                  </Button>
                  {activeId ? (
                    <Button variant="danger" icon={Trash2} onClick={handleDeleteArticle}>
                      Excluir
                    </Button>
                  ) : null}
                  <Button variant="secondary" onClick={resetForm}>
                    Limpar
                  </Button>
                </div>

                {activeItem?.updatedAt ? (
                  <div className="text-[11px] text-slate-400">
                    Última atualização: {new Date(Number(activeItem.updatedAt)).toLocaleString()}
                  </div>
                ) : null}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
