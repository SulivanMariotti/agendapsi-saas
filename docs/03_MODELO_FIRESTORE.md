# 03 — Modelo de dados Firestore (MVP)

**Objetivo:** organizar a estrutura multi-tenant e os documentos necessários para o MVP.

---

## 1) Princípios de modelagem
- **Multi-tenant:** dados isolados por tenant (subcoleções dentro de `tenants/{tenantId}`).
- **Agenda performática:** consultas por janela (dia/semana/mês) devem bater em uma coleção de ocorrências com índice em `startAt`.
- **Recorrência escalável:** `appointmentSeries` define regra; `appointmentOccurrences` materializa instâncias.
- **Histórico preservado:** mudanças em séries recalculam futuro sem sobrescrever passado.
- **CPF não deve ser ID do documento:** manter ID aleatório e CPF como campo; unicidade via validação server-side/índice auxiliar (a implementar).

---

## 2) Árvore de coleções (sugerida)
```
tenants/{tenantId}
  users/{uid}
  settings/schedule
  patients/{patientId}
  occurrenceCodes/{codeId}
  whatsappTemplates/{templateId}
  appointmentSeries/{seriesId}
  appointmentOccurrences/{occId}
  slotReservations/{reservationId}
```

---

## 3) Documentos e campos essenciais

### 3.1 `tenants/{tenantId}`
- `name` (string)
- `ownerUid` (string)
- `planStatus` (string: trial|active|past_due|expired)
- `trialDays` (number = 10)
- `trialEndsAt` (timestamp)
- `timezone` (string, ex.: America/Sao_Paulo)
- `createdAt` (timestamp)

### 3.2 `tenants/{tenantId}/users/{uid}`
- `role` (string: owner|professional)
- `displayName` (string)
- `isActive` (boolean)
- `createdAt` (timestamp)

### 3.3 `tenants/{tenantId}/settings/schedule`
- `sessionDurationMin` (number; 0 = não configurado)
- `bufferMin` (number; 0 = não configurado)
- `timezone` (string)
- `weekAvailability` (map: mon..sun → array de blocos `{start,end}`)
- `lunchBreakEnabled` (boolean)
- `lunchStart` (string "HH:mm")
- `lunchEnd` (string "HH:mm")
- `lunchDays` (array de strings)
- `updatedAt` (timestamp)

### 3.4 `tenants/{tenantId}/patients/{patientId}`
Campos mínimos (pré-cadastro):
- `fullName` (string)
- `cpf` (string)
- `profileStatus` (string: pre_cadastro|completo)
- `createdFrom` (string: quick_booking|full_form)
- `mobile` (string, formato E.164 recomendado)
- `createdAt`, `updatedAt` (timestamp)

Campos completos (cadastro detalhado):
- Identificação: `legalName`, `socialName`, `email`, `birthDate`, `sexBiological`, `gender`, `maritalStatus`
- Docs: `rg`
- Endereço: `cep`, `address`, `number`, `complement`, `district`, `city`, `stateUF` (+ `addressAutoFilled` boolean opcional)
- Menor: `isMinor`, `motherName`, `motherJob`, `fatherName`, `fatherJob`, `guardianName`, `guardianCpf`
- Outras: `education`, `job`, `company`, `weightKg`, `heightCm`, `bloodType`
- Origem: `howFoundMe`, `referredByName`, `referredByPhone`
- `generalNotes` (string) — deve aparecer no agendamento/slot (snapshot)

### 3.5 `tenants/{tenantId}/slotReservations/{reservationId}`
- `startAt`, `endAt` (timestamp)
- `leadName` (string)
- `leadMobile` (string)
- `status` (string: held|converted|cancelled)
- `replicateUntil` (timestamp; max 15 dias)
- `createdAt`, `updatedAt`

### 3.6 `tenants/{tenantId}/appointmentSeries/{seriesId}`
- `patientId` (string)
- `active` (boolean)
- `totalSessions` (number, ex.: 30)
- Recorrência:
  - `recurrenceType` (weekly|biweekly|monthly|custom)
  - `recurrenceInterval` (number)
  - `daysOfWeek` (array ["mon","wed"])
  - `startsAt` (timestamp)
- Snapshot de agenda:
  - `sessionDurationMin` (number)
  - `bufferMin` (number)
  - `locationType` (string: presencial|online) (tag no MVP)
- `createdAt`, `updatedAt`

### 3.7 `tenants/{tenantId}/appointmentOccurrences/{occId}`
- `seriesId` (string)
- `patientId` (string)
- `startAt`, `endAt` (timestamp)
- `status` (Agendado|Confirmado|Finalizado|Não comparece|Cancelado|Reagendado)
- `sessionNumber` (number)  → para “4/30”
- `totalSessions` (number)  → snapshot
- `occurrenceCodeId` (string, opcional)
- `observation` (string, opcional)
- `progressNote` (string, opcional; prontuário da sessão)
- `patientSnapshot` (map leve para agenda):
  - `displayName`, `mobile`, `generalNotes`, `birthMonthDay`
- `isBirthdayWeek` (boolean, opcional; pode ser calculado e/ou gravado)
- `createdAt`, `updatedAt`

### 3.8 Catálogos
`tenants/{tenantId}/occurrenceCodes/{codeId}`
- `code`, `description`, `isActive`, `createdAt`

`tenants/{tenantId}/whatsappTemplates/{templateId}`
- `title`, `body` (com placeholders `{nome}`, `{data}`, `{hora}`)
- `isActive`, `sortOrder`, `createdAt`

---

## 4) Operações críticas (definições)
### 4.1 Edição “somente esta” vs “futuros”
- “Somente esta” → escreve apenas na ocorrência.
- “Futuros” → altera série e rematerializa ocorrências futuras (preserva passado).

### 4.2 Reagendado
- Ocorrência original recebe status **Reagendado**.
- Nova ocorrência mantém o mesmo `sessionNumber` quando fizer sentido (regra simples do MVP).

### 4.3 Semana do aniversário
- Regra: marcar ocorrências que caem na semana em que o aniversário ocorre (definir critério de semana: Seg–Dom).

---

## 5) Índices (planejamento)
A definir na implementação conforme queries do app:
- Ocorrências por intervalo de datas (`startAt`) + filtro por status.
- Ocorrências por `patientId` para prontuário completo.
- Reservas por intervalo de datas (`startAt`).

---

## 6) Itens em aberto
- Política de leitura do paciente quando plano expira.
- Mapa de cores por status (UI).
- Unicidade de CPF por tenant (implementar via backend/índice auxiliar).


---

## 9) Settings — Schedule (Agenda do Profissional) ✅

Documento:
- `tenants/{tenantId}/settings/schedule`

Campos (proposta atual):
- `slotIntervalMin`: 30 | 45 | 60
- `bufferMin`: number (ex.: 0, 10, 15, 30)
- `defaultBlocks`: number (ex.: 1..6)
- `week`: mapa por dia da semana (ex.: `mon..sun`)
  - `enabled`: boolean
  - `ranges`: lista de períodos (ex.: `{ start: "08:00", end: "18:00" }`)
- `lunchBreak` (opcional):
  - `enabled`: boolean
  - `start`: "12:00"
  - `end`: "13:00"

Normalização:
- Ao salvar, o servidor deriva `weekAvailability` (ranges efetivos) removendo o almoço.
- A UI do Profissional consome ranges “do dia” (dayRanges) e renderiza slots apenas dentro do horário aberto.

Consultas:
- **Dia**: buscar ocorrências por janela `[startOfDay, endOfDay)` filtrando por `startAt`.
- **Semana/Mês**: buscar por janela e agrupar client-side por `isoDate` (YYYY-MM-DD).

