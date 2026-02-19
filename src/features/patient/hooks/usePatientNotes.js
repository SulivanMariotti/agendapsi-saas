// src/features/patient/hooks/usePatientNotes.js

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Notas do paciente (server-side via API)
 * - Evita permission-denied no client quando rules endurecem.
 * - Mantém o foco clínico: facilitar o registro e levar conteúdo para a sessão.
 */
export function usePatientNotes({ user, onToast }) {
  const [notes, setNotes] = useState([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [notesError, setNotesError] = useState(null);

  const toastRef = useRef(onToast);
  useEffect(() => {
    toastRef.current = onToast;
  }, [onToast]);

  const normalizeNote = (n) => {
    const ms = Number(n?.createdAtMs || 0);
    return {
      id: n?.id,
      content: String(n?.content || ""),
      createdAtMs: ms,
      updatedAtMs: n?.updatedAtMs ?? null,
      // compat com UI atual (antes usava Timestamp no client)
      createdAt: ms ? { seconds: Math.floor(ms / 1000) } : null,
    };
  };

  const refreshNotes = useCallback(async () => {
    if (!user?.uid) return;

    setLoadingNotes(true);
    setNotesError(null);

    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/patient/notes", {
        method: "GET",
        headers: { authorization: `Bearer ${idToken}` },
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        const msg = data?.error || "Erro ao carregar notas.";
        setNotes([]);
        setNotesError(msg);
        toastRef.current?.(msg, "error");
        return;
      }

      const arr = Array.isArray(data?.notes) ? data.notes.map(normalizeNote) : [];
      setNotes(arr);
    } catch (e) {
      console.error(e);
      const msg = "Erro ao carregar notas.";
      setNotes([]);
      setNotesError(msg);
      toastRef.current?.(msg, "error");
    } finally {
      setLoadingNotes(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    refreshNotes();
  }, [user?.uid, refreshNotes]);

  const saveNote = useCallback(
    async (content) => {
      const c = String(content || "").trim();
      if (!c) return;

      const idToken = await user.getIdToken();
      const res = await fetch("/api/patient/notes", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ content: c }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Erro ao salvar nota.");

      await refreshNotes();
    },
    [user?.uid, refreshNotes]
  );

  const deleteNote = useCallback(
    async (id) => {
      const noteId = String(id || "").trim();
      if (!noteId) return;

      const idToken = await user.getIdToken();
      const res = await fetch(`/api/patient/notes/${encodeURIComponent(noteId)}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${idToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Erro ao apagar nota.");

      await refreshNotes();
    },
    [user?.uid, refreshNotes]
  );

  const hasNotes = useMemo(() => (notes || []).length > 0, [notes]);

  return { notes, hasNotes, loadingNotes, notesError, refreshNotes, saveNote, deleteNote };
}
