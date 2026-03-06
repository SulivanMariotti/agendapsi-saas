# HOTFIX — Profissional (Dia) — StatusIcon is not defined (2026-03-05)

## Contexto
Após a centralização do mapeamento de classes de status em `src/lib/shared/occurrenceStatusStyles.js`,
a visão **Dia** continuou referenciando o componente `StatusIcon`, porém a função local havia sido removida,
gerando o erro de runtime:

- `ReferenceError: StatusIcon is not defined`

## O que foi feito
- Reintroduzido o componente local `StatusIcon` em `src/components/Professional/ProfessionalDayViewClient.js`.
- Mantida a lógica existente:
  - Holds (`isHold=true`) usam ícone `Lock`.
  - Demais status usam ícones (CalendarDays/BadgeCheck/CheckCircle/UserX/XCircle/RefreshCcw).

## Como validar
1. Abrir `/profissional` (visão Dia).
2. Confirmar que a tela renderiza sem crash.
3. Verificar que cards exibem ícone coerente com o status e que holds continuam com `Lock`.
