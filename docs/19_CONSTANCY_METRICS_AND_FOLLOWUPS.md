# 19_CONSTANCY_METRICS_AND_FOLLOWUPS

Como medir **constância terapêutica** (presença/faltas) e usar isso para sustentar vínculo — sem julgamento, com firmeza.

> Princípio clínico: **comparecer é parte do tratamento**. A consistência cria condições para mudança.

---

## 1) Fonte de dados (canônica)

### 1.1 `attendance_logs/*`
Coleção para registrar presença/falta por sessão (importada por planilha ou lançada no Admin).

**Campos principais**
- `patientId` (string) ✅ id externo/sistema
- `phoneCanonical` (string|null) ✅ chave operacional quando houver
- `phoneSource` (`profile|csv|null`) *(opcional; auditoria do fallback)*
- `isLinked` (boolean) *(opcional; indica vínculo por ID/telefone)*
- `linkedUserId` (string|null) *(opcional; quando conseguiu resolver o `users/{uid}`)*
- `name` (string|null) *(opcional; denormalizado para UI)*
- `isoDate` (string `YYYY-MM-DD`) ✅ data real da sessão
- `time` (string `HH:mm`) *(opcional)*
- `profissional` / `professional` (string|null) *(opcional)*
- `service` (string|null) *(opcional)*
- `location` (string|null) *(opcional)*
- `status` (`present|absent`)
- `source` (`import|manual`)
- `createdAt` / `updatedAt` (timestamp)
- `payload` (map) *(opcional; dados originais sem sensíveis)*

### 1.2 Follow-up (anti-spam / rastreabilidade)
Quando o Admin envia follow-ups, o sistema grava em:
- `attendance_logs/{id}.followup`:
  - `sentAt` (timestamp) ✅ marca envio bem-sucedido
  - `status` (`present|absent`) ✅ tipo enviado
  - `lastAttemptAt` (timestamp)
  - `lastResult` (`sending|sent|error`)
  - `lastError` (string curta; só em falha)

**Regra de idempotência:**
- se `followup.sentAt` existir, o endpoint **não reenviará** (evita spam).

---

## 2) Métricas de constância (painel)

Para janela de tempo (ex.: 30/60/90 dias):
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

### 2.2 Endpoint de resumo (Admin)

**GET** `/api/admin/attendance/summary?days=7|30|90&professional=&service=&location=&patientId=&phone=`

**Princípio:** calcular sempre por `isoDate` (data real da sessão). Filtros são aplicados **em memória** (comparação por *contains*) para evitar dependência de índices compostos.

**Query params (opcionais)**
- `professional` (ou `pro`) *(contains)*
- `service` *(contains)*
- `location` *(contains)*
- `patientId` *(match exato)*
- `phone` *(normaliza para `phoneCanonical`)*

**Resposta (campos principais)**
- `present`, `absent`, `total`, `attendanceRate`
- `byDay[]` → `{ isoDate, present, absent, unknown, total }`
- `daysWithData`, `daysWithoutData`
- `attention[]` (heurística por paciente/telefone) → `{ phoneCanonical, lastIsoDate, lastStatus, absentStreak, rate, present, absent, total }`
- `segments` → contagem por faixa: `{ stable, watch, risk, insufficient }`
- `trend` → tendência simples (quando houver volume): `{ prevRate, recentRate, delta, label }`
- `filtersApplied` + `range` + `computedAt`

---

## 3) Follow-ups por constância

### 3.1 Endpoint
- `POST /api/admin/attendance/send-followups`
- Suporta `dryRun: true`.

### 3.2 Bloqueios server-side (obrigatório)
Antes de enviar:
- paciente inativo → `inactive_patient`
- subscriber inativo → `inactive_subscriber`
- sem pushToken → `no_token`
- sem telefone → `no_phone`
- já enviado → `already_sent`

**Bloqueios de segurança (evitar envio errado):**
- paciente não vinculado → `unlinked_patient`
- telefone resolve para +1 perfil → `ambiguous_phone`
- conflito entre telefone do log e do perfil → `phone_mismatch`

### 3.3 Templates (config/global)
- `attendanceFollowupPresentTitle`
- `attendanceFollowupPresentBody`
- `attendanceFollowupAbsentTitle`
- `attendanceFollowupAbsentBody`

Placeholders suportados (compatível com legado `{{nome}}`):
- `{nome}`, `{data}`, `{dataIso}`, `{hora}`, `{profissional}`, `{servico}`, `{local}`, `{id}`

### 3.4 Tom e objetivo
- Presença: reforço positivo (“sua presença sustenta o processo”).
- Falta: psicoeducação firme e acolhedora (“a continuidade faz diferença; retomar é parte do cuidado”).
- **Sem CTA de cancelar/remarcar.**

---

## 4) Import (deduplicação)

Ao importar, deduplicar no mínimo por:
- `patientId + isoDate + time + profissional`

E manter o registro mais recente (por `updatedAt`).

---

## 5) Observabilidade

- Em `dryRun`, retornar:
  - total de candidatos
  - total de enviados
  - contadores por motivo de bloqueio
- Sem armazenar PII em `history`.
