# PATCH — Profissional: Agenda — Preferências (localStorage) — weekDensity (2026-03-05)

## Objetivo
Adicionar **modo compacto/confortável** (densidade) na visão **Semana** e persistir essa preferência no `localStorage` (por tenant + usuário).

> Importante: apenas preferências de UI/UX no localStorage (sem dados clínicos/sensíveis).

## O que foi feito
- Inclui `weekDensity` nas preferências (v1) em `src/lib/client/proAgendaPrefs.js`.
- Visão **Semana**:
  - Toggle **Confortável / Compacto** no header (Camada 2) via `rightActions`.
  - Ajuste de densidade alterando altura das linhas do grid e micro-ajustes de tipografia/padding dos blocos.
  - Persistência automática de `weekDensity` (por tenant + usuário).
- Header:
  - Novo callback opcional `onPreferencesReset` para que visões específicas reajam ao botão **Padrão**.

## Arquivos alterados
- `src/lib/client/proAgendaPrefs.js`
- `src/components/Professional/ProfessionalAgendaHeader.js`
- `src/components/Professional/ProfessionalWeekViewClient.js`
- `docs/43_PROF_PREFERENCIAS_AGENDA_LOCALSTORAGE.md`
- `docs/31_PATCHES_ZIPS_APLICADOS.md`
- `docs/35_PATCH_PROF_AGENDA_PREFS_WEEK_DENSITY_2026-03-05.md`

## Como validar
1) Abrir `/profissional?view=week`
2) No header (Camada 2), alternar **Confortável / Compacto**
3) Dar **F5** → a densidade deve ser restaurada
4) Clicar em **Padrão** → deve voltar para `weekDensity="comfortable"` e manter após F5
