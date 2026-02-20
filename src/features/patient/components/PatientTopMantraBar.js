"use client";

import React from "react";
import { Sparkles } from "lucide-react";
import { PT } from "../lib/uiTokens";

/**
 * Mantra fixo no topo do painel do paciente.
 * Intenção clínica (UX): reforçar constância e compromisso sem moralismo.
 */
export default function PatientTopMantraBar() {
  return (
    <div className={`rounded-2xl ${PT.card} px-[var(--pad)] py-2 sm:px-5 sm:py-4`}>
      <div className="flex items-start gap-2 sm:gap-3">
        <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl ${PT.accentBg} flex items-center justify-center shadow-sm shrink-0`}>
          <Sparkles size={16} />
        </div>

        <div className="min-w-0">
          <div className={`text-sm sm:text-base font-extrabold ${PT.textPrimary} leading-snug`}>
            O segredo da terapia é a constância.
          </div>
          <div className={`text-[11px] ${PT.textSecondary} mt-1 leading-snug sm:hidden`}>
            Presença sustenta o processo.
          </div>
          <div className={`hidden sm:block text-xs sm:text-sm ${PT.textSecondary} mt-1 leading-snug`}>
            Seu horário é um espaço de cuidado — estar presente sustenta o processo.
          </div>
        </div>
      </div>
    </div>
  );
}
