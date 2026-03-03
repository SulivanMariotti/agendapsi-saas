"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../../components/DesignSystem";
import { X, Search, ChevronDown, ChevronUp, Sparkles, CheckCircle2, AlertTriangle } from "lucide-react";
import { getAuth } from "firebase/auth";
import { patientApp } from "@/app/firebasePatient";
import { LIBRARY_TOP_MANTRA, SESSION_TAKEAWAYS } from "../content/library";
import { PT } from "../lib/uiTokens";
import { LIBRARY_SEED_ARTICLES } from "../../../lib/shared/librarySeed";

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
        active
          ? `${PT.accentSoft} ${PT.accentText}`
          : "bg-slate-50 text-slate-600 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

function splitParagraphs(content) {
  const raw = String(content || "");
  if (!raw.trim()) return [];
  return raw
    .split(/\n\s*\n+/g)
    .map((p) => p.trim())
    .filter(Boolean);
}

function normalizeArticle(a) {
  const id = String(a?.id || "").trim();
  const title = String(a?.title || "").trim();
  const category = String(a?.category || "Geral").trim() || "Geral";
  const summary = String(a?.summary || "").trim();
  const readingTime = String(a?.readingTime || "").trim();

  // Aceita tanto `content` (string) quanto `body` (array) do seed legado.
  const paragraphs = Array.isArray(a?.body)
    ? a.body.map((p) => String(p || "").trim()).filter(Boolean)
    : splitParagraphs(a?.content);

  return {
    id: id || `${category}_${title}`,
    title,
    category,
    summary,
    readingTime: readingTime || null,
    paragraphs,
  };
}

function computeReadingTimeFromParagraphs(paragraphs) {
  const text = (paragraphs || []).join(" ").trim();
  if (!text) return null;
  const words = text.split(/\s+/g).filter(Boolean).length;
  const mins = Math.max(1, Math.round(words / 200));
  if (mins <= 1) return "1 min";
  if (mins === 2) return "2 min";
  return `${mins} min`;
}

function ArticleRow({ article, expanded, onToggle }) {
  return (
    <div className="rounded-xl sm:rounded-2xl overflow-hidden bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-4 py-3 sm:py-4 flex items-start justify-between gap-3 hover:bg-slate-50"
        aria-expanded={expanded}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
              {article.category}
            </span>
            <span className="text-[11px] text-slate-400">
              {article.readingTime || computeReadingTimeFromParagraphs(article.paragraphs) || ""}
            </span>
          </div>
          <div className="mt-2 text-[15px] font-extrabold text-slate-900 leading-snug">{article.title}</div>
          {article.summary ? (
            <div className="mt-1 text-[13px] text-slate-600 leading-relaxed">{article.summary}</div>
          ) : null}
        </div>
        <div className="shrink-0 pt-1 text-slate-500">
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </button>

      {expanded ? (
        <div className="px-4 pb-4">
          <div className="p-4 rounded-xl sm:rounded-2xl bg-slate-50 text-[13px] text-slate-700 leading-relaxed space-y-3">
            {Array.isArray(article.paragraphs)
              ? article.paragraphs.map((p, idx) => (
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

  const [remoteArticles, setRemoteArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState(null);

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

  // Carrega artigos publicados via API server-side.
  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setWarning(null);

        const auth = getAuth(patientApp);
        const user = auth.currentUser;
        if (!user) {
          setWarning("Você precisa estar logado para acessar a biblioteca.");
          setRemoteArticles([]);
          return;
        }

        const idToken = await user.getIdToken(true);
        const endpoints = ["/api/patient/library/list", "/api/paciente/library"];
        let lastMessage = null;
        let items = [];

        for (const endpoint of endpoints) {
          const res = await fetch(endpoint, {
            method: "GET",
            headers: { authorization: `Bearer ${idToken}` },
          });

          const data = await res.json().catch(() => ({}));

          if (res.ok && data?.ok) {
            items = Array.isArray(data?.articles) ? data.articles : [];
            lastMessage = null;
            break;
          }

          // Se a rota não existir (ambientes com naming diferente), tenta a alternativa.
          if (res.status === 404) {
            lastMessage = "Biblioteca indisponível neste ambiente.";
            continue;
          }

          lastMessage = data?.error || "Não foi possível carregar a biblioteca agora.";
        }

        if (lastMessage) {
          setWarning(lastMessage);
          setRemoteArticles([]);
          return;
        }
        if (!cancelled) {
          setRemoteArticles(items);
        }
      } catch (_) {
        if (!cancelled) {
          setWarning("Não foi possível carregar a biblioteca agora.");
          setRemoteArticles([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const normalizedArticles = useMemo(() => {
    const base = Array.isArray(remoteArticles) && remoteArticles.length ? remoteArticles : LIBRARY_SEED_ARTICLES;
    return (base || []).map(normalizeArticle).filter((a) => a.title);
  }, [remoteArticles]);

  const categories = useMemo(() => {
    const set = new Set(["Todas"]);
    for (const a of normalizedArticles) set.add(a.category);
    return Array.from(set);
  }, [normalizedArticles]);

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();

    return (normalizedArticles || []).filter((a) => {
      if (activeCategory && activeCategory !== "Todas" && a.category !== activeCategory) return false;
      if (!q) return true;

      const hay = `${a.title} ${a.summary} ${(a.paragraphs || []).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [query, activeCategory, normalizedArticles]);

  // Quando trocar categorias/busca, fecha qualquer item expandido.
  useEffect(() => {
    setExpandedId(null);
  }, [activeCategory, query]);

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
          className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[calc(100dvh-2rem)] flex flex-col"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-slate-900">Biblioteca de Apoio</div>
              <div className="text-xs text-slate-500">Psicoeducação para sustentar constância — sem substituir a sessão.</div>
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
          <div className="flex-1 overflow-y-auto">
            {/* Barra fixa (mobile-friendly): mantra + busca + categorias */}
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-100">
              <div className="px-4 sm:px-5 pt-4 pb-3 space-y-3">
                {/* Mantra fixo */}
                <div className={`rounded-2xl ${PT.accentSoft} p-3 shadow-sm`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-2xl bg-white/80 shadow-sm flex items-center justify-center ${PT.accentIcon} shrink-0`}>
                      <Sparkles size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className={`text-sm font-extrabold ${PT.accentText}`}>{LIBRARY_TOP_MANTRA.title}</div>
                      <div className={`mt-1 text-[12px] ${PT.accentText} leading-relaxed line-clamp-2 sm:line-clamp-none`}>
                        {LIBRARY_TOP_MANTRA.text}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Busca */}
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar por tema, palavra ou ideia..."
                    className={`w-full pl-9 pr-3 py-2.5 rounded-2xl border border-slate-200 bg-white text-[15px] text-slate-800 placeholder:text-slate-400 focus:outline-none ${PT.focusRing}`}
                  />
                </div>

                {/* Categorias */}
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                  {categories.map((c) => (
                    <Chip
                      key={c}
                      active={activeCategory === c}
                      onClick={() => {
                        setActiveCategory(c);
                      }}
                    >
                      {c}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-4 sm:px-5 py-4 space-y-5 pb-[calc(16px+env(safe-area-inset-bottom))]">
              {/* Aviso (fallback / erro de carga) */}
              {warning ? (
                <div className="rounded-2xl bg-amber-50 p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-white/80 shadow-sm flex items-center justify-center text-amber-700 shrink-0">
                      <AlertTriangle size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold text-amber-900">Aviso</div>
                      <div className="mt-1 text-xs text-amber-800 leading-relaxed">{warning}</div>
                      <div className="mt-2 text-[11px] text-amber-800/80">
                        Se ainda não há artigos publicados, exibimos um conteúdo base para apoiar sua constância.
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Artigos */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-slate-400 uppercase tracking-wider">Artigos</div>
                  {loading ? <div className="text-[11px] text-slate-400">Carregando…</div> : null}
                </div>

                {filtered.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-slate-50 text-sm text-slate-700 shadow-sm">
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
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 shadow-sm flex items-center justify-center text-emerald-700 shrink-0">
                    <CheckCircle2 size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-extrabold text-slate-900">{SESSION_TAKEAWAYS.title}</div>
                    <div className="mt-1 text-xs text-slate-600 leading-relaxed">{SESSION_TAKEAWAYS.subtitle}</div>

                    <ul className="mt-3 space-y-2 text-sm text-slate-700">
                      {SESSION_TAKEAWAYS.prompts.map((p) => (
                        <li key={p} className="flex gap-2">
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-violet-200 shrink-0" />
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
          </div>

          {/* Footer */}
          <div className="px-4 sm:px-5 py-3 sm:py-4 border-t border-slate-100 flex justify-end pb-[calc(12px+env(safe-area-inset-bottom))]">
            <Button variant="secondary" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
