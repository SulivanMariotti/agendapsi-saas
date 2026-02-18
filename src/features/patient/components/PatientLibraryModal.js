"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../../components/DesignSystem";
import { X, Search, ChevronDown, ChevronUp, Sparkles, CheckCircle2 } from "lucide-react";
import { LIBRARY_ARTICLES, LIBRARY_TOP_MANTRA, SESSION_TAKEAWAYS } from "../content/library";

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
        active
          ? "bg-violet-50 text-violet-700 border-violet-100"
          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function ArticleRow({ article, expanded, onToggle }) {
  return (
    <div className="border border-slate-100 rounded-2xl overflow-hidden bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-4 py-4 flex items-start justify-between gap-3 hover:bg-slate-50"
        aria-expanded={expanded}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-slate-50 text-slate-700 border-slate-100">
              {article.category}
            </span>
            <span className="text-[11px] text-slate-400">{article.readingTime}</span>
          </div>
          <div className="mt-2 text-sm font-extrabold text-slate-900">{article.title}</div>
          <div className="mt-1 text-xs text-slate-600 leading-relaxed">{article.summary}</div>
        </div>
        <div className="shrink-0 pt-1 text-slate-500">
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </button>

      {expanded ? (
        <div className="px-4 pb-4">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-sm text-slate-700 leading-relaxed space-y-3">
            {Array.isArray(article.body)
              ? article.body.map((p, idx) => (
                  <p key={idx} className="whitespace-pre-wrap">
                    {p}
                  </p>
                ))
              : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function PatientLibraryModal({ open, onClose }) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("Todas");
  const [expandedId, setExpandedId] = useState(null);
  const modalRef = useRef(null);

  // Garante que o modal seja fechável mesmo em telas pequenas:
  // - foca o modal para capturar ESC
  // - evita scroll do fundo enquanto o modal está aberto
  useEffect(() => {
    if (!open) return;

    modalRef.current?.focus?.();

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const categories = useMemo(() => {
    const set = new Set(["Todas"]);
    for (const a of LIBRARY_ARTICLES) set.add(a.category);
    return Array.from(set);
  }, []);

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();

    return (LIBRARY_ARTICLES || []).filter((a) => {
      if (activeCategory && activeCategory !== "Todas" && a.category !== activeCategory) return false;
      if (!q) return true;

      const hay = `${a.title} ${a.summary} ${(a.body || []).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [query, activeCategory]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />

      <div className="absolute inset-0 flex items-end sm:items-center justify-center p-4">
        <div
          ref={modalRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Biblioteca de Apoio"
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose?.();
          }}
          className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-slate-900">Biblioteca de Apoio</div>
              <div className="text-xs text-slate-500">
                Psicoeducação para sustentar constância — sem substituir a sessão.
              </div>
            </div>

            <button
              className="p-2 rounded-xl hover:bg-slate-50 text-slate-600"
              onClick={onClose}
              aria-label="Fechar"
              type="button"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-5 overflow-y-auto flex-1">
            {/* Mantra fixo */}
            <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white border border-violet-100 flex items-center justify-center text-violet-700 shrink-0">
                  <Sparkles size={18} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-extrabold text-violet-900">{LIBRARY_TOP_MANTRA.title}</div>
                  <div className="mt-1 text-xs text-violet-800 leading-relaxed">{LIBRARY_TOP_MANTRA.text}</div>
                </div>
              </div>
            </div>

            {/* Busca */}
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <div className="flex-1 relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por tema, palavra ou ideia..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-2xl border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                />
              </div>

              <div className="flex gap-2 overflow-auto pb-1">
                {categories.map((c) => (
                  <Chip
                    key={c}
                    active={activeCategory === c}
                    onClick={() => {
                      setActiveCategory(c);
                      setExpandedId(null);
                    }}
                  >
                    {c}
                  </Chip>
                ))}
              </div>
            </div>

            {/* Artigos */}
            <div className="space-y-3">
              <div className="text-xs text-slate-400 uppercase tracking-wider">Artigos</div>

              {filtered.length === 0 ? (
                <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50 text-sm text-slate-700">
                  Não encontrei nada com esse filtro. Tente outra palavra.
                </div>
              ) : (
                filtered.map((a) => (
                  <ArticleRow
                    key={a.id}
                    article={a}
                    expanded={expandedId === a.id}
                    onToggle={() => setExpandedId((prev) => (prev === a.id ? null : a.id))}
                  />
                ))
              )}
            </div>

            {/* Para levar para a sessão */}
            <div className="rounded-2xl border border-slate-100 bg-white p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                  <CheckCircle2 size={18} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-extrabold text-slate-900">{SESSION_TAKEAWAYS.title}</div>
                  <div className="mt-1 text-xs text-slate-600 leading-relaxed">{SESSION_TAKEAWAYS.subtitle}</div>

                  <ul className="mt-3 space-y-2 text-sm text-slate-700">
                    {SESSION_TAKEAWAYS.prompts.map((p) => (
                      <li key={p} className="flex gap-2">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-violet-300 shrink-0" />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-3 text-xs text-slate-500">
                    Se surgir vontade de faltar, observe isso como um sinal. Em vez de se afastar, traga para a sessão.
                    A constância é parte do cuidado.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-slate-100 flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
