"use client";

import React from "react";
import { Button, Card } from "../../../components/DesignSystem";
import { BriefcaseMedical, CalendarCheck, MapPin, MessageCircle, UserRound, Sparkles } from "lucide-react";
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

  const titleNode = (
    <span className="inline-flex items-center gap-2">
      <Sparkles size={18} className="text-violet-600" />
      <span>Seu próximo atendimento</span>
    </span>
  );

  if (!nextAppointment) {
    return (
      <Card
        title={titleNode}
        className="relative border-violet-100 ring-2 ring-violet-200/70 bg-gradient-to-br from-violet-50/60 via-white to-white before:absolute before:inset-y-0 before:left-0 before:w-1.5 before:bg-violet-500/30 before:content-['']"
      >
        <div className="text-sm text-slate-500">Nenhum atendimento encontrado.</div>
      </Card>
    );
  }

  const iso = nextAppointment.isoDate || nextAppointment.date;
  const parts = brDateParts(iso);

  const profissional = nextAppointment.profissional || nextAppointment.professional || "Não informado";
  const localRaw = nextAppointment.local || nextAppointment.location || "";
  const place = nextPlaceLabel || localRaw || "Não informado";

  return (
    <Card
      title={titleNode}
      className="relative border-violet-100 ring-2 ring-violet-200/70 bg-gradient-to-br from-violet-50/60 via-white to-white before:absolute before:inset-y-0 before:left-0 before:w-1.5 before:bg-violet-500/30 before:content-['']"
    >
      <div className="space-y-4">
        {/* Topo: Data + detalhes (mobile-first) */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            {/* bloco da data */}
            <div className="w-14 rounded-2xl border border-slate-100 bg-white/80 p-3 text-center shrink-0">
              <div className="text-xl font-black text-slate-900 leading-none">{parts.day}</div>
              <div className="text-[11px] font-bold text-slate-500 mt-1 uppercase">{parts.mon}</div>
            </div>

            <div className="min-w-0 flex-1">
              {/* Linha principal: data + hora */}
              <div className="text-base font-extrabold text-slate-900 leading-snug whitespace-normal break-words">
                {parts.label}
                {nextAppointment.time ? <span className="text-slate-400"> • </span> : null}
                {nextAppointment.time ? <span className="text-slate-800">{nextAppointment.time}</span> : null}
              </div>

              {/* Chips (podem quebrar linha no mobile) */}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {nextLabel ? (
                  <span className={`text-[11px] px-2 py-1 rounded-full border font-semibold ${chipClass(nextLabel.style)}`}>
                    {nextLabel.text}
                  </span>
                ) : null}

                {nextStatusChip ? (
                  <span className={`text-[11px] px-2 py-1 rounded-full border font-semibold ${nextStatusChip.cls}`}>
                    {nextStatusChip.text}
                  </span>
                ) : null}
              </div>

              {/* Informações (sem truncate no mobile) */}
              <div className="mt-3 rounded-2xl border border-slate-100 bg-white/70 p-3 sm:p-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-slate-700">
                  <div className="flex items-start gap-2">
                    <BriefcaseMedical size={16} className="text-slate-500 mt-0.5 shrink-0" />
                    <div className="leading-snug min-w-0">
                      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Serviço</div>
                      <div className="font-semibold text-slate-900 text-[15px] sm:text-sm whitespace-normal break-words">
                        {nextServiceLabel || "Sessão"}
                      </div>
                    </div>
                  </div>
              
                  <div className="flex items-start gap-2">
                    <UserRound size={16} className="text-slate-500 mt-0.5 shrink-0" />
                    <div className="leading-snug min-w-0">
                      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Profissional</div>
                      <div className="font-semibold text-slate-900 text-[15px] sm:text-sm whitespace-normal break-words">
                        {profissional}
                      </div>
                    </div>
                  </div>
              
                  <div className="flex items-start gap-2">
                    <MapPin size={16} className="text-slate-500 mt-0.5 shrink-0" />
                    <div className="leading-snug min-w-0">
                      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Local</div>
                      <div className="font-semibold text-slate-900 text-[15px] sm:text-sm whitespace-normal break-words">
                        {place}
                      </div>
                    </div>
                  </div>
                </div>
              
                {confirmedLoading ? (
                  <div className="mt-2 text-[11px] text-slate-400">Atualizando confirmações…</div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Botão de calendário: vira full no mobile */}
          {nextMeta?.ics ? (
            <div className="sm:shrink-0">
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

        {/* CTA principal */}
        <div className="flex flex-col gap-2">
          {nextMeta?.wa && !nextMeta?.waDisabled ? (
            <Button onClick={onConfirmPresence} disabled={confirmBusy} icon={MessageCircle} className="w-full">
              {confirmBusy ? "Registrando..." : "Confirmar presença no WhatsApp"}
            </Button>
          ) : (
            <Button disabled variant="secondary" icon={MessageCircle} className="w-full">
              WhatsApp não configurado (admin)
            </Button>
          )}
        </div>

        {/* Nota clínica */}
        <div className="text-[12px] text-slate-500 leading-snug">
          Este botão é apenas para <b>confirmar presença</b>. Seu horário está reservado para você.
          <div className="text-[11px] text-slate-400 mt-1">
            A constância sustenta seu processo — e a vontade de faltar também pode dizer algo importante. Vale levar para a terapia.
          </div>
        </div>
      </div>
    </Card>
  );
}
