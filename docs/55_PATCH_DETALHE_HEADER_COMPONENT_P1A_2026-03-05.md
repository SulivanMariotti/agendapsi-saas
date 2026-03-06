# Patch — Detalhe do Agendamento: Header padrão (P1A) — 2026-03-05

## Objetivo
Iniciar a padronização do **detalhe do agendamento** (overlay) entre as visões **Dia / Semana / Mês**,
começando pela **visão Mês**, criando um header reutilizável e com melhor hierarquia visual.

## O que mudou
- Criado componente compartilhado:
  - `src/components/Professional/AppointmentDetailHeader.js`
- Visão **Mês** (`ProfessionalMonthViewClient`):
  - Passou a usar o novo header no topo do detalhe.
  - Header mostra:
    - **Nome do paciente** (ou fallback Reserva/Agendamento)
    - **Data + hora** (subtitle)
    - Badges à direita: **Plano**, **Cadastro incompleto** (quando aplicável) e **Status/Reserva**
  - Cor de acento do header:
    - Reserva: cinza
    - Agendamento: usa `statusAccentBorderClass(status)` (mesmo padrão do resto da agenda)

## Sem mudanças
- Nenhuma regra de negócio alterada.
- Fluxos de salvar, excluir, abrir no dia, etc. permanecem iguais.

## Próximos patches (incrementais)
- P1B: aplicar o mesmo header na visão **Semana**.
- P1C: aplicar o mesmo header na visão **Dia**.
