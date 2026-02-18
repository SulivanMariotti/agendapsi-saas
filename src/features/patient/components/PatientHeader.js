"use client";

import React, { useMemo, useState } from "react";
import { Button } from "../../../components/DesignSystem";
import { LogOut, FileText, X, Phone } from "lucide-react";
import { formatPhoneBR } from "../lib/phone";

export default function PatientHeader({
  patientName,
  patientPhone,
  onLogout,

  // Contrato (leitura futura no menu)
  contractText,
  needsContractAcceptance,
  currentContractVersion,
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [contractOpen, setContractOpen] = useState(false);

  const safeContractText = useMemo(
    () => String(contractText || "Contrato não configurado."),
    [contractText]
  );

  const contractStatusLabel = needsContractAcceptance ? "Pendente" : "OK";
  const contractStatusClass = needsContractAcceptance
    ? "bg-amber-50 text-amber-900 border-amber-100"
    : "bg-emerald-50 text-emerald-800 border-emerald-100";

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-slate-400 uppercase tracking-wider">Área do Paciente</div>
          <div className="text-lg font-extrabold text-slate-900 truncate">{patientName}</div>

          {patientPhone ? (
            <div className="mt-2 inline-flex items-center gap-2.5 text-xs px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-800 shadow-sm">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-100">
                <Phone size={14} className="text-violet-600" />
                WhatsApp
              </span>
              <span className="font-semibold text-slate-900">{formatPhoneBR(patientPhone)}</span>
            </div>
          ) : null}
        </div>

        {/* Desktop actions */}
        <div className="hidden sm:flex gap-2">

          <Button onClick={() => setContractOpen(true)} variant="secondary" icon={FileText}>
            Contrato
          </Button>

          <Button onClick={onLogout} variant="secondary" icon={LogOut} className="text-slate-900 hover:text-slate-900">
            Sair
          </Button>
        </div>

        {/* Mobile menu */}
        <div className="sm:hidden relative">
          <Button variant="secondary" onClick={() => setMobileMenuOpen((v) => !v)}>
            Menu
          </Button>

          {mobileMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-100 rounded-2xl shadow-xl overflow-hidden z-30">

              <button
                className="w-full text-left px-4 py-3 text-sm text-slate-800 font-medium hover:bg-slate-50 flex items-center gap-2"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setContractOpen(true);
                }}
              >
                <FileText size={16} className="text-slate-600" /> Contrato
              </button>

              <button
                className="w-full text-left px-4 py-3 text-sm text-slate-900 font-semibold hover:bg-slate-50 flex items-center gap-2"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onLogout();
                }}
              >
                <LogOut size={16} className="text-slate-900" /> Sair
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal: leitura do contrato (sempre disponível) */}
      {contractOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setContractOpen(false)}
          />
          <div className="absolute inset-0 flex items-end sm:items-center justify-center p-4">
            <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-extrabold text-slate-900">Contrato Terapêutico</div>
                  <div className="text-xs text-slate-500">
                    Um espaço de cuidado que se fortalece na continuidade.
                  </div>
                </div>

                <button
                  className="p-2 rounded-xl hover:bg-slate-50 text-slate-600"
                  onClick={() => setContractOpen(false)}
                  aria-label="Fechar"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold ${contractStatusClass}`}>
                    {contractStatusLabel}
                  </span>
                  <div className="text-[11px] text-slate-400">v{Number(currentContractVersion || 1)}</div>
                </div>

                <div className="max-h-[60vh] overflow-auto p-3 border border-slate-100 rounded-xl bg-slate-50 whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">
                  {safeContractText}
                </div>

                <div className="text-xs text-slate-500">
                  Ler o contrato ajuda a sustentar o compromisso com o processo.
                  Faltar não é “só” perder uma hora — é interromper o ritmo de evolução. A constância é parte do cuidado.
                </div>
              </div>

              <div className="px-5 py-4 border-t border-slate-100 flex justify-end">
                <Button variant="secondary" onClick={() => setContractOpen(false)}>
                  Fechar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
