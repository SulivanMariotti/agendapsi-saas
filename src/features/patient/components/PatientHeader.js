"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../../components/DesignSystem";
import { LogOut, FileText, X, Phone, BookOpen, Menu } from "lucide-react";
import { formatPhoneBR } from "../lib/phone";
import PatientLibraryModal from "./PatientLibraryModal";

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
  const [libraryOpen, setLibraryOpen] = useState(false);

  const btnMenuRef = useRef(null);
  const btnCloseRef = useRef(null);

  const safeContractText = useMemo(
    () => String(contractText || "Contrato não configurado."),
    [contractText]
  );

  const contractStatusLabel = needsContractAcceptance ? "Pendente" : "OK";
  const contractStatusClass = needsContractAcceptance
    ? "bg-amber-50 text-amber-900 border-amber-100"
    : "bg-emerald-50 text-emerald-800 border-emerald-100";

  function closeMobileMenu() {
    setMobileMenuOpen(false);
    // devolve o foco para o botão que abriu o menu (acessibilidade)
    window.requestAnimationFrame(() => {
      btnMenuRef.current?.focus?.();
    });
  }


  // Permite abrir ações do header a partir de outros componentes (ex.: bottom nav no mobile)
  useEffect(() => {
    function openMenu() {
      setMobileMenuOpen(true);
    }
    function openLibrary() {
      setMobileMenuOpen(false);
      setLibraryOpen(true);
    }
    function openContract() {
      setMobileMenuOpen(false);
      setContractOpen(true);
    }

    window.addEventListener("lp:patient:openMenu", openMenu);
    window.addEventListener("lp:patient:openLibrary", openLibrary);
    window.addEventListener("lp:patient:openContract", openContract);

    return () => {
      window.removeEventListener("lp:patient:openMenu", openMenu);
      window.removeEventListener("lp:patient:openLibrary", openLibrary);
      window.removeEventListener("lp:patient:openContract", openContract);
    };
  }, []);

  // UX mobile: trava scroll do body quando o drawer estiver aberto
  useEffect(() => {
    if (!mobileMenuOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // foca o botão "Fechar"
    window.requestAnimationFrame(() => {
      btnCloseRef.current?.focus?.();
    });

    function onKeyDown(e) {
      if (e.key === "Escape") closeMobileMenu();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobileMenuOpen]);

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
                Telefone
              </span>
              <span className="font-semibold text-slate-900">{formatPhoneBR(patientPhone)}</span>
            </div>
          ) : null}
        </div>

        {/* Desktop actions */}
        <div className="hidden sm:flex gap-2">
          <Button onClick={() => setLibraryOpen(true)} variant="secondary" icon={BookOpen}>
            Biblioteca
          </Button>

          <Button onClick={() => setContractOpen(true)} variant="secondary" icon={FileText}>
            Contrato
          </Button>

          <Button
            onClick={onLogout}
            variant="secondary"
            icon={LogOut}
            className="text-slate-900 hover:text-slate-900"
          >
            Sair
          </Button>
        </div>

        {/* Mobile drawer menu */}
        {/* Mobile drawer menu */}
        <div className="sm:hidden">
          <button
            ref={btnMenuRef}
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-controls="patient-mobile-drawer"
            aria-expanded={mobileMenuOpen ? "true" : "false"}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all duration-200 active:scale-95 cursor-pointer text-sm bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-800 shadow-sm"
          >
            <Menu size={18} className="text-slate-700" />
            Menu
          </button>
        </div>

      </div>

      {/* Drawer mobile (off-canvas) */}
      {mobileMenuOpen && (
        <div
          id="patient-mobile-drawer"
          className="fixed inset-0 z-40"
          aria-hidden={mobileMenuOpen ? "false" : "true"}
        >
          {/* Overlay */}
          <button
            className="absolute inset-0 bg-slate-900/40"
            aria-label="Fechar menu"
            onClick={closeMobileMenu}
          />

          {/* Panel */}
          <div
            role="dialog"
            aria-modal="true"
            className="absolute right-0 top-0 h-full w-[min(86vw,340px)] bg-white border-l border-slate-100 shadow-2xl flex flex-col"
            style={{
              paddingTop: "calc(16px + env(safe-area-inset-top))",
              paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
            }}
          >
            <div className="px-4 pb-4 border-b border-slate-100 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-extrabold text-slate-900">Menu</div>
                <div className="text-xs text-slate-500">
                  Seu horário é um espaço de cuidado — a constância sustenta o processo.
                </div>
              </div>

              <button
                ref={btnCloseRef}
                className="p-2 rounded-xl hover:bg-slate-50 text-slate-600"
                onClick={closeMobileMenu}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-3 flex-1 overflow-auto">
              <button
                className="w-full text-left px-4 py-3 text-sm text-slate-800 font-semibold hover:bg-slate-50 rounded-xl flex items-center gap-2"
                onClick={() => {
                  closeMobileMenu();
                  setLibraryOpen(true);
                }}
              >
                <BookOpen size={16} className="text-slate-600" /> Biblioteca
              </button>

              <button
                className="mt-1 w-full text-left px-4 py-3 text-sm text-slate-800 font-semibold hover:bg-slate-50 rounded-xl flex items-center gap-2"
                onClick={() => {
                  closeMobileMenu();
                  setContractOpen(true);
                }}
              >
                <FileText size={16} className="text-slate-600" /> Contrato
              </button>

              <div className="mt-4 px-4 py-3 rounded-2xl border border-slate-100 bg-slate-50 text-xs text-slate-600 leading-relaxed">
                Quando você vem, você não “cumpre uma agenda” — você sustenta um processo.
                Se estiver difícil comparecer, isso é um dado importante para ser levado para a sessão.
              </div>
            </div>

            <div className="px-4 pt-3 border-t border-slate-100">
              <Button
                onClick={() => {
                  closeMobileMenu();
                  onLogout();
                }}
                variant="secondary"
                icon={LogOut}
                className="w-full justify-center"
              >
                Sair
              </Button>
            </div>
          </div>
        </div>
      )}

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
                  <span
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold ${contractStatusClass}`}
                  >
                    {contractStatusLabel}
                  </span>
                  <div className="text-[11px] text-slate-400">v{Number(currentContractVersion || 1)}</div>
                </div>

                <div className="max-h-[60vh] overflow-auto p-3 border border-slate-100 rounded-xl bg-slate-50 whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">
                  {safeContractText}
                </div>

                <div className="text-xs text-slate-500">
                  Ler o contrato ajuda a sustentar o compromisso com o processo. Faltar não é “só”
                  perder uma hora — é interromper o ritmo de evolução. A constância é parte do cuidado.
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

      {/* Modal: Biblioteca (psicoeducação) */}
      <PatientLibraryModal open={libraryOpen} onClose={() => setLibraryOpen(false)} />
    </>
  );
}
