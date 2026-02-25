# 44 — Presença/Faltas — Modelo de Dados (attendance_logs)

Este módulo existe para sustentar **constância** (vínculo terapêutico) por meio de:
- **Import** de presença/falta (segunda planilha / relatório)
- **Painel de constância** (taxa, tendência, lista de atenção)
- **Follow-ups** (parabenizar presença / orientar no retorno após falta)

> Diretriz clínica do produto: **sem CTA de cancelar/remarcar** no paciente.

---

## 1) Coleção principal

### `attendance_logs/{docId}`
Documento “por sessão” (no sentido do relatório), criado/atualizado via **API server-side (Admin SDK)**.

**Por que `attendance_logs`?**
- Evita depender de leitura/escrita client-side (rules) para dados sensíveis
- Mantém rastreabilidade (audit/history)
- Permite follow-ups com idempotência

---

## 2) Identidade do documento (docId)

O import gera um `docId` determinístico para garantir **idempotência** e evitar duplicação.

**Formato atual (import v2):**

```
{patientExternalId}_{isoDate}_{HHMM}_{profSlug}
```

Exemplo:
```
12345_2026-02-24_1400_luana
```

**Observações**
- `patientExternalId` aqui é o **ID do relatório/planilha** (o mesmo que o campo `users.patientExternalId`)
- `isoDate` é a data real da sessão (`YYYY-MM-DD`)
- `HHMM` é a hora normalizada (`14:00` → `1400`)
- `profSlug` é um slug curto do profissional, para reduzir colisões quando há múltiplos profissionais no mesmo horário

---

## 3) Campos do documento

### Identificação e vínculo
- `patientId` (string) — **ID do relatório** (alias do external id). *Não é o `uid` do Firebase Auth.*
- `linkedUserId` (string|null) — `users/{uid}` quando encontrado (vínculo de segurança)
- `isLinked` (boolean) — se o ID do relatório foi encontrado em `users` (`patientExternalId` ou `patientId` legado)

### Contato (para follow-up)
- `phoneCanonical` (string|null) — `DDD+número` (10/11 dígitos), sem `55`
- `phoneSource` (`profile|csv|null`) — de onde veio o telefone
- `hasPhone` (boolean)

> Regra clínica + segurança: **follow-up só envia quando existe vínculo seguro**.
> Se o paciente não estiver vinculado (`isLinked=false`), o sistema pode registrar o telefone **para constância**, mas **bloqueia o envio** até corrigir o cadastro.

### Dados da sessão (do relatório)
- `name` (string|null) — nome do paciente (pode vir do CSV ou do perfil)
- `isoDate` (string) — `YYYY-MM-DD` (data real da sessão)
- `time` (string) — `HH:MM`
- `profissional` (string|null)
- `service` (string|null)
- `location` (string|null)

### Presença/Falta
- `status` (`present|absent`) — normalizado
- `statusRaw` (string|null) — valor original (quando disponível)

### Metadados
- `source` (string) — nome da fonte/planilha
- `createdAt` (Timestamp) — timestamp do import
- `updatedAt` (Timestamp) — timestamp do import (merge/upsert)

### Metadados de follow-up (idempotência)
Campo aninhado `followup` (criado pelo endpoint de disparo):
- `followup.sentAt` (Timestamp)
- `followup.batchId` (string)
- `followup.status` (`present|absent`)
- `followup.lastAttemptAt` (Timestamp)
- `followup.lastResult` (`sending|sent|error`)
- `followup.lastError` (string|null)

---

## 4) Import (segunda planilha / relatório)

### Endpoint
- `POST /api/admin/attendance/import`

### Regras essenciais
- Colunas obrigatórias: **ID** e **DATA/HORA** (ou `DATA` + `HORA`)
- Separador: autodetect (`;` | `,` | TAB)
- Suporta **modo auto** e **modo mapeado** (quando o relatório tem cabeçalhos diferentes)

### Saída do import
- `dryRun=true` → validação e preview
  - `errors` (bloqueiam linha)
  - `warnings` (importa, mas aponta qualidade/segurança)
  - `normalizedRows` (amostra/preview normalizado)
- `dryRun=false` → persiste e registra `history` (`attendance_import_summary`)

---

## 5) Painel de constância

### Endpoint
- `GET /api/admin/attendance/summary?days=7|30|90`

### Importante (clínico)
O período é calculado por **`isoDate`** (data real da sessão), não por `createdAt`.

O painel retorna:
- taxa geral
- `byDay` (série diária)
- `attention` (lista priorizada por streak de faltas + última falta + baixa taxa)
- segmentação heurística (`stable/watch/risk/insufficient`)

---

## 6) Follow-ups (presença/falta)

### Endpoint
- `POST /api/admin/attendance/send-followups`

### Proteções
- **Idempotência:** não reenvia quando `followup.sentAt` já existe
- **Segurança de vínculo:** bloqueia quando:
  - `unlinked_patient` (não encontrou paciente no `users` pelo ID do relatório)
  - `ambiguous_phone` (telefone aparece em +1 cadastro)
  - `phone_mismatch` (telefone do log conflita com o telefone do perfil)
  - `no_token` (subscriber sem token)

---

## 7) Boas práticas operacionais

- Sempre rode **dryRun** antes de importar e antes de disparar follow-ups.
- Se aparecer `unlinked_patient`, corrija o cadastro (ID do relatório ↔ `users.patientExternalId`).
- Trate bloqueios como proteção clínica e de privacidade: **melhor não enviar do que enviar no paciente errado**.

