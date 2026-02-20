"use client";

import React from "react";
import { Button } from "../../../components/DesignSystem";
import { CalendarCheck, MessageCircle, Sparkles } from "lucide-react";
import { brDateParts } from "../lib/dates";
import { chipClass } from "../lib/appointments";

/**
 * NextSessionCard (mobile-first)
 * - Evita "truncate" no mobile para não esconder data/profissional/local
 * - Mantém destaque sutil para ser o card mais importante do painel
 */
export default function NextSessionCard({
  nextAppointment,
  nextLabel,
  nextStatusChip,
  nextServiceLabel,
  nextPlaceLabel,
  nextMeta,
  confirmBusy,
  confirmedLoading,
  onConfirmPresence,
}) {

  // Mobile: manter "1 olhar e pronto". Detalhes ficam colapsados por padrão.
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [whyOpen, setWhyOpen] = React.useState(false);

  if (!nextAppointment) {
    return (
      <div className="relative rounded-2xl bg-gradient-to-br from-violet-50/60 via-white to-white shadow-sm overflow-hidden before:absolute before:inset-y-0 before:left-0 before:w-1.5 before:bg-violet-500/30 before:content-['']">
        <div className="p-4 sm:p-6">
          <div className="inline-flex items-center gap-2 text-[13px] sm:text-base font-extrabold text-slate-900">
            <Sparkles size={18} className="text-violet-600" />
            Próxima sessão
          </div>
          <div className="mt-3 text-sm text-slate-500">Nenhum atendimento encontrado.</div>
        </div>
      </div>
    );
  }

  const iso = nextAppointment.isoDate || nextAppointment.date;
  const parts = brDateParts(iso);

  const profissional = nextAppointment.profissional || nextAppointment.professional || "Não informado";
  const localRaw = nextAppointment.local || nextAppointment.location || "";
  const place = nextPlaceLabel || localRaw || "Não informado";
  const service = nextServiceLabel || "Sessão";

  const isConfirmed = nextStatusChip?.text === "Confirmada";

  return (
    <div className="relative rounded-2xl bg-gradient-to-br from-violet-50/60 via-white to-white shadow-sm overflow-hidden before:absolute before:inset-y-0 before:left-0 before:w-1.5 before:bg-violet-500/30 before:content-['']">
      <div className="p-4 sm:p-6">
        {/* Título (compacto no mobile) */}
        <div className="inline-flex items-center gap-2 text-[13px] sm:text-base font-extrabold text-slate-900">
          <Sparkles size={18} className="text-violet-600" />
          Próxima sessão
        </div>

        <div className="mt-3 space-y-3">
          {/* Linha 1: data + chips */}
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-12 rounded-2xl bg-white/80 shadow-sm p-2 text-center shrink-0">
              <div className="text-lg font-black text-slate-900 leading-none">{parts.day}</div>
              <div className="text-[10px] font-bold text-slate-500 mt-1 uppercase">{parts.mon}</div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-base font-extrabold text-slate-900 leading-snug whitespace-normal break-words">
                {parts.label}
                {nextAppointment.time ? <span className="text-slate-400"> • </span> : null}
                {nextAppointment.time ? <span className="text-slate-800">{nextAppointment.time}</span> : null}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {nextLabel ? (
                  <span className={`text-[11px] px-2 py-1 rounded-full font-semibold shadow-sm ${chipClass(nextLabel.style)}`}>
                    {nextLabel.text}
                  </span>
                ) : null}

                {nextStatusChip ? (
                  <span className={`text-[11px] px-2 py-1 rounded-full font-semibold shadow-sm ${nextStatusChip.cls}`}>
                    {nextStatusChip.text}
                  </span>
                ) : null}
              </div>

              {/* Resumo “1 olhar” (mobile): 2 linhas no máximo */}
              <div className="mt-2 text-[13px] leading-snug text-slate-700">
                <span className="font-semibold text-slate-900">{service}</span>
                <span className="text-slate-400"> • </span>
                <span className="text-slate-800">{profissional}</span>
              </div>
              <div className="mt-1 text-[12px] leading-snug text-slate-600 whitespace-normal break-words">
                {place}
              </div>

              {/* Detalhes: link no mobile (sem botão alto) */}
              <div className="mt-2 sm:hidden">
                <button
                  type="button"
                  onClick={() => setDetailsOpen((v) => !v)}
                  aria-expanded={detailsOpen ? "true" : "false"}
                  className="text-[12px] font-semibold text-violet-700 underline underline-offset-2"
                >
                  {detailsOpen ? "Ocultar detalhes" : "Ver detalhes"}
                </button>
              </div>
            </div>
          </div>

          {/* Detalhes: colapsado no mobile, sempre visível no desktop */}
          <div className={`${detailsOpen ? "block" : "hidden"} sm:block`}>
            <div className="rounded-2xl bg-white/70 shadow-sm p-3 sm:p-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-slate-700">
                <div className="leading-snug min-w-0">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Serviço</div>
                  <div className="font-semibold text-slate-900 whitespace-normal break-words">{service}</div>
                </div>

                <div className="leading-snug min-w-0">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Profissional</div>
                  <div className="font-semibold text-slate-900 whitespace-normal break-words">{profissional}</div>
                </div>

                <div className="leading-snug min-w-0">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Local</div>
                  <div className="font-semibold text-slate-900 whitespace-normal break-words">{place}</div>
                </div>
              </div>

              {confirmedLoading ? (
                <div className="mt-2 text-[11px] text-slate-400">Atualizando confirmações…</div>
              ) : null}

              {nextMeta?.ics ? (
                <div className="mt-3">
                  <Button
                    as="a"
                    href={nextMeta.ics}
                    download={"proximo_atendimento.ics"}
                    variant="secondary"
                    icon={CalendarCheck}
                    className="w-full sm:w-auto"
                  >
                    Adicionar ao calendário
                  </Button>
                </div>
              ) : null}
            </div>
          </div>

          {/* Confirmação (compacta, ainda com destaque) */}
          <div className="rounded-2xl bg-violet-50/70 p-3 sm:p-4 shadow-sm">
            <div className="text-sm font-extrabold text-slate-900">
              {isConfirmed ? "Presença confirmada" : "Confirme sua presença"}
            </div>
            <div className="text-[12px] text-slate-600 leading-snug mt-0.5">
              {isConfirmed
                ? "Seu horário segue reservado para você. Obrigado por sustentar sua constância."
                : "Leva poucos segundos e reforça seu compromisso com esse cuidado."}
            </div>

            <div className="mt-3 flex flex-col gap-2">
              {nextMeta?.wa && !nextMeta?.waDisabled ? (
                <Button
                  onClick={onConfirmPresence}
                  disabled={confirmBusy}
                  icon={MessageCircle}
                  className="w-full"
                >
                  {confirmBusy ? "Abrindo..." : isConfirmed ? "Reconfirmar no WhatsApp" : "Confirmar presença"}
                </Button>
              ) : (
                <Button disabled variant="secondary" icon={MessageCircle} className="w-full">
                  WhatsApp não configurado
                </Button>
              )}

              {confirmedLoading ? (
                <div className="text-[11px] text-slate-500">Atualizando status…</div>
              ) : null}
            </div>

            {/* Nota clínica (bem curta, expandível) */}
            <div className="mt-2 text-[12px] text-slate-600 leading-snug">
              A terapia acontece na continuidade.
              <span className="text-slate-400"> </span>
              <button
                type="button"
                onClick={() => setWhyOpen((v) => !v)}
                className="text-[12px] font-semibold text-violet-700 underline underline-offset-2 ml-1"
                aria-expanded={whyOpen ? "true" : "false"}
              >
                {whyOpen ? "Ocultar" : "Por que isso importa?"}
              </button>
              {whyOpen ? (
                <div className="mt-2 text-[12px] text-slate-600">
                  Quando dá vontade de faltar, isso também pode dizer algo importante. Em vez de interromper,
                  leve esse movimento para a sessão — é aí que o processo se aprofunda.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
