// src/features/patient/hooks/usePatientAppointments.js

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Carrega a agenda do paciente via API (server-side / Admin SDK).
 *
 * Motivo clínico (UX): elimina "permission-denied" e garante que o paciente
 * sempre visualize a agenda — reduzir fricção aumenta constância.
 */
export function usePatientAppointments({ db, user, effectivePhone, loadingProfile, onToast }) {
  const [appointmentsRaw, setAppointmentsRaw] = useState([]);
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
          toastRef.current?.("Erro ao carregar agenda.", "error");
        } else {
          const list = Array.isArray(data.appointments) ? data.appointments : [];
          setAppointmentsRaw(list);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setAppointmentsRaw([]);
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
    return (appointmentsRaw || []).filter((a) => String(a.status || "").toLowerCase() !== "cancelled");
  }, [appointmentsRaw]);

  return { appointmentsRaw, appointments, loadingAppointments };
}
