"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../../components/DesignSystem";
import { X, Trash2, Loader2, StickyNote, AlertTriangle, CheckCircle2 } from "lucide-react";
import { getAuth } from "firebase/auth";
import { patientApp } from "@/app/firebasePatient";
import { PT } from "../lib/uiTokens";

function fmtDateTime(ms) {
  if (!ms) return "";
  try {
    const d = new Date(ms);
    return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "";
  }
}

export default function PatientNotesModal({ open, onClose }) {
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState([]);
  const [text, setText] = useState("");
  const [toast, setToast] = useState(null);

  const closeBtnRef = useRef(null);
  const inputRef = useRef(null);

  const canSave = useMemo(() => text.trim().length > 0 && text.trim().length <= 2000, [text]);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    window.clearTimeout(window.__ap_notes_toast);
    window.__ap_notes_toast = window.setTimeout(() => setToast(null), 2500);
  };

  const fetchNotes = async () => {
    const auth = getAuth(patientApp);
    const user = auth.currentUser;
    if (!user) return;

    setBusy(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/paciente/notes?limit=50", {
        method: "GET",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Falha ao carregar.");
      setNotes(Array.isArray(data.notes) ? data.notes : []);
    } catch (e) {
      showToast(e?.message || "Falha ao carregar anotações.", "error");
    } finally {
      setBusy(false);
    }
  };

  const saveNote = async () => {
    const auth = getAuth(patientApp);
    const user = auth.currentUser;
    if (!user) return;

    const clean = text.trim();
    if (!clean) return;

    setSaving(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/paciente/notes", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: clean }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Falha ao salvar.");
      setText("");
      showToast("Anotação salva.", "success");
      await fetchNotes();
      window.requestAnimationFrame(() => inputRef.current?.focus?.());
    } catch (e) {
      showToast(e?.message || "Falha ao salvar anotação.", "error");
    } finally {
      setSaving(false);
    }
  };

  const deleteNote = async (noteId) => {
    const auth = getAuth(patientApp);
    const user = auth.currentUser;
    if (!user) return;

    if (!noteId) return;
    const ok = window.confirm("Remover esta anotação? (Você poderá registrar outra quando quiser.)");
    if (!ok) return;

    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/paciente/notes?noteId=${encodeURIComponent(noteId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Falha ao remover.");
      showToast("Anotação removida.", "success");
      await fetchNotes();
    } catch (e) {
      showToast(e?.message || "Falha ao remover anotação.", "error");
    }
  };

  // abrir: carrega notas + foco
  useEffect(() => {
    if (!open) return;
    fetchNotes();
    window.requestAnimationFrame(() => {
      closeBtnRef.current?.focus?.();
      inputRef.current?.focus?.();
    });
  }, [open]);

  // ESC fecha
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        className="absolute inset-0 bg-slate-900/40"
        aria-label="Fechar"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        className="absolute left-1/2 top-1/2 w-[min(92vw,820px)] -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${PT.surfaceSoft}`}>
              <StickyNote className="w-5 h-5 text-violet-950" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-slate-900">Anotações</div>
              <div className="text-[12px] text-slate-500 leading-snug">
                Use este espaço para registrar algo importante para você.
              </div>
            </div>
          </div>

          <Button ref={closeBtnRef} onClick={onClose} variant="ghost" icon={X}>
            Fechar
          </Button>
        </div>

        {/* Body */}
        <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Editor */}
          <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm p-4`}>
            <div className="text-sm font-extrabold text-slate-900">Nova anotação</div>
            <div className="text-[12px] text-slate-500 mt-1">
              Até 2000 caracteres. Evite dados sensíveis desnecessários.
            </div>

            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              className={[
                "mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900",
                PT.focusRingVisible,
              ].join(" ")}
              placeholder="Escreva aqui..."
            />

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="text-[12px] text-slate-500">
                {text.trim().length}/2000
              </div>
              <Button
                onClick={saveNote}
                disabled={!canSave || saving}
                icon={saving ? Loader2 : null}
              >
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>

          {/* List */}
          <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm p-4`}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-extrabold text-slate-900">Suas anotações</div>
              <Button onClick={fetchNotes} variant="secondary" disabled={busy}>
                Atualizar
              </Button>
            </div>

            {busy ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-slate-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                Carregando...
              </div>
            ) : notes.length === 0 ? (
              <div className="mt-4 text-sm text-slate-600">
                Você ainda não registrou anotações.
              </div>
            ) : (
              <div className="mt-4 space-y-3 max-h-[46vh] overflow-auto pr-1">
                {notes.map((n) => (
                  <div key={n.id} className={`rounded-2xl border border-slate-200 bg-white px-3 py-3`}>
                    <div className="text-[12px] text-slate-500 flex items-center justify-between gap-3">
                      <span>{fmtDateTime(n.createdAt)}</span>
                      <button
                        type="button"
                        className={`text-slate-500 hover:text-slate-900 ${PT.focusRingVisible} rounded-lg p-1`}
                        onClick={() => deleteNote(n.id)}
                        aria-label="Remover anotação"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="mt-2 text-sm text-slate-900 whitespace-pre-wrap">{n.text}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Toast */}
        {toast ? (
          <div className="px-4 pb-4">
            <div
              className={[
                "w-full rounded-2xl px-3 py-2 text-sm flex items-start gap-2",
                toast.type === "error" ? "bg-amber-50 border border-amber-200 text-amber-900" : "bg-emerald-50 border border-emerald-200 text-emerald-900",
              ].join(" ")}
            >
              {toast.type === "error" ? <AlertTriangle className="w-4 h-4 mt-0.5" /> : <CheckCircle2 className="w-4 h-4 mt-0.5" />}
              <div className="min-w-0">{toast.message}</div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
