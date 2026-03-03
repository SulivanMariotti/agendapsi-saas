# AgendaPsi — Modelo de Dados (v0) — atualizado

Atualizado: **2026-03-02**

> Este arquivo existe como “export” rápido para iniciar novos chats.  
> Fonte oficial mais detalhada: `docs/02_MODELO_DADOS.md` e `docs/03_MODELO_FIRESTORE.md`.

## Princípios
- Firestore NoSQL com denormalização consciente (sem joins).
- IDs consistentes (evitar duplicidade).
- createdAt/updatedAt com serverTimestamp quando aplicável.
- Separação clara de painéis por regras de permissão.

## Entidades (alto nível)
1) Profissional
2) Paciente
3) AgendaConfig (schedule)
4) AppointmentSeries (série)
5) AppointmentOccurrence (ocorrência materializada)
6) Hold/Reservation (hold via `isHold=true`)
7) Evolução por sessão (texto livre, do paciente)
8) Ocorrência extra (registro estruturado com código)
9) Catálogo de Códigos de Ocorrência

## Estrutura (MVP)
- `userTenantIndex/{uid}`
- `tenants/{tenantId}/settings/schedule`
- `tenants/{tenantId}/patients/{patientId}`
  - `sessionEvolutions/{occurrenceId}`
  - `occurrenceLogs/{logId}` (espelho)
- `tenants/{tenantId}/occurrenceCodes/{codeId}`
- `tenants/{tenantId}/appointmentSeries/{seriesId}`
- `tenants/{tenantId}/appointmentOccurrences/{occurrenceId}`
  - `occurrenceLogs/{logId}`

## Regras de modelagem (MVP)
- Recorrência com escolha: “só esta” vs “esta e futuras” (reagendar/excluir).
- Evolução por sessão é texto livre (sem código) e fica no paciente.
- Ocorrência extra usa código + descrição e fica vinculada ao agendamento, com espelho no paciente.
- Progresso do plano: exibir realizadas/total planejado (ex: 4/30).

## Pendências
- Painel do paciente (sem CTA cancelar/remarcar).
- Templates WhatsApp.
- Hardening completo de Rules.
- Relatório por código de ocorrência (Pós-MVP).
