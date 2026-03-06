# Patch — Preferências: escopo da busca (Visão/Pacientes)

Data: 2026-03-05

## Objetivo
Persistir, por tenant + usuário, o escopo da busca do header da agenda do Profissional:
- **Visão** (`searchScope="view"`)
- **Pacientes** (`searchScope="all"`)

## Mudanças
- Adicionado `searchScope` ao schema de preferências (`proAgendaPrefs`).
- `ProfessionalAgendaHeader`:
  - aplica `searchScope` salvo ao carregar
  - persiste alterações de `searchScope`
  - reset **Padrão** volta `searchScope` para `"view"` e limpa o campo de busca

## Arquivos afetados
- `src/lib/client/proAgendaPrefs.js`
- `src/components/Professional/ProfessionalAgendaHeader.js`
- `docs/43_PROF_PREFERENCIAS_AGENDA_LOCALSTORAGE.md`
- `docs/31_PATCHES_ZIPS_APLICADOS.md`
- `docs/47_PATCH_PROF_PREFS_SEARCH_SCOPE_2026-03-05.md`
