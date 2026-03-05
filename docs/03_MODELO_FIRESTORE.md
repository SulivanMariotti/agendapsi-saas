# Modelo Firestore (detalhado) — AgendaPsi

Atualizado: **2026-03-02**

## 1) Regras gerais
- Todos os dados de negócio ficam em `tenants/{tenantId}/...`.
- Evitar `collectionGroup`.
- Preferir escrita/leituras atômicas via transações/batches no server (API routes).
- Evitar índices compostos:
  - agenda usa `slotKey`
  - logs usam subcoleções sem `where + orderBy` na mesma query

---

## 2) Coleções globais

### 2.1 `userTenantIndex/{uid}`
Índice para resolver tenant rapidamente no login (server-side).

Campos:
- `tenantId` (string)
- `role` (`admin` | `professional` | `owner`)
- `isActive` (boolean)
- `updatedAt` (timestamp)

---

## 3) Estrutura por tenant

### 3.1 `tenants/{tenantId}`
Campos:
- `name`
- `ownerUid`
- `timezone` (ex.: `America/Sao_Paulo`)
- `planStatus` (trial|active|past_due|expired)
- `trialEndsAt`
- `createdAt`

### 3.2 Membership — `tenants/{tenantId}/users/{uid}`
Campos:
- `uid`
- `role` (`admin` | `professional` | `owner`)
- `displayName`
- `email`
- `isActive`
- `createdAt`, `updatedAt`

### 3.3 Settings — `tenants/{tenantId}/settings/schedule`
Campos (MVP):
- `slotIntervalMin` (30|45|60)
- `bufferMin` (0..)
- `lunchEnabled` (bool) + `lunchStart`/`lunchEnd` (HH:MM)
- `days` (map por weekday):
  - `enabled` (bool)
  - `ranges`: lista de `{start,end}` em HH:MM
- `defaultBlocks` (int)  # duração padrão em múltiplos do slot
- `updatedAt`

### 3.4 Pacientes — `tenants/{tenantId}/patients/{patientId}`
Campos (MVP):
- `fullName` (string)
- `cpf` (string, 11 dígitos)
- `mobile` (string, dígitos)
- `email` (opcional)
- `birthDate` (YYYY-MM-DD, opcional no doc antigo; recomendado no MVP de cadastro completo)
- `birthMonthDay` (MM-DD, derivado de birthDate; usado para “semana de aniversário”)
  - `portal` (map) — dados do portal do paciente (sem clínico):
    - `termsAcceptedVersion` (number)
    - `termsAcceptedAt` (timestamp)
    - `remindersEnabled` (boolean)
    - `updatedAt` (timestamp)
- `gender` (opcional)
- `occupation` (opcional)
- `notes` (observações gerais, opcional)
- `address` (map, opcional): `zipCode, street, number, complement, district, city, state`
- `emergency` (map, opcional): `name, mobile, relationship`
- `profileCompleted` (bool)
- `createdAt`, `updatedAt`
- (opcional) `activePlanTotalSessions` (int)


#### 3.4.0.1 Anotações do paciente (Portal)
`tenants/{tenantId}/patients/{patientId}/patientNotes/{noteId}`

Campos (MVP):
- `text` (string, até 2000 chars)
- `createdAt`, `updatedAt` (serverTimestamp)
- `deletedAt` (timestamp|null) — exclusão lógica
- `createdBy` (string, uid do paciente)
- `source` (string) = `patientPortal`

> Notas do paciente **não são** prontuário/evolução do profissional. São um módulo do portal e devem ser tratadas com cautela (LGPD).



#### 3.4.0.2 Biblioteca de artigos (Admin → Paciente)

**Fonte da verdade:** Painel Admin (já existente)  
Coleções globais (MVP):
- `library_articles/{articleId}`
- `library_categories/{categoryId}` (opcional; para curadoria por trilhas/categorias)

Campos em `library_articles` (MVP):
- `title` (string)
- `categoryId` (string, ex.: `geral`)
- `categoryLabel` (string, ex.: `Geral`)
- `summary` (string)
- `content` (string) **ou** `body` (array de strings)
- `status` (string: `draft` | `published`)
- `pinned` (boolean)
- `order` (number) (ordem de curadoria)
- `readingTime` (string opcional, ex.: `"3 min"`)
- `createdAt`, `updatedAt` (serverTimestamp)

Regras:
- O paciente lê a biblioteca via **API server-side** (Admin SDK) — sem acesso direto ao Firestore no client.
- O paciente vê **somente artigos publicados** (`status === "published"`).

> Observação (multi-tenant): no MVP a biblioteca é **global** (conteúdo do produto).  
> Se no futuro precisar por tenant, migramos para `tenants/{tenantId}/library_articles` preservando a UI/UX e mantendo compatibilidade por API.

#### 3.4.1 Evolução por sessão (prontuário)

#### 3.4.1 Evolução por sessão (prontuário)
 Evolução por sessão (prontuário)
`tenants/{tenantId}/patients/{patientId}/sessionEvolutions/{occurrenceId}`

Campos:
- `occurrenceId` (string)  # redundante (docId = occurrenceId)
- `seriesId` (string, opcional)
- `sessionStartAt` (timestamp)  # data/hora da sessão
- `text` (string)  # texto livre (sem código)
- `createdByUid` (string)
- `createdAt`, `updatedAt`

> Observação: excluir o agendamento libera horário, mas **não apaga** este documento.

#### 3.4.2 Ocorrências “extra” (espelho no paciente)
`tenants/{tenantId}/patients/{patientId}/occurrenceLogs/{logId}`

Campos:
- `patientId`
- `occurrenceId` (string)
- `seriesId` (string, opcional)
- `sessionStartAt` (timestamp)  # data/hora da sessão associada (quando existir)
- `codeId` (string)
- `code` (string)  # snapshot do código para facilitar relatórios
- `description` (string)
- `createdByUid`
- `createdAt`

### 3.5 Catálogo de códigos (Admin)
`tenants/{tenantId}/occurrenceCodes/{codeId}`

Campos:
- `code` (string, ex.: `OC01`)
- `description` (string)
- `isActive` (boolean)
- `createdAt`, `updatedAt`

### 3.6 Séries — `tenants/{tenantId}/appointmentSeries/{seriesId}`
Campos (MVP):
- `type` (`appointment` | `hold`)
- `repeatFrequency` (daily|weekly|biweekly|monthly)
- `plannedTotalSessions` (int)
- `startsAt` (timestamp)
- `endsAt` (timestamp, opcional)
- `patientId` (opcional, até converter hold)
- `createdAt`, `updatedAt`

### 3.7 Ocorrências — `tenants/{tenantId}/appointmentOccurrences/{occurrenceId}`
Campos (MVP):
- `seriesId` (string, opcional)
- `groupId` (string)  # agrupa blocos da mesma sessão
- `isBlock` (boolean)
- `blockIndex` (0..n-1)
- `startAt` (timestamp)
- `endAt` (timestamp)
- `slotKey` (`YYYY-MM-DD#HH:MM`)
- `isHold` (boolean)
- `status` (agendamento)  # hold não altera
- `sessionIndex` (int)
- `plannedTotalSessions` (int)
- `patientId` (string, opcional)
- `leadName`, `leadMobile` (para hold sem paciente)
- `patientSnapshot` (opcional, para render rápido): `{ fullName, mobile, notes, birthMonthDay }`
- `createdAt`, `updatedAt`

#### 3.7.1 Ocorrências “extra” (subcoleção na ocorrência)
`tenants/{tenantId}/appointmentOccurrences/{occurrenceId}/occurrenceLogs/{logId}`

Campos:
- `occurrenceId`
- `patientId`
- `seriesId` (opcional)
- `sessionStartAt` (timestamp)
- `codeId`, `code`
- `description`
- `createdByUid`
- `createdAt`

---

#### 3.4.0.3 Acesso do paciente (código one-time) — opcional (MVP recomendado)
Se o login do paciente for feito via **código de acesso (6 dígitos)** emitido pelo Profissional/Admin:

Coleção global (evita collectionGroup):
- `patientAccessCodes/{code}`

Campos sugeridos (MVP):
- `tenantId` (string)
- `patientId` (string)
- `issuedByUid` (string) — profissional/admin que gerou
- `expiresAt` (timestamp)
- `usedAt` (timestamp|null)
- `usedByUid` (string|null) — uid do paciente após consumo
- `createdAt` (timestamp)

Regras:
- Código é **one-time**: ao consumir, setar `usedAt`.
- Expiração curta (ex.: 15 min; configurável por env).
- Em produção, recomendado armazenar **hash do código** (hardening), se necessário.

---

#### 3.4.0.4 Lembretes (portal) — link ao Admin (quando aplicável)
A preferência do paciente fica no doc do paciente (`patients.portal.remindersEnabled`).  
Se o painel Admin de lembretes do projeto depender de uma estrutura global, espelhar opt-in/out (best-effort) em:

- `subscribers/{phoneCanonical}` (global)
  - `tenantId` (string)
  - `patientId` (string)
  - `status` ("active" | "disabled")
  - `updatedAt` (timestamp)

> Observação: a coleção exata pode variar conforme o módulo Admin existente. O portal deve **mapear para a fonte de verdade do Admin**, sem criar um sistema paralelo.

---

## 4) Operações críticas
### 4.1 Criar Agendar / Hold
- Respeitar schedule + buffer + multi-bloco.
- Criar `appointmentSeries` (quando recorrente) e materializar ocorrências.
- Operação atômica para recorrência (sem criação parcial).

### 4.2 Converter hold → agendamento
- Atualiza tipo na série e converte ocorrências existentes.
- Pode estender para novo total (materializa adicionais).
- Operação atômica (sem conflito).

### 4.3 Reagendar recorrente
- Perguntar: “Só esta” vs “Esta e futuras”.
- Operação atômica (conflito bloqueia).

### 4.4 Excluir
- Perguntar: “Só esta” vs “Esta e futuras”.
- Remove ocorrências da agenda (libera horário).
- Não apagar evolução (prontuário) nem ocorrência extra do paciente.

---

## 5) Índices
- Preferir não depender de índices compostos.
- Se for inevitável (futuro), registrar explicitamente em docs a necessidade do índice e o motivo.