"use client";

import React from "react";
import { Card } from "../../../components/DesignSystem";
import { User, Phone } from "lucide-react";

/**
 * PatientContactCard
 * - Centraliza identificação do paciente (nome + telefone)
 * - Evita duplicidades espalhadas no PatientFlow
 */
export default function PatientContactCard({
  patientName,
  patientPhoneDisplay,
  subtitle = "Seu contato",
}) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-4 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-violet-950/95 text-white flex items-center justify-center shadow-lg shadow-black/10 shrink-0">
            <User size={20} />
          </div>

          <div className="min-w-0">
            <div className="text-xs text-slate-400 uppercase tracking-wider">{subtitle}</div>

            <div className="mt-2 space-y-1">
              <div className="text-sm font-bold text-slate-900 flex items-center gap-2 truncate">
                <User size={14} className="text-slate-400" />
                <span className="text-slate-700 truncate">{patientName || "Paciente"}</span>
              </div>

              <div className="text-sm font-bold text-slate-900 flex items-center gap-2 truncate">
                <Phone size={14} className="text-slate-400" />
                <span className="text-slate-700 truncate">{patientPhoneDisplay || "Telefone não informado"}</span>
              </div>
            </div>

            <div className="mt-3 text-xs text-slate-500 leading-relaxed">
              Se precisar ajustar seu horário, fale diretamente com a clínica. Seu espaço de cuidado é importante — manter
              a constância faz diferença no processo.
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
