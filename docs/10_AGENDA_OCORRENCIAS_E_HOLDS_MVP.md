# Agenda — Ocorrências, Holds, recorrência e duração por blocos (MVP)

Atualizado: **2026-03-02**

## Coleções principais (por tenant)
- `appointmentSeries`
- `appointmentOccurrences` (inclui hold via `isHold=true`)
- `settings/schedule`

---

## 1) Duração por blocos (multi-bloco)
- Cada compromisso pode ocupar N slots.
- A sessão principal (blockIndex=0) tem `groupId`.
- Blocos adicionais usam `isBlock=true` e compartilham o `groupId`.

## 2) Buffer
- `bufferMin` impede agendar “encostado” em outro item.
- Deve considerar início e fim reais da sessão (incluindo multi-bloco).

## 3) Hold/Reserva
- Hold é uma ocorrência com `isHold=true`.
- Status travado até converter em agendamento.
- Pode existir sem paciente (lead).

## 4) Recorrência e plano
- Frequências: diário / semanal / quinzenal / mensal.
- Materializa as ocorrências com:
  - `sessionIndex`
  - `plannedTotalSessions`
- Operações recorrentes são **atômicas** (sem criação parcial).

## 5) Converter hold → agendamento
- Converte ocorrências existentes.
- Pode estender o plano materializando as sessões restantes.
- Sem conflito (atômico).

## 6) Reagendar
- Sempre perguntar:
  - “Só esta ocorrência”
  - “Esta e futuras”
- Week picker seg→dom com legenda:
  - L (livre)
  - R (hold, não clicável)
  - — (ocupado)

## 7) Excluir
- Mesmo padrão:
  - “Só esta ocorrência”
  - “Esta e futuras”
- Excluir libera o horário na agenda.
- Não apaga evolução (prontuário) nem ocorrência extra do paciente.

## 8) Mês — clique em área livre do dia
- Abre modal “Ações do dia” e sugere horários do próprio dia.
