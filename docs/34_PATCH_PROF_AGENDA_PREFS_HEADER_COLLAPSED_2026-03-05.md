# PATCH — Profissional: Agenda — Preferências (localStorage) — headerCollapsed (2026-03-05)

## Objetivo
Adicionar persistência do estado **colapsado/expandido** da **Camada 2** do header da Agenda do Profissional.

> Importante: apenas preferências de UI/UX no localStorage (sem dados clínicos/sensíveis).

## O que foi feito
- Inclui `headerCollapsed` nas preferências (v1) em `src/lib/client/proAgendaPrefs.js`.
- Header da Agenda:
  - Novo botão **Controles** (colapsar/expandir Camada 2).
  - Salva/restaura `headerCollapsed` automaticamente.
  - A ação **Padrão** agora também aplica `headerCollapsed=false`.

## Arquivos alterados
- `src/lib/client/proAgendaPrefs.js`
- `src/components/Professional/ProfessionalAgendaHeader.js`
- `docs/43_PROF_PREFERENCIAS_AGENDA_LOCALSTORAGE.md`
- `docs/31_PATCHES_ZIPS_APLICADOS.md`
- `docs/34_PATCH_PROF_AGENDA_PREFS_HEADER_COLLAPSED_2026-03-05.md`

## Como validar
1) Abrir `/profissional`
2) No header, clicar em **Controles** → Camada 2 deve colapsar/expandir.
3) Dar **F5** → o estado deve ser restaurado.
4) Clicar em **Padrão** → deve voltar ao default (Camada 2 expandida).
