# Patch 52 — Detalhe do Agendamento: Layout padrão (P1)

Data: 2026-03-05

## Objetivo
Avançar na padronização do **detalhe do agendamento/reserva** (modal/overlay ao clicar na agenda) para ficar **mais consistente** entre:
- Dia
- Semana
- Mês

> Patch focado em **layout/visualização**, sem mudança de regra de negócio.

## O que mudou
### Dia (ProfissionalDayViewClient)
- Ajuste do detalhe para **layout em 2 colunas** (mobile-first):
  - Coluna principal: cabeçalho padrão, código de acesso, status, hold-actions, tabs clínicas (Evolução / Ocorrências extra)
  - Coluna lateral: **Resumo do paciente + WhatsApp** (template, prévia, botão)
- Corrigido bug: `AppointmentDetailHeader.rightBadges` estava sendo passado como **string** e agora é JSX (render correto).

### Mês (ProfissionalMonthViewClient)
- Adicionado suporte completo ao **Editar cadastro** no mês:
  - `PatientProfileModal` + estado `patientProfilePatientId`
  - Badge **Cadastro incompleto** e botão **Editar cadastro** no resumo do paciente (detalhe)

## Arquivos alterados
- `src/components/Professional/ProfessionalDayViewClient.js`
- `src/components/Professional/ProfessionalMonthViewClient.js`
- `docs/31_PATCHES_ZIPS_APLICADOS.md`
- `docs/52_PATCH_DETALHE_AGENDAMENTO_LAYOUT_PADRAO_P1_2026-03-05.md`

## Como validar (checklist)
1) Abrir `/profissional` e testar detalhe em:
   - Dia (agendamento + hold)
   - Semana (agendamento + hold) — apenas conferir que continua OK
   - Mês (agendamento + hold)
2) Verificar no **Dia**:
   - Layout com 2 colunas (no desktop)
   - WhatsApp e templates aparecem na coluna lateral
   - Não há crash ao abrir detalhes (nenhum erro no console)
3) Verificar no **Mês**:
   - Busca “Pacientes” → selecionar paciente abre modal (sem erro)
   - Dentro do detalhe, botão **Editar cadastro** abre o `PatientProfileModal`
   - Badge “Cadastro incompleto” aparece quando aplicável
