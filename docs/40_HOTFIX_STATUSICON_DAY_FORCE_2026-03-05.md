# HOTFIX — StatusIcon não definido (Profissional / Dia)

Data: 2026-03-05

## Problema
Ao abrir `/profissional` (visão Dia), ocorria erro em runtime:

- `ReferenceError: StatusIcon is not defined`

## Causa
Após a centralização de estilos de status, o componente `ProfessionalDayViewClient` continuou renderizando `<StatusIcon ... />`,
mas o helper `StatusIcon` não estava mais definido/importado.

## Correção aplicada
- Reintroduzido o helper `StatusIcon` **no próprio** `ProfessionalDayViewClient.js` com um marcador:
  - `// HOTFIX 2026-03-05: StatusIcon ...`

## Como validar
1. Pare o dev server.
2. (Recomendado) apague a pasta `.next/`.
3. Rode `npm run dev`.
4. Acesse `/profissional` e confirme que não ocorre mais o crash.
5. (Verificação rápida) busque no arquivo:
   - `HOTFIX 2026-03-05: StatusIcon`
