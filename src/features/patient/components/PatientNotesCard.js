"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus, Trash2, CheckCircle, Loader2, Sparkles, History, CalendarCheck, Star } from "lucide-react";

import { Button, Card } from "../../../components/DesignSystem";
import InlineLoading from "./InlineLoading";
import EmptyState from "./EmptyState";
import InlineError from "./InlineError";

/**
 * Diário rápido (Notas)
 * Props esperadas:
 * - notes: array { id, content, createdAt }
 * - loadingNotes: boolean
 * - saveNote(content: string): Promise<void>
 * - deleteNote(id: string): Promise<void>
 * - showToast(msg: string, type?: 'success'|'error'): void
 */
const QUICK_PROMPTS = [
  { label: "Como me senti hoje", value: "Como me senti hoje: " },
  { label: "O que estou evitando", value: "O que estou evitando: " },
  { label: "O que eu preciso dizer", value: "O que eu preciso dizer na sessão: " },
  { label: "Uma pequena vitória", value: "Uma pequena vitória (mesmo que mínima): " },
  { label: "Algo que me ativou", value: "Uma situação que me ativou e como eu reagi: " },
];

export default function PatientNotesCard({ patientUid = null, notes, loadingNotes, saveNote, deleteNote, showToast, error = null, onRetry = null, nextSessionDateTimeLabel = null }) {
  const [historySearch, setHistorySearch] = useState("");
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [busyAction, setBusyAction] = useState(null); // 'save' | 'delete' | null
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [pinnedNoteId, setPinnedNoteId] = useState(null);
  const textareaRef = useRef(null);

  const busy = Boolean(busyAction);
  const saving = busyAction === "save";

  const autoGrowTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    if (!noteModalOpen) return;
    requestAnimationFrame(() => {
      autoGrowTextarea();
      textareaRef.current?.focus?.();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteModalOpen]);

  const notesArr = useMemo(() => (Array.isArray(notes) ? notes : []), [notes]);

  const pinnedStorageKey = useMemo(() => {
    const baseKey = 'lp:pinnedNote';
    return patientUid ? `${baseKey}:${patientUid}` : baseKey;
  }, [patientUid]);

  useEffect(() => {
    try {
      const v = window?.localStorage?.getItem(pinnedStorageKey);
      setPinnedNoteId(v || null);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinnedStorageKey]);

  useEffect(() => {
    try {
      if (pinnedNoteId) window?.localStorage?.setItem(pinnedStorageKey, pinnedNoteId);
      else window?.localStorage?.removeItem(pinnedStorageKey);
    } catch {
      // ignore
    }
  }, [pinnedStorageKey, pinnedNoteId]);

  const notesCount = notesArr.length;

  const pinnedNote = useMemo(() => {
    if (!pinnedNoteId) return null;
    return notesArr.find((n) => n?.id === pinnedNoteId) || null;
  }, [notesArr, pinnedNoteId]);

  const previewNotes = useMemo(() => {
    if (!pinnedNote) return notesArr.slice(0, 2);
    const rest = notesArr.filter((n) => n?.id !== pinnedNote.id);
    return [pinnedNote, ...rest.slice(0, 1)];
  }, [notesArr, pinnedNote]);

  useEffect(() => {
    if (!pinnedNoteId) return;
    const exists = notesArr.some((n) => n?.id === pinnedNoteId);
    if (!exists) setPinnedNoteId(null);
  }, [notesArr, pinnedNoteId]);

  const filteredNotes = useMemo(() => {
    const q = String(historySearch || "").trim().toLowerCase();
    if (!q) return notesArr;
    return notesArr.filter((n) => String(n?.content || "").toLowerCase().includes(q));
  }, [notesArr, historySearch]);

  const handleSaveNote = async () => {
    if (busy) return;
    const c = String(noteContent || "").trim();
    if (!c) {
      showToast?.("Escreva algo antes de salvar.", "error");
      return;
    }

    try {
      setBusyAction("save");
      await saveNote?.(c);
      setNoteContent("");
      setNoteModalOpen(false);
      setLastSavedAt(new Date());
      showToast?.("Nota salva!", "success");
    } catch (e) {
      console.error(e);
      showToast?.("Erro ao salvar nota.", "error");
    } finally {
      setBusyAction(null);
    }
  };

  const togglePinned = (id) => {
    if (busy) return;
    setPinnedNoteId((prev) => (prev === id ? null : id));
    showToast?.(pinnedNoteId === id ? 'Destaque removido.' : 'Nota destacada para a próxima sessão.', 'success');
  };

  const handleDeleteNote = async (id) => {
    if (busy) return;
    try {
      setBusyAction("delete");
      await deleteNote?.(id);
      showToast?.("Nota apagada.", "success");
    } catch (e) {
      console.error(e);
      showToast?.("Erro ao apagar nota.", "error");
    } finally {
      setBusyAction(null);
    }
  };

  const lastSavedLabel = useMemo(() => {
    if (!lastSavedAt) return "";
    try {
      const t = lastSavedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      return `Salvo agora • ${t}`;
    } catch {
      return "Salvo agora";
    }
  }, [lastSavedAt]);

  const injectPrompt = (promptText) => {
    if (busy) return;
    setNoteContent((prev) => {
      const base = String(prev || "");
      if (!base) return promptText;
      const needsBreak = !base.endsWith("\n") ? "\n" : "";
      return `${base}${needsBreak}${promptText}`;
    });
    requestAnimationFrame(() => autoGrowTextarea());
  };

  return (
    <>
      <Card title="Diário rápido">
        <div className="space-y-4">
          <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
            <div className="flex items-center gap-2 text-slate-800">
              <Sparkles size={16} className="text-violet-600" />
              <div className="font-semibold text-sm">Anote agora para chegar mais presente na sessão</div>
            </div>
            <div className="text-xs text-slate-600 mt-1">
              A evolução acontece na continuidade.
            </div>

            {nextSessionDateTimeLabel ? (
              <div className="mt-2 inline-flex items-center gap-2 text-xs text-slate-700">
                <CalendarCheck size={14} className="text-violet-600" />
                <span>Para sua próxima sessão:</span>
                <span className="font-semibold text-slate-900">{nextSessionDateTimeLabel}</span>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="flex items-center gap-2">
              <Button onClick={() => setNoteModalOpen(true)} icon={Plus} className="shrink-0">
                Nova
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setHistoryModalOpen(true);
                  setHistorySearch("");
                }}
                icon={History}
                className="shrink-0"
              >
                Histórico
              </Button>
            </div>

            <div className="text-[11px] text-slate-400 sm:ml-auto">
              {notesCount === 0 ? "" : `${notesCount} nota${notesCount === 1 ? "" : "s"}`}
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Um rascunho rápido para a sua próxima sessão.</span>
            {saving ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" /> Salvando…
              </span>
            ) : lastSavedLabel ? (
              <span>{lastSavedLabel}</span>
            ) : (
              <span />
            )}
          </div>

          {error ? (
            <InlineError
              title="Não foi possível carregar suas notas"
              description={typeof error === "string" ? error : "Tente novamente em instantes."}
              actionLabel={typeof onRetry === "function" ? "Recarregar" : ""}
              onAction={onRetry}
            />
          ) : loadingNotes ? (
            <div className="py-2">
              <InlineLoading label="Carregando suas notas…" />
            </div>
          ) : notesCount === 0 ? (
            <EmptyState
              title="Nenhuma nota ainda"
              description="Use “Nova” para registrar algo que você quer levar para a sessão. Pequenas anotações ajudam a manter a continuidade do seu processo."
            />
          ) : (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700">{pinnedNote ? "Em destaque e mais recente" : "Últimas anotações"}</div>
              {previewNotes.map((n, idx) => {
                const when = n?.createdAt?.seconds ? new Date(n.createdAt.seconds * 1000).toLocaleString("pt-BR") : "";
                return (
                  <div key={n.id} className="p-4 rounded-2xl border border-slate-100 bg-white">
                    {pinnedNote && idx === 0 ? (
                      <div className="inline-flex items-center gap-2 mb-2 text-[11px] font-semibold text-violet-700">
                        <Star size={14} className="text-violet-600" />
                        <span>Em destaque para sua próxima sessão</span>
                      </div>
                    ) : null}
                    <div className="text-sm text-slate-700 whitespace-pre-wrap break-words max-h-[4.75rem] overflow-hidden">
                      {n.content}
                    </div>
                    {when ? <div className="text-[11px] text-slate-400 mt-2">{when}</div> : null}
                  </div>
                );
              })}

              {notesCount > 2 ? (
                <button
                  type="button"
                  className="w-full p-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-700 hover:bg-slate-100 transition"
                  onClick={() => {
                    setHistoryModalOpen(true);
                    setHistorySearch("");
                  }}
                >
                  Ver histórico completo ({notesCount})
                </button>
              ) : null}
            </div>
          )}
        </div>
      </Card>

      {/* Modal Nova Nota */}
      {noteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border border-slate-100">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="font-bold text-slate-800">Nova anotação</div>
              <button type="button" onClick={() => setNoteModalOpen(false)} className="text-slate-400 hover:text-slate-600" disabled={busy}>
                ✕
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="text-xs text-slate-500">
                Use este espaço para registrar o que você quer levar para a sessão. A clareza nasce quando você volta, com constância, para o que importa.
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {QUICK_PROMPTS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => injectPrompt(p.value)}
                    disabled={busy}
                    className="shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:scale-[0.98] transition"
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <textarea
                ref={textareaRef}
                className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-200 text-slate-700 text-sm min-h-[160px] max-h-[45vh] overflow-y-auto resize-none leading-relaxed"
                placeholder="O que você quer levar para a sessão?\nUm fato, uma emoção, um incômodo, uma pequena vitória…"
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                onInput={autoGrowTextarea}
                disabled={busy}
              />

              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>{saving ? "Salvando…" : ""}</span>
                <span>{lastSavedLabel}</span>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setNoteModalOpen(false)} className="flex-1" disabled={busy}>
                  Fechar
                </Button>
                <Button onClick={handleSaveNote} className="flex-1" icon={CheckCircle} disabled={busy}>
                  Salvar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Histórico */}
      {historyModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border border-slate-100">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="font-bold text-slate-800">Histórico de anotações</div>
              <button
                type="button"
                onClick={() => setHistoryModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
                disabled={busy}
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                <input
                  className="w-full pl-9 p-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-200 text-slate-700 text-sm"
                  placeholder="Buscar nas suas notas..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                />
              </div>

              <div className="text-[11px] text-slate-400">
                Dica: você pode <span className="font-semibold text-slate-600">destacar</span> uma nota para manter em evidência até a próxima sessão.
              </div>

              {loadingNotes ? (
                <div className="py-2">
                  <InlineLoading label="Carregando suas notas…" />
                </div>
              ) : filteredNotes.length === 0 ? (
                <EmptyState
                  title="Nenhum resultado"
                  description={historySearch ? "Não encontramos notas com esse termo." : "Você ainda não registrou anotações."}
                />
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                  {filteredNotes.map((n) => {
                    const when = n?.createdAt?.seconds ? new Date(n.createdAt.seconds * 1000).toLocaleString("pt-BR") : "";
                    return (
                      <div key={n.id} className="p-4 rounded-2xl border border-slate-100 bg-white flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-sm text-slate-700 whitespace-pre-wrap break-words">{n.content}</div>
                          {when ? <div className="text-[11px] text-slate-400 mt-2">{when}</div> : null}
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => togglePinned(n.id)}
                            className={`transition-colors mt-1 ${pinnedNoteId === n.id ? 'text-violet-600' : 'text-slate-400 hover:text-slate-600'}`}
                            title={pinnedNoteId === n.id ? 'Remover destaque' : 'Destacar para a próxima sessão'}
                            aria-pressed={pinnedNoteId === n.id}
                            disabled={busy}
                          >
                            <Star size={18} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteNote(n.id)}
                            className="text-slate-400 hover:text-red-500 transition-colors"
                            title="Apagar"
                            disabled={busy}
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setHistoryModalOpen(false)} className="flex-1" disabled={busy}>
                  Fechar
                </Button>
                <Button
                  onClick={() => {
                    setHistoryModalOpen(false);
                    setNoteModalOpen(true);
                  }}
                  className="flex-1"
                  icon={Plus}
                  disabled={busy}
                >
                  Nova
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
