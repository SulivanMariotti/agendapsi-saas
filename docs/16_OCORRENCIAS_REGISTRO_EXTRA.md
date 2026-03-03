# AgendaPsi — Ocorrências (registro extra) + Códigos (MVP)

Atualizado: **2026-03-02**

## Objetivo
Registrar **ocorrências** como um **registro extra** (fora do âmbito da sessão), vinculado ao agendamento/paciente, com **código** para organização.

> Pedido registrado: **[PÓS-MVP] Relatório por código de ocorrência**.

---

## Conceito (produto)
- **Não é prontuário/evolução**: a evolução da sessão é texto livre.
- Serve para registrar fatos relevantes “de contexto” (intercorrências, operacionais, incidentes, etc.).
- Mantém referência ao agendamento (occurrenceId) para rastreabilidade.

---

## Modelo de dados (Firestore)

### 1) Catálogo de códigos (Admin)
- `tenants/{tenantId}/occurrenceCodes/{codeId}`

Campos (MVP):
- `code` (string, ex.: `OC01`) (upper)
- `description` (string)
- `isActive` (boolean)
- `createdAt`, `updatedAt`

### 2) Logs por agendamento (sem índice composto)
- `tenants/{tenantId}/appointmentOccurrences/{occurrenceId}/occurrenceLogs/{logId}`

Campos (MVP):
- `occurrenceId`
- `patientId` (quando existir)
- `seriesId` (opcional)
- `sessionStartAt` (timestamp)
- `codeId`, `code` (snapshot)
- `description`
- `createdByUid`
- `createdAt`

### 3) Espelho no paciente (histórico)
- `tenants/{tenantId}/patients/{patientId}/occurrenceLogs/{logId}`

Mesmos campos, para:
- listar histórico do paciente sem `collectionGroup`
- base para relatórios (Pós-MVP)

---

## UX (MVP)
No detalhe do agendamento:
- selecionar código
- descrever ocorrência
- salvar
- listar:
  - ocorrências deste agendamento
  - ocorrências recentes do paciente

---

## Pós-MVP — Relatório por código
Sugestão de entregáveis:
- filtro por período
- contagem por código
- export CSV/PDF
- filtros por profissional/paciente (se aplicável)

---

## Checklist de validação
- [ ] Registrar ocorrência salva na subcoleção da ocorrência.
- [ ] Registrar ocorrência cria espelho no paciente.
- [ ] Lista “ocorrências recentes do paciente” funciona sem pedir índice composto.
