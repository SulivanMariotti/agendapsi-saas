"use client";

import React, { useMemo, useState } from "react";
import { Card, Button } from "../../../components/DesignSystem";
import { AlertTriangle, CheckCircle, ChevronDown, ChevronUp, FileText } from "lucide-react";

/**
 * ContractStatusCard
 *
 * - Exibe o contrato terapêutico (texto em config/global)
 * - Mostra status (pendente / ok)
 * - Quando pendente, fixa um rodapé com ação para aceitar o contrato.
 */
export default function ContractStatusCard({
  contractText,
  needsContractAcceptance,
  currentContractVersion,
  onAcceptContract,
  acceptBusy = false,
  className = "",
}) {
  const [open, setOpen] = useState(false);

  const safeText = useMemo(() => String(contractText || "Contrato não configurado."), [contractText]);

  const toggleLabel = needsContractAcceptance ? "Contrato pendente: toque para ver" : "Ver contrato";

  return (
    <>
      <Card title="Contrato Terapêutico" className={className}>
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 p-3 rounded-xl bg-white shadow-sm hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <FileText size={18} className="text-violet-600" />
              {toggleLabel}
            </div>
            {open ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
          </button>

          <div className="flex items-center justify-between gap-2">
            {needsContractAcceptance ? (
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 text-amber-900 text-xs font-semibold shadow-sm">
                <AlertTriangle size={14} /> Contrato pendente
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-800 text-xs font-semibold shadow-sm">
                <CheckCircle size={14} /> Contrato OK
              </span>
            )}

            <div className="text-[11px] text-slate-400">
              v{Number(currentContractVersion || 1)}
            </div>
          </div>

          {open && (
            <div className="p-3 rounded-xl bg-slate-50 whitespace-pre-wrap text-sm text-slate-700 leading-relaxed shadow-sm">
              {safeText}
            </div>
          )}

          {needsContractAcceptance && (
            <div className="text-xs text-slate-500">
              Seu horário é um espaço de cuidado. A continuidade fortalece o processo.
            </div>
          )}
        </div>
      </Card>

      {/* Rodapé aceitar contrato */}
      {needsContractAcceptance && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-100 p-4">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="text-sm text-slate-600">
              <b className="text-slate-800">Ação necessária:</b> aceite o contrato (v{Number(currentContractVersion || 1)}) para continuar.
            </div>
            <Button
              onClick={onAcceptContract}
              icon={CheckCircle}
              className="sm:w-auto w-full"
              disabled={acceptBusy}
            >
              {acceptBusy ? "Processando..." : "Aceitar contrato"}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
