# AgendaPsi — Registro de patches aplicados

> Este arquivo lista patches (zips) aplicados ao projeto para rastreabilidade.

- 2026-03-04 — `AgendaPsi_patch_backlog_sigilo_2026-03-04.zip` — adiciona ÉPICO G (Sigilo/LGPD)
- 2026-03-04 — `AgendaPsi_patch_backlog_cadastro_completo_paciente_2026-03-04.zip` — adiciona ÉPICO J + spec do cadastro completo do paciente
- 2026-03-04 — `AgendaPsi_patch_epico_j_mvp_backend_2026-03-04.zip` — ÉPICO J (MVP) backend: CPF opcional no pré-cadastro + índices + API de ficha do paciente
- 2026-03-04 — `AgendaPsi_patch_epico_j_mvp_ui_2026-03-04.zip` — ÉPICO J (MVP) UI Profissional: modal "Editar cadastro" + badge + generalNotes no agendamento

- 2026-03-04 — PATCH — Correção crash /profissional?view=month (WeekViewClient: variável days)
  - Objetivo: corrigir erro "Cannot access 'days' before initialization" que impedia abrir a visão Mês.
  - Alterações: renomeia variável local `days` -> `weekDays` em ProfessionalWeekViewClient (evita conflito/TDZ no runtime).

- 2026-03-04 — PATCH — Fix Month View: variáveis dirty/refs (hasAnyDirty/evolutionRef/logsRef)
  - Corrige crash ao abrir detalhe do agendamento na visão Mês.
  - Arquivos: ProfessionalMonthViewClient.js

- 2026-03-04 — PATCH — Fix Month View: import WhatsAppIcon
  - Objetivo: corrigir erro runtime `WhatsAppIcon is not defined` ao clicar em agendamento na visão Mês.
  - Arquivos: `src/components/Professional/ProfessionalMonthViewClient.js`

- 2026-03-04 — `AgendaPsi_patch_header_padrao_unificado_dia_semana_mes_2026-03-04.zip` — Profissional: header unificado (Dia/Semana/Mês) com posicionamento padrão + busca de paciente em todas as visões
- 2026-03-04 — HOTFIX — Header unificado (Dia) — remover markup duplicado e corrigir erro de build (JSX parsing)
- 2026-03-04 — PATCH — Header Premium (Variante A) — Seletor de data + colapso suave (Dia/Semana/Mês)
  - Objetivo: adicionar seletor de data (clique no período) e colapso suave da Camada 2 no scroll.
  - Arquivos: ProfessionalAgendaHeader + clients Dia/Semana/Mês + docs.

- 2026-03-04 — PATCH — Header Agenda (Variante A) ajustes finais (badges coloridos + largura consistente + limpeza Dia)
  - Ajustes:
    - Contadores (Confirmados/Agendados/Holds) voltaram a ser badges coloridos no header.
    - Largura/containers padronizados entre Dia/Semana/Mês (max-w-7xl).
    - Visão Dia: removidos título "Horários do dia" e data duplicada abaixo do header.
- 2026-03-04 — HOTFIX — Semana/Mês — weekEndIso undefined (WeekView)
  - Correção: define `weekEndIso` no ProfessionalWeekViewClient e torna `fmtWeekRangePt` compatível.

- 2026-03-04 — PATCH — Agenda (Profissional) — Ir para agora (condicional)
  - Ajuste UX: botão **Ir para agora** só aparece quando a tela está longe do horário atual (aprox. > 2h).
  - Arquivos: ProfessionalDayViewClient, ProfessionalWeekViewClient, UI/UX docs.

- 2026-03-04 — PATCH — Agenda (Profissional) — Próximo atendimento (Dia/Semana)
  - Header: botão "Próximo atendimento" (pula para próximo agendamento/hold) + abre detalhe
  - Implementação: DayView usa slot row; WeekView usa time row; ambos ignoram status Cancelado

- 2026-03-05 — PATCH — Agenda (Profissional) — Filtro rápido por status (badges clicáveis)
  - Header: contadores (Confirmados/Agendados/Holds) viraram filtros toggle.
  - UX: itens fora do filtro ficam **apagados** (não somem), mantendo slots ocupados.
  - Inclui: chip "Filtro ativo ×" para limpar.
  - Arquivos: ProfessionalAgendaHeader + clients Dia/Semana/Mês + UI/UX docs.

- 2026-03-05 — DOCS — Atualização de Handoff (novo chat)
  - Atualiza: docs/00_HANDOFF_PARA_NOVO_CHAT.md e docs/00_ONDE_PARAMOS.md com estado atual e próximos passos.
