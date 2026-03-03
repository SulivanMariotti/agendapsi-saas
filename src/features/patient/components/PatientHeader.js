"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../../components/DesignSystem";
import { LogOut, FileText, X, Phone, BookOpen, StickyNote } from "lucide-react";
import { formatPhoneBR } from "../lib/phone";
import { PT } from "../lib/uiTokens";
import PatientLibraryModal from "./PatientLibraryModal";
import PatientNotesModal from "./PatientNotesModal";

export default function PatientHeader({
  patientPhone,
  onLogout,

  // Preferências
  remindersEnabled = true,
  remindersBusy = false,
  onToggleReminders,

  // Contrato
  onAcceptContract,

  // Contrato (leitura futura no menu)
  contractText,
  needsContractAcceptance,
  currentContractVersion,

  // AgendaPsi: permite esconder itens que ainda não existem no MVP
  showLibrary = true,
  showContract = true,
  showNotes = false,
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [contractOpen, setContractOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  const btnMenuRef = useRef(null);
  const btnCloseRef = useRef(null);

  const safeContractText = useMemo(
    () => String(contractText || "Contrato não configurado."),
    [contractText]
  );

  const contractStatusLabel = needsContractAcceptance ? "Pendente" : "OK";
  const contractStatusClass = needsContractAcceptance ? PT.warn : PT.ok;

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
      if (!showLibrary) return;
      setMobileMenuOpen(false);
      setLibraryOpen(true);
    }
    function openContract() {
      if (!showContract) return;
      setMobileMenuOpen(false);
      setContractOpen(true);
    }

    function openNotes() {
      if (!showNotes) return;
      setMobileMenuOpen(false);
      setNotesOpen(true);
    }

    window.addEventListener("lp:patient:openMenu", openMenu);
    window.addEventListener("lp:patient:openLibrary", openLibrary);
    window.addEventListener("lp:patient:openContract", openContract);
    window.addEventListener("lp:patient:openNotes", openNotes);

  
  function ToggleRow({ label, value, onChange, disabled = false, hint }) {
    const on = !!value;
    return (
      <div className={`w-full px-4 py-3 rounded-xl ${PT.surfaceSoft} flex items-center justify-between gap-3`}>
        <div className="min-w-0">
          <div className="text-sm font-extrabold text-slate-900">{label}</div>
          {hint ? <div className="text-[12px] text-slate-500 leading-snug mt-0.5">{hint}</div> : null}
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange?.(!on)}
          className={[
            "w-14 h-8 rounded-full transition relative shrink-0 focus-visible:outline-none",
            PT.focusRingVisible,
            disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
            on ? "bg-violet-950/95" : "bg-slate-200",
          ].join(" ")}
          aria-pressed={on ? "true" : "false"}
          aria-label={label}
        >
          <span
            className={[
              "absolute top-1 left-1 w-6 h-6 rounded-full bg-white shadow transition-transform",
              on ? "translate-x-6" : "translate-x-0",
            ].join(" ")}
          />
        </button>
      </div>
    );
  }

  return () => {
      window.removeEventListener("lp:patient:openMenu", openMenu);
      window.removeEventListener("lp:patient:openLibrary", openLibrary);
      window.removeEventListener("lp:patient:openContract", openContract);
      window.removeEventListener("lp:patient:openNotes", openNotes);
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
          <div className="text-base sm:text-lg font-extrabold text-slate-900 truncate">AgendaPsi - Seu Espaço de cuidado</div>

          {patientPhone ? (
            <div className={`mt-1.5 sm:mt-2 inline-flex items-center gap-2 sm:gap-2.5 text-xs px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full ${PT.surfaceSoft} text-slate-800 shadow-sm`}>
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full ${PT.accentSoft} ${PT.accentText}`}>
                <Phone size={14} className={PT.accentIcon} />
                Telefone
              </span>
              <span className="font-semibold text-slate-900">{formatPhoneBR(patientPhone)}</span>
            </div>
          ) : null}
        </div>

        {/* Desktop actions */}
        <div className="hidden sm:flex gap-2">
          {showLibrary ? (
            <Button onClick={() => setLibraryOpen(true)} variant="secondary" icon={BookOpen}>
              Biblioteca
            </Button>
          ) : null}

          {showContract ? (
            <Button onClick={() => setContractOpen(true)} variant="secondary" icon={FileText}>
              Contrato
            </Button>
          ) : null}

          {showNotes ? (
            <Button onClick={() => setNotesOpen(true)} variant="secondary" icon={StickyNote}>
              Anotações
            </Button>
          ) : null}

          {typeof onToggleReminders === "function" ? (
            <div className="hidden lg:flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="text-xs font-bold text-slate-600">Lembretes</div>
              <button
                type="button"
                disabled={remindersBusy}
                onClick={() => onToggleReminders(!remindersEnabled)}
                className={[
                  "w-12 h-7 rounded-full transition relative shrink-0",
                  remindersBusy ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
                  remindersEnabled ? "bg-violet-950/95" : "bg-slate-200",
                ].join(" ")}
                aria-pressed={remindersEnabled ? "true" : "false"}
                aria-label="Ativar lembretes"
              >
                <span
                  className={[
                    "absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform",
                    remindersEnabled ? "translate-x-5" : "translate-x-0",
                  ].join(" ")}
                />
              </button>
            </div>
          ) : null}

          <Button
            onClick={onLogout}
            variant="secondary"
            icon={LogOut}
            className="text-slate-900 hover:text-slate-900"
          >
            Sair
          </Button>
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
            className={`absolute right-0 top-0 h-full w-[min(86vw,340px)] bg-white border-l ${PT.borderSubtle} shadow-2xl flex flex-col`}
            style={{
              paddingTop: "calc(16px + env(safe-area-inset-top))",
              paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
            }}
          >
            <div className={`px-4 pb-4 border-b ${PT.borderSubtle} flex items-center justify-between gap-3`}>
              <div className="min-w-0">
                <div className="text-sm font-extrabold text-slate-900">Menu</div>
                <div className="text-xs text-slate-500">
                  Seu horário é um espaço de cuidado — a constância sustenta o processo.
                </div>
              </div>

              <button
                ref={btnCloseRef}
                className={`w-11 h-11 inline-flex items-center justify-center rounded-xl hover:bg-slate-50 text-slate-600 focus-visible:outline-none ${PT.focusRingVisible}`}
                onClick={closeMobileMenu}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-3 flex-1 overflow-auto">
              {showLibrary ? (
              <button
                className={`w-full min-h-[44px] text-left px-4 py-3 text-sm text-slate-800 font-semibold hover:bg-slate-50 rounded-xl flex items-center gap-2 focus-visible:outline-none ${PT.focusRingVisible}`}
                onClick={() => {
                  closeMobileMenu();
                  setLibraryOpen(true);
                }}
              >
                <BookOpen size={16} className="text-slate-600" /> Biblioteca
              </button>
              ) : null}

              {showContract ? (
              <button
                className={`mt-1 w-full min-h-[44px] text-left px-4 py-3 text-sm text-slate-800 font-semibold hover:bg-slate-50 rounded-xl flex items-center gap-2 focus-visible:outline-none ${PT.focusRingVisible}`}
                onClick={() => {
                  closeMobileMenu();
                  setContractOpen(true);
                }}
              >
                <FileText size={16} className="text-slate-600" /> Contrato
              </button>
              ) : null}

              {showNotes ? (
              <button
                className={`mt-1 w-full min-h-[44px] text-left px-4 py-3 text-sm text-slate-800 font-semibold hover:bg-slate-50 rounded-xl flex items-center gap-2 focus-visible:outline-none ${PT.focusRingVisible}`}
                onClick={() => {
                  closeMobileMenu();
                  setNotesOpen(true);
                }}
              >
                <StickyNote size={16} className="text-slate-600" /> Anotações
              </button>
              ) : null}


              <div className={`mt-4 px-4 py-3 rounded-2xl ${PT.surfaceSoft} text-xs ${PT.textSecondary} leading-relaxed`}>
                Quando você vem, você não “cumpre uma agenda” — você sustenta um processo.
                Se estiver difícil comparecer, isso é um dado importante para ser levado para a sessão.
              </div>
            </div>

            <div className={`px-4 pt-3 border-t ${PT.borderSubtle}`}>
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
      {showContract && contractOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setContractOpen(false)}
          />
          <div className="absolute inset-0 flex items-end sm:items-center justify-center p-4">
            <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[calc(100dvh-2rem)] sm:max-h-[85vh] flex flex-col">
              <div className={`px-5 py-4 border-b ${PT.borderSubtle} flex items-center justify-between gap-3`}>
                <div className="min-w-0">
                  <div className="text-sm font-extrabold text-slate-900">Contrato Terapêutico</div>
                  <div className="text-xs text-slate-500">
                    Um espaço de cuidado que se fortalece na continuidade.
                  </div>
                </div>

                <button
                  className={`w-11 h-11 inline-flex items-center justify-center rounded-xl hover:bg-slate-50 text-slate-600 focus-visible:outline-none ${PT.focusRingVisible}`}
                  onClick={() => setContractOpen(false)}
                  aria-label="Fechar"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-5 space-y-3 overflow-auto flex-1 min-h-0">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm ${contractStatusClass}`}
                  >
                    {contractStatusLabel}
                  </span>
                  <div className="text-[11px] text-slate-400">v{Number(currentContractVersion || 1)}</div>
                </div>

                <div className={`p-3 rounded-xl ${PT.surfaceSoft} whitespace-pre-wrap text-sm text-slate-700 leading-relaxed`}>
                  {safeContractText}
                </div>

                <div className="text-xs text-slate-500">
                  Ler o contrato ajuda a sustentar o compromisso com o processo. Faltar não é “só”
                  perder uma hora — é interromper o ritmo de evolução. A constância é parte do cuidado.
                </div>
              </div>

              <div className={`px-5 py-4 border-t ${PT.borderSubtle} flex items-center justify-between gap-2`}>
                {needsContractAcceptance && typeof onAcceptContract === "function" ? (
                  <div className="text-xs text-slate-500">
                    Para continuar, confirme que você leu e concorda com o termo.
                  </div>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  {needsContractAcceptance && typeof onAcceptContract === "function" ? (
                    <Button onClick={onAcceptContract} disabled={remindersBusy}>
                      Concordo com o termo
                    </Button>
                  ) : null}

                  <Button variant="secondary" onClick={() => setContractOpen(false)}>
                    Fechar
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Biblioteca (psicoeducação) */}
      {showLibrary ? (
        <PatientLibraryModal open={libraryOpen} onClose={() => setLibraryOpen(false)} />
      ) : null}

      {/* Modal: Anotações do paciente */}
      {showNotes ? (
        <PatientNotesModal open={notesOpen} onClose={() => setNotesOpen(false)} />
      ) : null}
    </>
  );
}
