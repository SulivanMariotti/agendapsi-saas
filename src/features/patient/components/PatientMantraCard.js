"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";

/**
 * Card de psicoeducação/compromisso (mantras rotativos).
 * Objetivo: reforçar constância e vínculo terapêutico sem moralismo.
 */
export default function PatientMantraCard({ mantras: mantrasProp, intervalMs = 9000 }) {
  const mantras = useMemo(() => {
    if (Array.isArray(mantrasProp) && mantrasProp.length > 0) return mantrasProp;

    return [
      { title: "O segredo é a constância", text: "A terapia funciona na regularidade. A continuidade muda." },
      { title: "Seu horário é um espaço sagrado", text: "Este encontro é cuidado ativo. Estar presente sustenta o processo." },
      { title: "Faltar interrompe", text: "Não é só perder uma hora: é quebrar a sequência de evolução que você constrói." },
      { title: "Responsabilidade com seu cuidado", text: "Este painel te apoia. Sua parte principal é comparecer." },
    ];
  }, [mantrasProp]);

  const [index, setIndex] = useState(0);

  // Auto-rotaciona
  useEffect(() => {
    if (!mantras?.length) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % mantras.length), Math.max(2000, Number(intervalMs) || 9000));
    return () => clearInterval(t);
  }, [mantras?.length, intervalMs]);

  const current = mantras?.[index] || mantras?.[0];

  if (!current) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden flex flex-col">
      <div className="p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-2 sm:gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-violet-600 text-white flex items-center justify-center shadow-lg shadow-violet-200 shrink-0">
            <Sparkles size={16} />
          </div>

          <div className="min-w-0">
            <div className="font-extrabold text-slate-900 truncate text-sm sm:text-base">{current.title}</div>
            <div className="text-xs sm:text-sm text-slate-600 mt-0.5 sm:mt-1">{current.text}</div>
            <div className="hidden sm:block text-[11px] text-slate-400 mt-2">Lembrete Psi é tecnologia a serviço do vínculo terapêutico.</div>
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-1">
          <button
            type="button"
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center"
            onClick={() => setIndex((i) => (i - 1 + mantras.length) % mantras.length)}
            aria-label="Anterior"
          >
            <ChevronLeft size={16} className="text-slate-500" />
          </button>
          <button
            type="button"
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center"
            onClick={() => setIndex((i) => (i + 1) % mantras.length)}
            aria-label="Próximo"
          >
            <ChevronRight size={16} className="text-slate-500" />
          </button>
        </div>
      </div>

      <div className="hidden sm:flex items-center gap-1 mt-3">
        {mantras.map((_, i) => (
          <div key={i} className={`h-1.5 w-6 rounded-full ${i === index ? "bg-violet-600" : "bg-slate-200"}`} />
        ))}
      </div>
      </div>
    </div>
  );
}
