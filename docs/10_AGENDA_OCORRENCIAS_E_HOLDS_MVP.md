# Agenda — Ocorrências, Holds e duração por blocos (MVP)

Atualizado: 2026-02-28

## Coleções principais (por tenant)
- `appointmentOccurrences`:
  - `isHold`: true/false
  - `groupId`: agrupa blocos da mesma sessão
  - `isBlock`: true para blocos de continuação
  - `blockIndex`: 0..n-1
  - `slotKey`: `YYYY-MM-DD#HH:MM` (para buscas simples e evitar índices compostos)

## Regra de blocos
- A grade (slotIntervalMin) define o tamanho do bloco.
- Ao criar hold/agendamento, o profissional escolhe a duração em **n blocos**.
- O sistema só cria se os próximos slots estiverem livres.
- Para bloquear corretamente:
  - cria o doc principal (blockIndex 0)
  - cria docs `isBlock=true` para os slots seguintes

## Status em grupo
- Alterar status deve atualizar todos os docs com o mesmo `groupId`.


## Próximos horários disponíveis ✅
- No Profissional existe ação que lista 3 próximos horários livres.
- Regras respeitadas:
  - schedule (horário aberto + almoço)
  - multi-bloco
  - bufferMin
