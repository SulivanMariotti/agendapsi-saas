# PATCH — Agenda (Profissional) — Ajuste cor do status “Não comparece” (pink)

Data: 2026-03-05

## Motivo
A cor anterior do status **Não comparece** estava muito próxima do **Cancelado** (vermelho).  
Ajustamos para um **pink** mais evidente, mantendo consistência entre **Dia / Semana / Mês**.

## O que mudou
- Status **“Não comparece”**:
  - De: `rose` (ex.: `bg-rose-*`)
  - Para: `pink` (ex.: `bg-pink-*`)
- Nenhum outro status foi alterado.
- Erros/validações que usam `text-rose-*` permanecem **inalterados** (somente status mudou).

## Arquivos alterados
- src/components/Professional/ProfessionalDayViewClient.js
- src/components/Professional/ProfessionalWeekViewClient.js
- src/components/Professional/ProfessionalMonthViewClient.js
- docs/31_PATCHES_ZIPS_APLICADOS.md

## Como validar (rápido)
1) Em `/profissional`, conferir cards em **Dia/Semana/Mês**:
   - **Não comparece** agora aparece em **pink** e fica visualmente distinto do **Cancelado** (vermelho).
2) Confirmar que **Cancelado** continua vermelho e sem regressão nos demais status.
