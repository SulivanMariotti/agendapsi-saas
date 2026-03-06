# HOTFIX — Busca inteligente (Profissional) — TDZ `effectiveSearchScope`

Data: 2026-03-05

## Problema
Ao abrir `/profissional`, ocorria erro em runtime (Turbopack):

- `Cannot access 'effectiveSearchScope' before initialization`

A causa era uma constante que se referenciava a si mesma (TDZ) dentro do `ProfessionalAgendaHeader`.

## Correção
- `effectiveSearchScope` agora é derivado do prop `searchScope` (fallback seguro para `"view"`).

## Arquivos alterados
- `src/components/Professional/ProfessionalAgendaHeader.js`
- `docs/31_PATCHES_ZIPS_APLICADOS.md`

## Como validar
1. Pare o dev server (Ctrl+C).
2. (Recomendado) apague a pasta `.next`.
3. `npm run dev`
4. Acesse `/profissional`
5. Confirme:
   - não ocorre mais o erro de TDZ
   - busca alterna **Visão** ↔ **Pacientes** normalmente
