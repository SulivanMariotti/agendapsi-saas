# AgendaPsi — Registro de patches aplicados

> Este arquivo lista patches (zips) aplicados ao projeto para rastreabilidade.

- 2026-03-04 — HOTFIX — Header unificado (Dia) — remover markup duplicado e corrigir erro de build (JSX parsing)

- 2026-03-04 — HOTFIX — Semana/Mês — weekEndIso undefined (WeekView)

- 2026-03-04 — PATCH — Agenda (Profissional) — Ir para agora (condicional)

- 2026-03-04 — PATCH — Agenda (Profissional) — Próximo atendimento (Dia/Semana)

- 2026-03-04 — PATCH — Correção crash /profissional?view=month (WeekViewClient: variável days)

- 2026-03-04 — PATCH — Fix Month View: import WhatsAppIcon

- 2026-03-04 — PATCH — Fix Month View: variáveis dirty/refs (hasAnyDirty/evolutionRef/logsRef)

- 2026-03-04 — PATCH — Header Agenda (Variante A) ajustes finais (badges coloridos + largura consistente + limpeza Dia)

- 2026-03-04 — PATCH — Header Premium (Variante A) — Seletor de data + colapso suave (Dia/Semana/Mês)

- 2026-03-04 — `AgendaPsi_patch_backlog_cadastro_completo_paciente_2026-03-04.zip` — adiciona ÉPICO J + spec do cadastro completo do paciente

- 2026-03-04 — `AgendaPsi_patch_backlog_sigilo_2026-03-04.zip` — adiciona ÉPICO G (Sigilo/LGPD)

- 2026-03-04 — `AgendaPsi_patch_epico_j_mvp_backend_2026-03-04.zip` — ÉPICO J (MVP) backend: CPF opcional no pré-cadastro + índices + API de ficha do paciente

- 2026-03-04 — `AgendaPsi_patch_epico_j_mvp_ui_2026-03-04.zip` — ÉPICO J (MVP) UI Profissional: modal "Editar cadastro" + badge + generalNotes no agendamento

- 2026-03-04 — `AgendaPsi_patch_header_padrao_unificado_dia_semana_mes_2026-03-04.zip` — Profissional: header unificado (Dia/Semana/Mês) com posicionamento padrão + busca de paciente em todas as visões

- 2026-03-05 — AgendaPsi_patch_hotfix_busca_effectiveSearchScope_TDZ_2026-03-05.zip — HOTFIX: corrige TDZ (effectiveSearchScope) no ProfessionalAgendaHeader.

- 2026-03-05 — AgendaPsi_patch_hotfix_busca_normalizeText_duplicate_2026-03-05.zip — HOTFIX: remove duplicação de `normalizeText` em `/api/professional/patients/search` (corrige erro de build).

- 2026-03-05 — AgendaPsi_patch_hotfix_statusicon_day_force_2026-03-05.zip — HOTFIX: define StatusIcon na visão Dia (evita ReferenceError).

- 2026-03-05 — AgendaPsi_patch_prof_busca_inteligente_2026-03-05.zip — Busca inteligente (Visão x Pacientes) no header da agenda.

- 2026-03-05 — AgendaPsi_patch_prof_busca_pacientes_proximo_atendimento_2026-03-05.zip — UX: na busca "Pacientes" (header), exibir ação "Próximo" quando existir agendamento futuro e navegar para a ocorrência (abre detalhe no Dia).

- 2026-03-05 — AgendaPsi_patch_prof_busca_pacientes_ranking_2026-03-05.zip — Melhoria: busca global de pacientes (API) com normalização (acentos) + ranking e melhor fallback (bounded scan).

- 2026-03-05 — AgendaPsi_patch_prof_detalhe_agendamento_layout_padrao_p1_2026-03-05.zip — Detalhe do agendamento: layout padrão (P1) (Dia: 2 colunas + resumo/WhatsApp; Mês: editar cadastro + cadastro incompleto).

- 2026-03-05 — AgendaPsi_patch_prof_prefs_search_scope_2026-03-05.zip — Preferências (localStorage): persistir escopo da busca no header (Visão/Pacientes).

- 2026-03-05 — DOCS — Atualização de Handoff (novo chat)

- 2026-03-05 — HOTFIX — Profissional (Dia) — `StatusIcon is not defined`

- 2026-03-05 — PATCH — Agenda (Profissional) — Ajuste cor do status “Não comparece”

- 2026-03-05 — PATCH — Agenda (Profissional) — Busca inteligente (Nesta visão x Todos os pacientes)

- 2026-03-05 — PATCH — Agenda (Profissional) — Centraliza mapeamento de cores/estilos por status

- 2026-03-05 — PATCH — Agenda (Profissional) — Cores de status (v1)

- 2026-03-05 — PATCH — Agenda (Profissional) — Filtro rápido por status (badges clicáveis)

- 2026-03-05 — PATCH — Agenda (Profissional) — Preferências (localStorage)

- 2026-03-05 — Patch 51 — Detalhe do agendamento: layout padrão (v1) — `AgendaPsi_patch_detalhe_agendamento_layout_padrao_v1_2026-03-05.zip`

- 2026-03-05 — `AgendaPsi_patch_hotfix_detalhe_p1_build_fix_2026-03-05.zip` — HOTFIX: corrige build após Patch P1 do detalhe (remove dependência inexistente `AppointmentDetailHeader` e restaura JSX válido em Dia/Mês).

- 2026-03-05 — `AgendaPsi_patch_prof_agenda_prefs_header_collapsed_2026-03-05.zip` — Profissional: persistência de `headerCollapsed` (Camada 2 do header) + botão "Controles" para colapsar/expandir.

- 2026-03-05 — `AgendaPsi_patch_prof_agenda_prefs_reset_default_2026-03-05.zip` — Profissional: ação "Padrão" no header para restaurar preferências da agenda (limpa localStorage e aplica defaults).

- 2026-03-05 — `AgendaPsi_patch_prof_agenda_prefs_week_density_2026-03-05.zip` — Profissional (Semana): toggle de densidade (Confortável/Compacto) com persistência de `weekDensity`.

- 2026-03-05 — `AgendaPsi_patch_status_colors_darker_20pct_2026-03-05.zip` — Ajuste visual: escurece ~20% os tons das cores de status (shades Tailwind +1) para melhor contraste e leitura.

- 2026-03-05 — `AgendaPsi_patch_status_colors_prof_agenda_2026-03-05.zip` — Profissional: padroniza cores por status (Agendado mantém; Confirmado azul; Finalizado verde; Não comparece rosa; Cancelado vermelho; Reagendado laranja)
- 2026-03-05 — Agenda Profissional: Detalhe do agendamento — Header padrão (P1A)

