# Patch — Busca (Pacientes) com atalho “Próximo atendimento”

Data: 2026-03-05  
Patch: `AgendaPsi_patch_prof_busca_pacientes_proximo_atendimento_2026-03-05.zip`

## Objetivo
Melhorar a UX da busca **Pacientes** no header da agenda do Profissional, exibindo um botão **“Próximo”** quando existir um **agendamento futuro** para o paciente e permitindo navegar diretamente para o atendimento (abrindo o detalhe na visão Dia).

## O que mudou
### 1) Header da Agenda (Profissional)
- Resultados da busca em **Pacientes** agora podem exibir:
  - Linha secundária com **“Próximo: dd/mm/aa HH:MM”**
  - Botão **“Próximo”** à direita (quando há atendimento futuro)

### 2) API `/api/professional/patients/search`
- Suporta query param `includeNext=1`
- Quando habilitado, cada paciente retornado pode incluir:
  - `nextAppt`: `{ occurrenceId, isoDate, startTime }` (se existir)
- Regras do “próximo”:
  - ignora `isHold=true`
  - ignora `isBlock=true`
  - ignora `status="Cancelado"`
  - considera “agora” com tolerância de 5 minutos (grace)

### 3) Navegação
- Ao clicar em **“Próximo”**:
  - navega para `/profissional?view=day&date=YYYY-MM-DD&openOcc=<occurrenceId>`
  - a visão Dia abre automaticamente o detalhe da ocorrência e remove `openOcc` da URL (para não reabrir após fechar).

## Arquivos alterados
- `src/components/Professional/ProfessionalAgendaHeader.js`
- `src/components/Professional/ProfessionalDayViewClient.js`
- `src/components/Professional/ProfessionalWeekViewClient.js`
- `src/components/Professional/ProfessionalMonthViewClient.js`
- `src/app/api/professional/patients/search/route.js`
- `docs/31_PATCHES_ZIPS_APLICADOS.md`
- `docs/49_PATCH_BUSCA_PACIENTES_PROXIMO_ATENDIMENTO_2026-03-05.md`

## Checklist de validação
1) Abra `/profissional` e alterne a busca para **Pacientes**
2) Digite o nome de um paciente que tenha atendimento futuro
- [ ] Resultado mostra subtexto **“Próximo: …”** (quando aplicável)
- [ ] Botão **“Próximo”** aparece apenas quando há atendimento futuro
3) Clique em **“Próximo”**
- [ ] Navega para o dia do atendimento
- [ ] Abre o detalhe do agendamento automaticamente
- [ ] `openOcc` é removido da URL após abrir
4) Pacientes sem atendimento futuro
- [ ] Não exibem botão “Próximo”
