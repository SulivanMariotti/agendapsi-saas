# 16_API_ENDPOINTS_CATALOG.md

> Norte clínico: rotas críticas (envio/decisões) devem ser **server-side** para proteger constância, privacidade e vínculo.

## Convenções
- Next.js App Router: endpoints existem como `.../route.js`.
- Auth Admin: `Authorization: Bearer <Firebase ID Token>` + `admin:true` via custom claims (ver `requireAdmin`).
- Auth Paciente: `Authorization: Bearer <Firebase ID Token>` + `role=patient` (ver `requirePatient`).
- Cron/segredo: `CRON_SECRETS` (ou compat `CRON_SECRET`) via header `Authorization: Bearer ...` (preferido) ou `x-cron-secret`.
- Rate limit: rotas críticas usam limiter (com backing opcional em `_rate_limits`).
- Validação: rotas críticas usam **schema-lite** (`src/lib/server/payloadSchema.js`) com `readJsonBody` + `allowedKeys`.

---

## Paciente

### `GET /api/patient/appointments`
Agenda do paciente (server-side).  
**Auth:** patient.

**Comportamento (janela rolante)**
- Retorna apenas sessões dentro da **janela clínica** (≈ próximos **30 dias**, com tolerância de ~32 dias no servidor).
- Exclui `cancelled` e `done`.

**Resposta (resumo)**
- `items`: sessões (ordenadas por data)
- `meta.lastSyncAt`: carimbo oficial do último sync (derivado de `config/global.appointmentsLastSyncAt`)

### `POST /api/patient/contract/accept`
Aceite do contrato/compromisso terapêutico (server-side).  
**Auth:** patient.

### `POST /api/patient/ping`
Atualiza `lastSeen` (server-side).  
**Auth:** patient.

### `GET /api/patient/notes`
Lista notas do paciente (diário para sessão).  
**Auth:** patient.

### `POST /api/patient/notes`
Cria nota do paciente.  
**Auth:** patient.

### `DELETE /api/patient/notes/[id]`
Remove nota por id (server-side).  
**Auth:** patient.

### `POST /api/attendance/confirm`
Confirma presença. Deriva telefone do perfil (ignora `phone` vindo do client).  
**Auth:** patient.

### `GET /api/attendance/confirmed`
Status de confirmação.  
**Auth:** patient.  
**Obs:** em produção, não expor mensagens internas de erro.

---

## Admin

### `POST /api/admin/patients/list`
Lista/filtra pacientes (paginado).  
**Auth:** admin.

**Body (chaves aceitas)**
- `pageSize`, `pageCursor`
- `search` (ou `q`)
- outros campos conforme implementação (documentar ao mudar)

### `POST /api/admin/patient/access`
Suspende/libera acesso ao painel do paciente por **segurança/privacidade** (não é ferramenta clínica para faltas).  
**Auth:** admin.

**Body**
- `uid` (string) — user id
- `accessDisabled` (boolean)

**Efeito**
- escreve em `users/{{uid}}`: `accessDisabled`, `accessDisabledAt`, `accessStatus`
- registra em `audit_logs` e `history`

### `GET /api/admin/attendance/summary?days=30`
Sumário de constância terapêutica.  
**Auth:** admin.

**Query**
- `days`: `7|30|90`
- filtros opcionais:
  - `pro` / `professional` (contains, case-insensitive)
  - `service` (contains)
  - `location` (contains)
  - `patientId` (match exato)
  - `phone` (normaliza → `phoneCanonical`)

**Resposta (campos principais)**
- `present`, `absent`, `total`, `attendanceRate`
- `byDay`: lista diária no range com `isoDate`, `present`, `absent`, `unknown`, `total`
- `daysWithData`, `daysWithoutData`
- `attention`: lista priorizada com `phoneCanonical`, `lastIsoDate`, `lastStatus`, `absentStreak`, `rate`, `present`, `absent`, `total`
- `segments`: contagens por heurística (`stable/watch/risk/insufficient`)
- `trend`: `prevRate`, `recentRate`, `delta`, `label`
- `filtersApplied`, `cohort`, `range`, `computedAt`
- compat: `topMisses`, `startIsoDate`, `endIsoDate`

### `POST /api/admin/attendance/import`
Importa CSV de **Presença/Faltas** para a coleção `attendance_logs` (server-side via Admin SDK).  
**Auth:** admin.

**Body (JSON)**
- `csvText` (string, obrigatório)
- `source` (string, opcional)
- `defaultStatus` (`present|absent`, opcional)
- `dryRun` (boolean, opcional)
- `reportMode` (`auto|mapped`, opcional)
- `columnMap` (objeto, opcional; usado quando `reportMode=mapped`)

**Retorno (alto nível)**
- `dryRun=true`: retorna `wouldImport`, `skipped`, `errors`, `warnings`, `sample`, `normalizedRows`.
- `dryRun=false`: persiste e registra em `history` como `attendance_import_summary`.

### `POST /api/admin/attendance/send-followups`
Dispara mensagens de reforço (presença) e psicoeducação (falta) com base em `attendance_logs`.  
**Auth:** admin.

**Body (JSON)**
- `days` (number, default 30; permitido: `7|30|90`)
- `limit` (number, default 200; max 1000)
- `dryRun` (boolean)
- `confirm` (string) — **obrigatório quando `dryRun=false`**: `SEND_FOLLOWUPS`

**Guards (anti-envio errado)**
- Range não pode ir para o futuro (`toIsoDate` <= hoje em UTC)
- Janela máxima: **93 dias**
- Prévia (`dryRun=true`) não exige `confirm`


**Idempotência**
- Reenvio é bloqueado quando `attendance_logs/{id}.followup.sentAt` já existe.

**Bloqueios de segurança (principais)**
- `unlinked_patient`: log sem vínculo com `users` (evita enviar para pessoa errada)
- `ambiguous_phone`: telefone aparece em +1 cadastro
- `phone_mismatch`: conflito entre telefone do log e do perfil
- `no_token`: subscriber sem `pushToken`

### `POST /api/admin/appointments/sync-summary`
Persiste metadados do último sync de agenda.  
**Auth:** admin.

**Efeito (alto nível)**
- Atualiza em `config/global`:
  - `appointmentsLastSyncAt`
  - `appointmentsLastUploadId`
  - `appointmentsLastSyncMeta` (resumo do lote)

**Obs:** o Admin deve chamar esta rota **sempre após Sincronizar**, mesmo que o “Verificar” não tenha gerado summary perfeito.

### `POST /api/admin/appointments/prune-future` (ferramenta de testes)
Cancela (não apaga) sessões **futuras** geradas por sync antigo fora da janela (útil para limpar dados de teste).  
**Auth:** admin.

**Gating obrigatório**
- Em produção, por padrão retorna `403 test_tools_disabled`.
- Para habilitar explicitamente: `ENABLE_TEST_TOOLS=true` (backend) e `NEXT_PUBLIC_ENABLE_TEST_TOOLS=true` (UI).

**Body (resumo)**
- `dryRun` (boolean): simula e retorna contagem
- parâmetros de janela conforme implementação

---

## Cron (desabilitado por decisão atual)
- Rotas `/api/cron/*` existem para futuro e estão endurecidas (header-only + rotação de secrets).
