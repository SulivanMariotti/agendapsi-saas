"use client";

import React, { useEffect, useMemo, useState } from "react";
import PatientHeader from "../../features/patient/components/PatientHeader";
import PatientSessionsCard from "../../features/patient/components/PatientSessionsCard";
import PatientNotificationsCard from "../../features/patient/components/PatientNotificationsCard";
import PatientNotesCard from "../../features/patient/components/PatientNotesCard";
import ContractStatusCard from "../../features/patient/components/ContractStatusCard";
import PatientTopMantraBar from "../../features/patient/components/PatientTopMantraBar";
import PatientMantraCard from "../../features/patient/components/PatientMantraCard";
import {
  app,
  db } from "../../app/firebase";
import { doc,
  getDoc,
  onSnapshot,
  updateDoc,
  setDoc } from "firebase/firestore";

import { Toast } from "../DesignSystem";
import { onlyDigits, toCanonical, normalizeWhatsappPhone } from "../../features/patient/lib/phone";
import { brDateParts, addMinutes, relativeLabelForDate, formatDateTimeBR } from "../../features/patient/lib/dates";
import { makeIcsDataUrl, startDateTimeFromAppointment } from "../../features/patient/lib/ics";

import { prettyServiceLabel, getServiceTypeFromAppointment, getLocationFromAppointment, statusChipFor } from "../../features/patient/lib/appointments";

import { useAppointmentsLastSync } from "../../features/patient/hooks/useAppointmentsLastSync";
import { usePatientAppointments } from "../../features/patient/hooks/usePatientAppointments";
import { usePatientNotes } from "../../features/patient/hooks/usePatientNotes";
import { usePushStatus } from "../../features/patient/hooks/usePushStatus";

// 🔹 Normaliza Timestamp/Date/string → millis

export default function PatientFlow({ user, onLogout, globalConfig, showToast: showToastFromProps }) {
  
  // STEP42: o paciente não acessa a coleção subscribers no client
  const subscribers = null;
const [profile, setProfile] = useState(null);

  const [loadingProfile, setLoadingProfile] = useState(true);

  const [toast, setToast] = useState({ msg: "", type: "success" });
  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    if (typeof showToastFromProps === "function") showToastFromProps(msg, type);
  };

  const [confirmBusy, setConfirmBusy] = useState(false);

  const [acceptContractBusy, setAcceptContractBusy] = useState(false);

  const [confirmedIds, setConfirmedIds] = useState(() => new Set());
  const [confirmedLoading, setConfirmedLoading] = useState(false);

  const cleanPhoneFromProfile = useMemo(() => {
    const p = profile?.phone || profile?.phoneNumber || "";
    return onlyDigits(p);
  }, [profile]);

// Fallback: se o phone não veio no users/{uid}, resolve via API server-side (Admin SDK)
// Motivo: o paciente não deve consultar `subscribers` no client, e o fallback anterior
// estava quebrado (variável `snap` inexistente), causando ausência de telefone e falhas
// de leitura em `appointments` por regras.
const [resolvedPhone, setResolvedPhone] = useState("");

useEffect(() => {
  let cancelled = false;

  async function resolve() {
    const fromProfile = cleanPhoneFromProfile;
    if (fromProfile) {
      if (!cancelled) setResolvedPhone(fromProfile);
      return;
    }

    if (!user?.uid) return;

    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/patient/resolve-phone", {
        method: "GET",
        headers: { authorization: `Bearer ${idToken}` },
      });
      const data = await res.json().catch(() => ({}));
      const clean = toCanonical((data?.phoneCanonical || data?.phone || "") );
      if (!clean) return;

      if (!cancelled) setResolvedPhone(clean);

      // tenta gravar no perfil para evitar esse fallback no futuro
      try {
        await setDoc(
          doc(db, "users", user.uid),
          { phone: clean, phoneNumber: clean, phoneCanonical: clean, updatedAt: new Date() },
          { merge: true }
        );
      } catch (_) {
        // sem impacto: pode falhar por regras
      }
    } catch (_) {
      // silencioso
    }
  }

  resolve();
  return () => {
    cancelled = true;
  };
}, [cleanPhoneFromProfile, user?.uid]);

  const effectivePhone = useMemo(() => {
    return toCanonical(resolvedPhone || cleanPhoneFromProfile);
  }, [resolvedPhone, cleanPhoneFromProfile]);

  const currentContractVersion = Number(globalConfig?.contractVersion || 1);
  const acceptedVersion = Number(profile?.contractAcceptedVersion || 0);
  const needsContractAcceptance = currentContractVersion > acceptedVersion;

  const clinicWhatsappPhone = useMemo(() => normalizeWhatsappPhone(globalConfig?.whatsapp || ""), [globalConfig?.whatsapp]);
  const contractText = String(globalConfig?.contractText || "Contrato não configurado.");

  const patientName = profile?.name || user?.displayName || "Paciente";

  // Step 9.2: hooks por domínio (agenda, notas, push, last-sync)
  const { appointmentsLastSyncAt } = useAppointmentsLastSync({ user });
  const { notifHasToken, setNotifHasToken } = usePushStatus({ user, effectivePhone });

  const { appointmentsRaw, appointments, loadingAppointments } = usePatientAppointments({
    db,
    user,
    effectivePhone,
    loadingProfile,
    onToast: showToast,
  });

  const phoneForNote = (resolvedPhone || cleanPhoneFromProfile) || "";
  const { notes, loadingNotes, saveNote, deleteNote } = usePatientNotes({
    db,
    user,
    phoneForNote,
    onToast: showToast,
  });
  // Perfil
  useEffect(() => {
    if (!user?.uid) return;

    let cancelled = false;
    let unsub = null;

    (async () => {
      try {
        setLoadingProfile(true);
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);

        if (!snap.exists()) {
          // ✅ Segurança: o perfil (users/{uid}) é criado pelo Admin (whitelist).
          // Se não existe, orienta o paciente a contatar a clínica.
          showToast("Seu acesso ainda não foi liberado. Peça à clínica para atualizar seu cadastro.", "error");
        } else {
          await setDoc(userRef, { lastSeen: new Date() }, { merge: true });
        }

        if (cancelled) return;

        unsub = onSnapshot(
          userRef,
          (docSnap) => {
            if (docSnap.exists()) setProfile({ id: docSnap.id, ...docSnap.data() });
            else setProfile(null);
            setLoadingProfile(false);
          },
          (err) => {
            console.error(err);
            setLoadingProfile(false);
            showToast("Erro ao carregar perfil.", "error");
          }
        );
      } catch (e) {
        console.error(e);
        setLoadingProfile(false);
        showToast("Erro ao inicializar perfil.", "error");
      }
    })();

    return () => {
      cancelled = true;
      if (typeof unsub === "function") unsub();
    };
  }, [user?.uid, user?.email, user?.displayName]);

  // Confirmed via API
  useEffect(() => {
    if (!user?.uid) return;

    let cancelled = false;

    (async () => {
      try {
        setConfirmedLoading(true);
        const idToken = await user.getIdToken();
        const res = await fetch("/api/attendance/confirmed", {
          method: "GET",
          headers: { authorization: `Bearer ${idToken}` },
        });
        const data = await res.json().catch(() => ({}));

        if (cancelled) return;

        if (!res.ok || !data?.ok) {
          setConfirmedIds(new Set());
          return;
        }

        const ids = Array.isArray(data.appointmentIds) ? data.appointmentIds.map(String) : [];
        setConfirmedIds(new Set(ids));
      } catch (e) {
        console.error(e);
        if (!cancelled) setConfirmedIds(new Set());
      } finally {
        if (!cancelled) setConfirmedLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  // Notas

  const handleAcceptContract = async () => {
    try {
      if (!user?.uid) return;
      if (acceptContractBusy) return;

      setAcceptContractBusy(true);

      await updateDoc(doc(db, "users", user.uid), {
        contractAcceptedVersion: currentContractVersion,
        contractAcceptedAt: new Date(),
      });

      showToast("Contrato aceito com sucesso!", "success");
    } catch (e) {
      console.error(e);
      showToast("Erro ao aceitar contrato.", "error");
    } finally {
      setAcceptContractBusy(false);
    }
  };

  // Próximo atendimento
  const nextAppointment = useMemo(() => {
    const now = new Date();
    const list = (appointments || [])
      .map((a) => {
        const dt = startDateTimeFromAppointment(a);
        return { a, ts: dt ? dt.getTime() : Number.POSITIVE_INFINITY };
      })
      .filter((x) => Number.isFinite(x.ts))
      .sort((x, y) => x.ts - y.ts);

    const upcoming = list.find((x) => x.ts >= now.getTime());
    return upcoming?.a || (list[0]?.a ?? null);
  }, [appointments]);

  const nextMeta = useMemo(() => {
    if (!nextAppointment) return { label: null, wa: null, waDisabled: true, ics: null };

    const dt = startDateTimeFromAppointment(nextAppointment);
    const label = relativeLabelForDate(dt);

    let wa = null;
    let waDisabled = true;

    if (clinicWhatsappPhone) {
      const dateLabel = brDateParts(nextAppointment.isoDate || nextAppointment.date).label;
      const time = String(nextAppointment.time || "").trim();
      const prof = nextAppointment.profissional ? ` com ${nextAppointment.profissional}` : "";
      const serviceLabel = prettyServiceLabel(getServiceTypeFromAppointment(nextAppointment));
      const servicePiece = serviceLabel ? ` (${serviceLabel})` : "";

      const msg =
        `Olá! Sou ${patientName}. ` +
        `Confirmo minha presença no atendimento${prof}${servicePiece} no dia ${dateLabel}${time ? ` às ${time}` : ""}. ` +
        `Estou me organizando para estar presente.`;

      wa = `https://wa.me/${clinicWhatsappPhone}?text=${encodeURIComponent(msg)}`;
      waDisabled = false;
    }

    let ics = null;
    try {
      if (nextAppointment.isoDate && nextAppointment.time) {
        const start = new Date(`${nextAppointment.isoDate}T${nextAppointment.time}:00`);
        const end = addMinutes(start, 50);
        const serviceLabel = prettyServiceLabel(getServiceTypeFromAppointment(nextAppointment));

        ics = makeIcsDataUrl({
          title: serviceLabel ? `Atendimento (${serviceLabel})` : "Atendimento",
          description: `Atendimento ${nextAppointment.profissional ? `com ${nextAppointment.profissional}` : ""}`,
          startISO: start.toISOString(),
          endISO: end.toISOString(),
        });
      }
    } catch (_) {}

    return { label, wa, waDisabled, ics };
  }, [nextAppointment, clinicWhatsappPhone, patientName]);

  async function handleConfirmPresence() {
    if (!nextAppointment || !nextMeta?.wa) return;

    try {
      setConfirmBusy(true);

      const idToken = await user.getIdToken();

      const res = await fetch("/api/attendance/confirm", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          appointmentId: nextAppointment.id,
          phone: effectivePhone || cleanPhoneFromProfile || "",
          channel: "whatsapp",
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        showToast("Não consegui registrar sua confirmação agora, mas você pode confirmar pelo WhatsApp.", "error");
      } else {
        setConfirmedIds((prev) => {
          const n = new Set(prev);
          n.add(String(nextAppointment.id));
          return n;
        });
      }
    } catch (e) {
      console.error(e);
      showToast("Não consegui registrar sua confirmação agora, mas você pode confirmar pelo WhatsApp.", "error");
    } finally {
      setConfirmBusy(false);
      window.open(nextMeta.wa, "_blank", "noreferrer");
    }
  }

  const nextLabel = useMemo(() => {
    const dt = nextAppointment ? startDateTimeFromAppointment(nextAppointment) : null;
    return dt ? relativeLabelForDate(dt) : null;
  }, [nextAppointment]);


  const nextSessionDateTimeLabel = useMemo(() => {
    const dt = nextAppointment ? startDateTimeFromAppointment(nextAppointment) : null;
    return dt ? formatDateTimeBR(dt.getTime()) : null;
  }, [nextAppointment]);


  const nextIsConfirmed = useMemo(() => {
    if (!nextAppointment?.id) return false;
    return confirmedIds.has(String(nextAppointment.id));
  }, [confirmedIds, nextAppointment?.id]);

  const nextStatusChip = useMemo(() => {
    return statusChipFor(nextAppointment?.status, nextIsConfirmed);
  }, [nextAppointment?.status, nextIsConfirmed]);

  const nextServiceLabel = useMemo(() => {
    return prettyServiceLabel(getServiceTypeFromAppointment(nextAppointment));
  }, [nextAppointment]);

  const nextPlaceLabel = useMemo(() => {
    return String(getLocationFromAppointment(nextAppointment) || "").trim();
  }, [nextAppointment]);

  return (
    <>
      {toast?.msg && <Toast message={toast.msg} type={toast.type} onClose={() => setToast({ msg: "" })} />}

      <div className={`min-h-screen bg-slate-50 ${needsContractAcceptance ? "pb-24" : "pb-10"}`}>
        <div className="max-w-5xl mx-auto px-4 pt-4 sm:pt-6 space-y-4 sm:space-y-6">
          {/* Header */}
          <PatientHeader
            patientName={patientName}
            patientPhone={resolvedPhone || cleanPhoneFromProfile}
            onLogout={onLogout}
            contractText={contractText}
            needsContractAcceptance={needsContractAcceptance}
            currentContractVersion={currentContractVersion}
          />

          {/* Mantra fixo (topo) */}
          <PatientTopMantraBar />

          {/* Cards rotativos de reflexão (psicoeducação passiva) */}
          <PatientMantraCard />

          {/* Sessões (prioridade: próxima sessão + agenda) */}
          <PatientSessionsCard
            nextAppointment={nextAppointment}
            nextLabel={nextLabel}
            nextStatusChip={nextStatusChip}
            nextServiceLabel={nextServiceLabel}
            nextPlaceLabel={nextPlaceLabel}
            nextMeta={nextMeta}
            confirmBusy={confirmBusy}
            confirmedLoading={confirmedLoading}
            onConfirmPresence={handleConfirmPresence}
            appointments={appointments}
            appointmentsRaw={appointmentsRaw}
            loading={loadingAppointments}
            confirmedIds={confirmedIds}
          />

          {/* Notificações (compacto, mobile-first) */}
          <PatientNotificationsCard
            app={app}
            user={user}
            notifHasToken={notifHasToken}
            setNotifHasToken={setNotifHasToken}
            showToast={showToast}
          />

          {/* Contrato: quando pendente, mostramos o card de aceite (barreira saudável). 
              Quando OK, o texto segue acessível no menu superior para leitura futura. */}
          {needsContractAcceptance ? (
            <ContractStatusCard
              contractText={contractText}
              needsContractAcceptance={needsContractAcceptance}
              currentContractVersion={currentContractVersion}
              onAcceptContract={handleAcceptContract}
              acceptBusy={acceptContractBusy}
            />
          ) : null}
          {/* Diário */}
          <PatientNotesCard
            patientUid={user?.uid || null}
            notes={notes}
            nextSessionDateTimeLabel={nextSessionDateTimeLabel}
            loadingNotes={loadingNotes}
            saveNote={saveNote}
            deleteNote={deleteNote}
            showToast={showToast}
          />
        </div>
      </div>
    </>
  );
}