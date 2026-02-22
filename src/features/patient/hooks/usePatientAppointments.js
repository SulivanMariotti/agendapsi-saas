// src/features/patient/hooks/usePatientAppointments.js

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Carrega a agenda do paciente via API (server-side / Admin SDK).
 *
 * Motivo clínico (UX): elimina "permission-denied" e garante que o paciente
 * sempre visualize a agenda — reduzir fricção aumenta constância.
 */
const PATIENT_WINDOW_DAYS = 32;

export function usePatientAppointments({ db, user, effectivePhone, loadingProfile, onToast }) {
  const [appointmentsRaw, setAppointmentsRaw] = useState([]);
  const [meta, setMeta] = useState({ lastSyncAt: null });
  const [loadingAppointments, setLoadingAppointments] = useState(true);

  const toastRef = useRef(onToast);
  useEffect(() => {
    toastRef.current = onToast;
  }, [onToast]);

  useEffect(() => {
    if (!user?.uid) return;
    if (loadingProfile) return;

    setLoadingAppointments(true);

    let cancelled = false;

    (async () => {
      try {
        const idToken = await user.getIdToken();

        // DEV: o effectivePhone pode ser um telefone "impersonado" no painel dev.
        // O server ignora em produção; fora de produção, ajuda a testar sem mexer em regras.
        const qs = effectivePhone ? `?phone=${encodeURIComponent(String(effectivePhone))}` : "";

        const res = await fetch(`/api/patient/appointments${qs}`, {
          method: "GET",
          headers: { authorization: `Bearer ${idToken}` },
        });

        const data = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (!res.ok || !data?.ok) {
          setAppointmentsRaw([]);
          setMeta({ lastSyncAt: null });
          toastRef.current?.("Erro ao carregar agenda.", "error");
        } else {
          const list = Array.isArray(data.appointments) ? data.appointments : [];
          setAppointmentsRaw(list);
          setMeta({ lastSyncAt: data?.meta?.lastSyncAt ?? null });
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setAppointmentsRaw([]);
          setMeta({ lastSyncAt: null });
          toastRef.current?.("Erro ao carregar agenda.", "error");
        }
      } finally {
        if (!cancelled) setLoadingAppointments(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [db, user?.uid, loadingProfile, effectivePhone]);

  const appointments = useMemo(() => {
    const nowMs = Date.now();
    const endMs = nowMs + PATIENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

    return (appointmentsRaw || []).filter((a) => {
      const status = String(a?.status || "").toLowerCase();
      if (status === "cancelled" || status === "done") return false;

      const ms = Number(a?.startAt);
      if (Number.isFinite(ms)) return ms >= nowMs - 2 * 60 * 60 * 1000 && ms <= endMs;

      const iso = String(a?.isoDate || a?.date || "").trim();
      const t = String(a?.time || "").trim();
      if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        const dt = new Date(`${iso}T${t ? `${t}:00` : "00:00:00"}`);
        const p = dt?.getTime?.();
        if (Number.isFinite(p)) return p >= nowMs - 2 * 60 * 60 * 1000 && p <= endMs;
      }

      return true;
    });
  }, [appointmentsRaw]);
  return { appointmentsRaw, appointments, loadingAppointments, meta };
}
