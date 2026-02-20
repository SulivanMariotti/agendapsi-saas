"use client";

import React from "react";
import NextSessionCard from "./NextSessionCard";
import PatientAgendaCard from "./PatientAgendaCard";

/**
 * PatientSessionsCard
 * - Agrupa "Próximo atendimento" + "Agenda" em um único componente para reduzir complexidade do PatientFlow
 * - Mantém mensagem clínica sutil sobre constância (sem criar fricção)
 */
export default function PatientSessionsCard({
  // Próximo atendimento
  nextAppointment,
  nextLabel,
  nextStatusChip,
  nextServiceLabel,
  nextPlaceLabel,
  nextMeta,
  confirmBusy,
  confirmedLoading,
  onConfirmPresence,

  // Agenda
  appointments,
  appointmentsRaw,
  loading,
  confirmedIds,

  // UX
  showConsistencyHint = true,
}) {
  return (
    <div className="space-y-2 sm:space-y-3">
      <NextSessionCard
        nextAppointment={nextAppointment}
        nextLabel={nextLabel}
        nextStatusChip={nextStatusChip}
        nextServiceLabel={nextServiceLabel}
        nextPlaceLabel={nextPlaceLabel}
        nextMeta={nextMeta}
        confirmBusy={confirmBusy}
        confirmedLoading={confirmedLoading}
        onConfirmPresence={onConfirmPresence}
      />

      {showConsistencyHint && (
        <>
          {/* Mobile: evita “empurrar” a Próxima Sessão para baixo.
              Desktop: mantém o lembrete clínico sutil. */}
          <div className="hidden sm:block px-1 text-[12px] leading-relaxed text-slate-600">
            Seu horário é um espaço sagrado de cuidado. A constância sustenta o processo.
          </div>
        </>
      )}

      <PatientAgendaCard
        appointments={appointments}
        appointmentsRaw={appointmentsRaw}
        loading={loading}
        confirmedIds={confirmedIds}
      />
    </div>
  );
}
