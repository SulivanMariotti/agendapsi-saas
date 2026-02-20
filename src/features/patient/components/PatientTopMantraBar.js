"use client";

import React from "react";
import { Sparkles } from "lucide-react";

/**
 * Mantra fixo no topo do painel do paciente.
 * Intenção clínica (UX): reforçar constância e compromisso sem moralismo.
 */
export default function PatientTopMantraBar() {
  return (
    <div className="rounded-2xl border border-violet-100 bg-white shadow-sm px-[var(--pad)] py-2 sm:px-5 sm:py-4">
      <div className="flex items-start gap-2 sm:gap-3">
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-violet-600 text-white flex items-center justify-center shadow-lg shadow-violet-200 shrink-0">
          <Sparkles size={16} />
        </div>

        <div className="min-w-0">
          <div className="text-sm sm:text-base font-extrabold text-slate-900 leading-snug">
            O segredo da terapia é a constância.
          </div>
          <div className="text-[11px] text-slate-600 mt-1 leading-snug sm:hidden">
            Presença sustenta o processo.
          </div>
          <div className="hidden sm:block text-xs sm:text-sm text-slate-600 mt-1 leading-snug">
            Seu horário é um espaço de cuidado — estar presente sustenta o processo.
          </div>
        </div>
      </div>
    </div>
  );
}
