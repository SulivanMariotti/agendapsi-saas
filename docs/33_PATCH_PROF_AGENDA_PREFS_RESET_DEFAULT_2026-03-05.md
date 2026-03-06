# Patch — Profissional: Reset de preferências da Agenda (Padrão)

Data: 2026-03-05 (America/Sao_Paulo)  
Arquivo: `AgendaPsi_patch_prof_agenda_prefs_reset_default_2026-03-05.zip`

## Objetivo
Adicionar uma ação simples no header da agenda do profissional para **restaurar as preferências padrão**.

## O que mudou
- Header da agenda:
  - Botão **“Padrão”** (ícone refresh) na linha principal de ações.
  - Ao clicar:
    1) confirma via `window.confirm`
    2) limpa o localStorage (chave por tenant+usuário)
    3) aplica defaults (`viewMode` + `statusFilter`)

## Arquivos alterados
- `src/components/Professional/ProfessionalAgendaHeader.js`
- `docs/31_PATCHES_ZIPS_APLICADOS.md`
- `docs/43_PROF_PREFERENCIAS_AGENDA_LOCALSTORAGE.md`
- `docs/33_PATCH_PROF_AGENDA_PREFS_RESET_DEFAULT_2026-03-05.md`

## Como validar
1) Em `/profissional`, mude para **Semana** e aplique filtro **Confirmados**.
2) Clique em **Padrão** e confirme.
3) Deve voltar para:
   - `statusFilter="all"`
   - `viewMode` default (atual: `"day"`) e, se estiver em Semana/Mês, deve navegar para a view default.
4) Dar F5 → deve permanecer no padrão.
