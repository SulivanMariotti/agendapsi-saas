# Seed Firestore — AgendaPsi

Atualizado: **2026-03-02**

## Objetivo
Popular dados mínimos para teste rápido:
- tenant demo
- paciente demo
- série + ocorrências
- schedule do tenant

## Observação
O seed atual cria um conjunto básico (tenant/paciente/série/ocorrências).
Itens úteis para ampliar no seed (opcional):
- alguns `occurrenceCodes` (para ocorrência extra)
- 1 evolução em `patients/{patientId}/sessionEvolutions/{occurrenceId}`
- 1 ocorrência extra em `appointmentOccurrences/{occurrenceId}/occurrenceLogs/{logId}` (e espelho no paciente)

## Dica de validação
Após rodar seed:
- `/profissional` deve exibir sessões na semana e no mês sem deslocar o weekday (timezone).
