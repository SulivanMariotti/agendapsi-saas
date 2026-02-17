# 19_CONSTANCY_METRICS_AND_FOLLOWUPS

Como medir **constância terapêutica** (presença/faltas) e usar isso para sustentar vínculo — sem julgamento, com firmeza.

> Princípio clínico: **comparecer é parte do tratamento**.

---

## 1) Fonte de dados (canônica)

### 1.1 `attendance_logs/*`
Coleção para registrar presença/falta por sessão (importada por planilha ou lançada no Admin).

**Campos (alinhado com o endpoint atual)**
- `attendance_logs/{id}`:
  - `patientId` (string) ✅ chave externa (se existir)
  - `patientPhoneCanonical` (string) ✅ chave operacional (preferido)
  - `name` (string) *(opcional; denormalizado para UI)*
  - `isoDate` (string `YYYY-MM-DD`) ✅ data da sessão
  - `time` (string `HH:mm`) *(opcional)*
  - `profissional` / `professional` (string) *(opcional)*
  - `status` (string: `"present" | "absent"`)
  - `source` (string: `"import" | "manual"`)
  - `createdAt` (timestamp)
  - `updatedAt` (timestamp) *(recomendado para dedup/merge do import)*
  - `payload` (map) *(opcional; dados originais sem sensíveis)*

### 1.2 Campos de follow-up (anti-spam / rastreabilidade)
Quando o Admin envia follow-ups, o sistema grava em:

- `attendance_logs/{id}.followup`:
  - `sentAt` (timestamp) ✅ marca envio bem-sucedido
  - `status` (`present|absent`) ✅ qual tipo foi enviado
  - `lastAttemptAt` (timestamp)
  - `lastResult` (`sending|sent|error`)
  - `lastError` (string curta; só em falha)

**Regra de idempotência:**
- Se `followup.sentAt` existir, o endpoint **não reenviará** (evita spam).

---

## 2) Métricas de constância (painel)

Para cada paciente (por janela de tempo: últimos 30/60/90 dias):
- `sessionsAttended` (int)
- `sessionsMissed` (int)
- `attendanceRate` = `attended / (attended + missed)`
- `streakPresent` (int)
- `streakAbsent` (int)
- `lastStatus` + `lastIsoDate`

### 2.1 Indicadores clínicos (heurísticos)
> São sinais para **cuidado ativo**, não para punição.

- **Risco leve:** 1 falta no último mês
- **Risco moderado:** 2 faltas em 60 dias
- **Risco alto:** 2 faltas seguidas ou ≥3 faltas em 90 dias

---

## 3) Follow-ups por constância

### 3.1 Endpoint
- `POST /api/admin/attendance/send-followups`
- Suporta `dryRun: true`.

### 3.2 Bloqueios server-side (obrigatório)
Antes de enviar:
- paciente inativo → bloqueia (`inactive_patient`)
- subscriber inativo → bloqueia (`inactive_subscriber`)
- sem pushToken → bloqueia (`no_token`)
- sem telefone → bloqueia (`no_phone`)
- já enviado (`followup.sentAt`) → bloqueia (`already_sent`)

### 3.3 Templates (config/global)
- `attendanceFollowupPresentTitle`
- `attendanceFollowupPresentBody`
- `attendanceFollowupAbsentTitle`
- `attendanceFollowupAbsentBody`

Placeholders suportados:
- `{nome}`, `{data}`, `{dataIso}`, `{hora}`, `{profissional}`, `{servico}`, `{local}`, `{id}`
- Compatível com legado `{{nome}}`.

### 3.4 Tom e objetivo
- Presença: reforço positivo (“sua presença sustenta o processo”).
- Falta: psicoeducação firme e acolhedora (“a continuidade faz diferença; retomar é parte do cuidado”).
- **Sem CTA de cancelar/remarcar.**

---

## 4) Import (deduplicação)

Quando importar de planilha, deduplicar (no mínimo) por:
- `patientId + isoDate + time + profissional`

E manter apenas o registro mais recente (por `updatedAt`).

---

## 5) Observabilidade

- Preferir logs/auditoria no Admin para:
  - `dryRun`
  - total de candidatos
  - contadores por motivo de bloqueio

Sem armazenar dados sensíveis no `history`.

