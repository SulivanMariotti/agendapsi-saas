# Modelo de dados — AgendaPsi (SaaS)

Atualizado: **2026-02-28**

> Este arquivo é o “resumo executivo” do modelo. Para detalhes completos: `docs/03_MODELO_FIRESTORE.md`.

---

## 1) Princípios
- **Isolamento por tenant**: todo dado de negócio vive dentro de `tenants/{tenantId}/...`.
- **Índice global mínimo**: apenas `userTenantIndex/{uid}` fora de `tenants/` para resolver tenant rapidamente no login.
- **Agenda por janela de tempo**: consultas Dia/Semana/Mês devem buscar **ocorrências** por intervalo (`startAt`).
- **Sem joins**: usar snapshots leves onde necessário (ex.: nome/contato do paciente dentro da ocorrência).
- **Timestamps**: `createdAt/updatedAt` preferencialmente com **serverTimestamp**.

---

## 2) Árvore de coleções (MVP)

```
userTenantIndex/{uid}

tenants/{tenantId}
  users/{uid}
  settings/schedule
  patients/{patientId}
  occurrenceCodes/{codeId}
  whatsappTemplates/{templateId}
  appointmentSeries/{seriesId}
  appointmentOccurrences/{occurrenceId}
  slotReservations/{reservationId}
```

---

## 3) Documentos (campos-chave)

### 3.1 `userTenantIndex/{uid}` (índice global)
- `tenantId` (string)
- `role` (owner|professional|admin)
- `isActive` (boolean)
- `updatedAt` (timestamp)

### 3.2 `tenants/{tenantId}`
- `name` (string)
- `ownerUid` (string)
- `planStatus` (trial|active|past_due|expired)
- `trialEndsAt` (timestamp)
- `timezone` (ex.: America/Sao_Paulo)
- `createdAt` (timestamp)

### 3.3 `tenants/{tenantId}/users/{uid}` (membership canônico)
- `uid` (string — duplicado para consistência/auditoria)
- `role` (owner|professional)
- `displayName` (string)
- `isActive` (boolean)
- `createdAt` (timestamp)

### 3.4 `tenants/{tenantId}/settings/schedule`
Objetivo: definir a “grade” do profissional.
- `slotIntervalMin` (30|45|60)
- `sessionDurationMin` (number)
- `bufferMin` (number)
- `weekAvailability` (map: mon..sun → array de blocos `{start,end}` em HH:mm)
- `lunchBreakEnabled` (boolean)
- `lunchStart`, `lunchEnd` (HH:mm)
- `lunchDays` (array: mon..sun)
- `updatedAt` (timestamp)

### 3.5 `tenants/{tenantId}/patients/{patientId}`
Mínimo (pré-cadastro):
- `fullName`, `cpf`, `mobile`
- `profileStatus` (pre_cadastro|completo)
- `generalNotes` (string — aparece no agendamento)
- `createdAt`, `updatedAt`

Cadastro completo: conforme requisitos (ver `docs/03_MODELO_FIRESTORE.md`).

### 3.6 `tenants/{tenantId}/slotReservations/{reservationId}` (hold)
- `startAt`, `endAt` (timestamp)
- `slotCount` (number) — quantidade de blocos ocupados
- `leadName`, `leadMobile`
- `status` (held|converted|cancelled)
- `replicateUntil` (timestamp — **limite 15 dias**)
- `createdAt`, `updatedAt`

### 3.7 `tenants/{tenantId}/appointmentSeries/{seriesId}`
- `patientId`
- `totalSessions` (number)
- Recorrência (tipo/intervalo/dias)
- Snapshot: `sessionDurationMin`, `bufferMin`, `locationType`
- `createdAt`, `updatedAt`

### 3.8 `tenants/{tenantId}/appointmentOccurrences/{occurrenceId}`
- `seriesId`, `patientId`
- `startAt`, `endAt`
- `slotCount` (number) — quantidade de blocos ocupados
- `status` (Agendado|Confirmado|Finalizado|Não comparece|Cancelado|Reagendado)
- `sessionNumber`, `totalSessions` (para “4/30”)
- `occurrenceCodeId` (opcional)
- `observation` (opcional)
- `progressNote` (opcional)
- `patientSnapshot` (map leve: nome, mobile, generalNotes, birthMonthDay)
- `createdAt`, `updatedAt`

### 3.9 Catálogos
- `occurrenceCodes/{codeId}`: `code`, `description`, `isActive`
- `whatsappTemplates/{templateId}`: `title`, `body`, `isActive`, `sortOrder`

---

## 4) Consultas padrão (MVP)

### Agenda Dia/Semana/Mês
- Buscar em `appointmentOccurrences` e `slotReservations` por intervalo:
  - `startAt >= inicio` AND `startAt < fim`

### Histórico/prontuário do paciente
- Buscar ocorrências por `patientId` ordenadas por `startAt`.

---

## 5) Índices (planejamento)
- `appointmentOccurrences`: índice para janela por `startAt`.
- `appointmentOccurrences`: índice para `patientId + startAt` (histórico).
- `slotReservations`: índice por `startAt`.

---

## 6) Itens em aberto (decisões futuras)
- Unicidade de CPF por tenant (recomendado: validação server-side + índice auxiliar).
- Política de leitura quando `planStatus=past_due/expired`.
