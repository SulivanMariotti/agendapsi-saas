# HOTFIX — Visão Mês: statusPillClass indefinido

Data: 2026-03-05  
Contexto: Profissional → Visão Mês → abrir detalhe do agendamento

## Problema
Ao abrir o detalhe no Mês, ocorria erro em runtime:
- `ReferenceError: statusPillClass is not defined`

## Causa
O componente `ProfessionalMonthViewClient` utiliza `statusPillClass(status)` para renderizar o chip de status no detalhe, mas o helper não estava importado do util centralizado `occurrenceStatusStyles`.

## Correção
- Adicionado `statusPillClass` no import de `@/lib/shared/occurrenceStatusStyles` em `ProfessionalMonthViewClient`.

## Como validar
1. `npm run dev`
2. Abrir `/profissional?view=month`
3. Clicar em um agendamento → detalhe abre sem crash
4. Confirmar que o chip de status aparece com a cor correta.

## Arquivos
- `src/components/Professional/ProfessionalMonthViewClient.js`
