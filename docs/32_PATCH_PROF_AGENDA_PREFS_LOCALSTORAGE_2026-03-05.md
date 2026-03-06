# PATCH — 2026-03-05 — Profissional: Preferências da Agenda (localStorage)

## O que mudou
- Agenda do Profissional agora **salva e restaura** (por tenant + usuário):
  - `viewMode` (Dia/Semana/Mês)
  - `statusFilter` (All/Agendados/Confirmados/Holds)

## Onde foi implementado
- Persistência centralizada no header unificado `ProfessionalAgendaHeader`:
  - ao trocar a visão, grava `viewMode` antes de navegar
  - ao trocar filtro, grava `statusFilter`
  - ao montar, restaura `statusFilter` sempre e restaura `viewMode` **somente** quando a URL não tem `view=...`

## Checklist rápido de validação
- [ ] Trocar para Semana, aplicar filtro Confirmados → F5 → mantém
- [ ] Abrir `/profissional` sem query → carrega a última visão salva
- [ ] Abrir `/profissional?view=month` → respeita URL (não força preferência)
- [ ] Preferências não vazam entre tenants/usuários

## Arquivos alterados
- `src/lib/client/proAgendaPrefs.js` (novo)
- `src/components/Professional/ProfessionalAgendaHeader.js`
- `src/app/profissional/page.js`
- `src/components/Professional/ProfessionalDayViewClient.js`
- `src/components/Professional/ProfessionalWeekViewClient.js`
- `src/components/Professional/ProfessionalMonthViewClient.js`
- `docs/31_PATCHES_ZIPS_APLICADOS.md`
- `docs/43_PROF_PREFERENCIAS_AGENDA_LOCALSTORAGE.md`
