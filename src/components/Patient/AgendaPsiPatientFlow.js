"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Calendar, Menu } from "lucide-react";

import { Toast } from "../DesignSystem";

import PatientTopAppBar from "../../features/patient/components/PatientTopAppBar";
import PatientHeader from "../../features/patient/components/PatientHeader";
import PatientTopMantraBar from "../../features/patient/components/PatientTopMantraBar";
import PatientMantraCard from "../../features/patient/components/PatientMantraCard";
import PatientSessionsCard from "../../features/patient/components/PatientSessionsCard";
import PatientContactCard from "../../features/patient/components/PatientContactCard";

import { statusChipFor } from "../../features/patient/lib/appointments";
import { formatPhoneBR } from "../../features/patient/lib/phone";
import { relativeLabelForDate } from "../../features/patient/lib/dates";

function norm(v) {
  return String(v ?? "").trim();
}

function toDateFromIso(isoDate, startTime) {
  const iso = norm(isoDate);
  if (!iso) return null;
  const t = norm(startTime);
  // usa horário local (suficiente para rótulos "Hoje/Amanhã" no paciente)
  const safeT = /^\d{2}:\d{2}$/.test(t) ? t : "00:00";
  const d = new Date(`${iso}T${safeT}:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function mapAgendaPsiStatusToPatientStatus(status) {
  const s = norm(status).toLowerCase();
  // AgendaPsi: Agendado, Confirmado, Finalizado, Não comparece, Cancelado, Reagendado
  if (s.includes("finaliz")) return "done";
  if (s.includes("não") || s.includes("nao") || s.includes("compare")) return "no_show";
  if (s.includes("cancel")) return "cancelled";
  // "reagendado" ainda aparece como agendado para o paciente (informativo)
  return "scheduled";
}

export default function AgendaPsiPatientFlow({ user, onLogout }) {
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [patient, setPatient] = useState(null);
  const [portal, setPortal] = useState(null);
  const [occurrences, setOccurrences] = useState([]);
  const [activeTenantId, setActiveTenantId] = useState(null);
  const [tenantSuspended, setTenantSuspended] = useState(false);
  const [tenantSuspendedMsg, setTenantSuspendedMsg] = useState("");

  const showToast = (message, type = "success") => setToast({ msg: message, type });

  const loadAgenda = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/paciente/agenda", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        if (data?.code === "TENANT_SUSPENDED" || String(data?.error || "").toLowerCase().includes("tenant-suspended")) {
          setTenantSuspended(true);
          setTenantSuspendedMsg(
            "Este serviço está temporariamente suspenso para sua clínica. Fale com a clínica/suporte para regularizar o acesso."
          );
          throw new Error("tenant-suspended");
        }
        throw new Error(data?.error || "Falha ao carregar agenda.");
      }
      setTenantSuspended(false);
      setTenantSuspendedMsg("");
      setPatient(data.patient || null);
      setPortal(data.portal || null);
      setActiveTenantId(data.tenantId || null);
      setOccurrences(Array.isArray(data.occurrences) ? data.occurrences : []);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      if (String(e?.message || "").toLowerCase().includes("tenant-suspended")) {
        // Mensagem será mostrada na tela dedicada.
      } else {
        showToast(e?.message || "Erro ao carregar.", "error");
      }
    } finally {
      setBusy(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgenda();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const appointments = useMemo(() => {
    if (tenantSuspended) {
    return (
      <>
        {toast?.msg ? (
          <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />
        ) : null}

        <div className="min-h-[100dvh] bg-slate-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-3">
            <div className="text-sm text-slate-500">AgendaPsi</div>
            <h2 className="text-xl font-semibold text-slate-900">Acesso temporariamente suspenso</h2>
            <p className="text-sm text-slate-600">
              {tenantSuspendedMsg ||
                "Este serviço está temporariamente suspenso para sua clínica. Fale com a clínica/suporte para reativar o acesso."}
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  try {
                    loadAgenda();
                  } catch (_) {}
                }}
                className="flex-1 rounded-xl bg-slate-900 text-white py-2.5 text-sm font-medium hover:bg-slate-800 active:bg-slate-900 disabled:opacity-60"
                disabled={busy}
              >
                {busy ? "Verificando…" : "Tentar novamente"}
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="flex-1 rounded-xl bg-white text-slate-900 py-2.5 text-sm font-medium border border-slate-200 hover:bg-slate-50 active:bg-white disabled:opacity-60"
                disabled={busy}
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (occurrences || [])
      .map((o) => ({
        id: o.id,
        isoDate: o.dateIso,
        startTime: o.startTime || "00:00",
        status: mapAgendaPsiStatusToPatientStatus(o.status),
        // campos opcionais (não exibimos dados clínicos)
        profissional: null,
        local: null,
      }))
      .filter((a) => a.isoDate);
  }, [occurrences]);

  const nextAppointment = useMemo(() => (appointments?.length ? appointments[0] : null), [appointments]);

  const nextLabel = useMemo(() => {
    if (!nextAppointment) return null;
    const dt = toDateFromIso(nextAppointment.isoDate, nextAppointment.startTime);
    return dt ? relativeLabelForDate(dt) : null;
  }, [nextAppointment]);

  const nextStatusChip = useMemo(() => {
    if (!nextAppointment) return null;
    const isConfirmed = norm(occurrences?.[0]?.status).toLowerCase().includes("confirm");
    return statusChipFor(nextAppointment.status, isConfirmed);
  }, [nextAppointment, occurrences]);


  const contractText = useMemo(() => portal?.contract?.text || "", [portal]);
  const contractVersion = useMemo(() => Number(portal?.contract?.version || 1), [portal]);
  const needsContractAcceptance = useMemo(() => portal?.contract?.needsAcceptance === true, [portal]);
  const remindersModuleEnabled = useMemo(() => portal?.features?.remindersModuleEnabled !== false, [portal]);
  const remindersEnabled = useMemo(() => {
    if (typeof portal?.remindersEnabled === "boolean") return portal.remindersEnabled;
    if (typeof portal?.features?.remindersEnabled === "boolean") return portal.features.remindersEnabled;
    return false;
  }, [portal]);
  const libraryEnabled = useMemo(() => portal?.features?.libraryEnabled !== false, [portal]);
  const notesEnabled = useMemo(() => portal?.features?.notesEnabled === true, [portal]);
  const showDevTenantBadge = useMemo(() => process.env.NODE_ENV !== "production", []);

  const updatePortal = async (payload) => {
    if (!user) throw new Error("Sessão inválida.");
    const idToken = await user.getIdToken();
    const res = await fetch("/api/paciente/portal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      if (data?.code === "TENANT_SUSPENDED" || String(data?.error || "").toLowerCase().includes("tenant-suspended")) {
        setTenantSuspended(true);
        setTenantSuspendedMsg(
          "Este serviço está temporariamente suspenso para sua clínica. Fale com a clínica/suporte para regularizar o acesso."
        );
        throw new Error("tenant-suspended");
      }
      throw new Error(data?.error || "Falha ao salvar.");
    }
    if (data.portal) setPortal(data.portal);
    return data.portal;
  };

  const handleAcceptContract = async () => {
    setBusy(true);
    try {
      await updatePortal({ action: "acceptContract" });
      showToast("Termo aceito. Obrigado por sustentar seu processo.", "success");
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      if (String(e?.message || "").toLowerCase().includes("tenant-suspended")) {
        // Mensagem será mostrada na tela dedicada.
      } else {
        showToast(e?.message || "Não foi possível salvar.", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleToggleReminders = async (enabled) => {
    setBusy(true);
    try {
      await updatePortal({ action: "setReminders", remindersEnabled: !!enabled });
      showToast(enabled ? "Lembretes ativados." : "Lembretes desativados.", "success");
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      if (String(e?.message || "").toLowerCase().includes("tenant-suspended")) {
        // Mensagem será mostrada na tela dedicada.
      } else {
        showToast(e?.message || "Não foi possível salvar.", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  function scrollToSection(id) {
    try {
      const el = document.getElementById(id);
      el?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    } catch (_) {
      // ignore
    }
  }

  return (
    <>
      {toast?.msg ? (
        <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />
      ) : null}


            {/*
        Mobile: reserva espaço real para o bottom-nav + safe-area (iOS).
        Mantemos a mesma "pegada" do painel do Lembrete Psi (reuso de UI),
        mas com dados do AgendaPsi e sem ações de cancelar/remarcar.
      */}
      <div className={`min-h-[100dvh] bg-slate-50 pb-[calc(env(safe-area-inset-bottom)+7rem)] sm:pb-10`}>
        {/* Top app bar (mobile) */}
        <PatientTopAppBar
          appName="AgendaPsi"
          logoSrc={null}
          onOpenMenu={() => {
            try {
              window.dispatchEvent(new Event("lp:patient:openMenu"));
            } catch (_) {
              // silencioso
            }
          }}
        />

        <div className="max-w-5xl mx-auto px-[var(--pad)] pt-[calc(env(safe-area-inset-top)+64px)] sm:pt-6 space-y-2 sm:space-y-6">
          {showDevTenantBadge && activeTenantId ? (
            <div className="text-[11px] text-slate-500">
              <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-1 font-mono">
                tenantId: {activeTenantId}
              </span>
            </div>
          ) : null}

          {/* Header (menu + sair) */}
          <PatientHeader
            patientName={patient?.fullName || user?.displayName || "Paciente"}
            patientPhone={patient?.phone || ""}
            onLogout={onLogout}
            contractText={contractText}
            needsContractAcceptance={needsContractAcceptance}
            currentContractVersion={contractVersion}
            remindersEnabled={remindersEnabled}
            remindersBusy={busy}
            onToggleReminders={remindersModuleEnabled ? handleToggleReminders : null}
            onAcceptContract={handleAcceptContract}
            showLibrary={libraryEnabled}
            showContract={true}
            showNotes={notesEnabled}
          />
          {/* Seu cadastro (no topo) */}
          <PatientContactCard
            patientName={patient?.fullName || user?.displayName || "Paciente"}
            patientPhoneDisplay={formatPhoneBR(patient?.phone || "") || "Telefone não informado"}
            subtitle={"Seu cadastro"}
          />
{/* Mantra fixo (topo) */}
          <PatientTopMantraBar />

          {/* Cards rotativos de reflexão (psicoeducação passiva) */}
          <PatientMantraCard />

          <div id="lp-section-agenda" />

          {/* Sessões (prioridade: próxima sessão + agenda) */}
          <PatientSessionsCard
            nextAppointment={nextAppointment}
            nextLabel={nextLabel}
            nextStatusChip={nextStatusChip}
            nextServiceLabel={"Sessão"}
            nextPlaceLabel={""}
            nextMeta={null}
            confirmBusy={false}
            confirmedLoading={false}
            onConfirmPresence={null}
            appointments={appointments}
            appointmentsRaw={occurrences}
            agendaMeta={{ lastSyncAt: Date.now() }}
            loading={loading || busy}
            confirmedIds={{}}
            showConsistencyHint={true}
          />

          {/* Contato (mensagem reforça constância, sem CTA de cancelar/remarcar) */}
</div>

        {/* Bottom nav (mobile): navegação rápida */}
        <div className="sm:hidden fixed left-0 right-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/90 backdrop-blur-md shadow-sm">
          <div className="max-w-5xl mx-auto px-[var(--pad)] pt-2 pb-[calc(env(safe-area-inset-bottom)+8px)]">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => scrollToSection("lp-section-agenda")}
                className="min-h-[44px] w-full flex flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-2 text-[11px] font-semibold leading-none active:scale-95 transition bg-violet-950/95 text-white shadow-sm"
              >
                <Calendar size={22} className="text-white" />
                Sessões
              </button>

              <button
                type="button"
                onClick={() => {
                  try {
                    window.dispatchEvent(new Event("lp:patient:openMenu"));
                  } catch (_) {
                    // ignore
                  }
                }}
                className="min-h-[44px] w-full flex flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-2 text-[11px] font-semibold leading-none active:scale-95 transition text-slate-700"
              >
                <Menu size={22} className="text-slate-700" />
                Menu
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
