# 16_API_ENDPOINTS_CATALOG.md

> Norte clínico: rotas críticas (envio/decisões) devem ser **server-side** para proteger a constância.

## Convenções
- Next.js App Router: endpoints existem como `.../route.js`.
- Auth Admin: `Authorization: Bearer <Firebase ID Token>` + `role=admin` (custom claims; ver `requireAdmin`).
- Auth Paciente: `Authorization: Bearer <Firebase ID Token>` + `role=patient` (ver `requirePatient`).
- Cron/segredo: `CRON_SECRETS` (ou compat `CRON_SECRET`) via header `Authorization: Bearer ...` (preferido) ou `x-cron-secret`.
- Rate limit: rotas críticas usam limiter (algumas com backing global no Firestore via `_rate_limits`).
- Validação: rotas críticas usam **schema-lite** (`src/lib/server/payloadSchema.js`) com `readJsonBody` + `allowedKeys`.

---

## Paciente

### 1) Resolver telefone/canonicalização
- **GET** `/api/patient/resolve-phone`
- **Auth:** obrigatório (patient)
- **Uso:** garante `phoneCanonical` (fonte: `users/{uid}`; fallbacks quando necessário).

### 2) Agenda do paciente (server-side)
- **GET** `/api/patient/appointments`
- **Auth:** obrigatório (patient)
- **Uso:** retorna sessões futuras do paciente via Admin SDK.
- **Motivo:** evitar `permission-denied` e reduzir superfície (paciente não lê `appointments/*` direto no Firestore).

### 3) Biblioteca (artigos publicados)
- **GET** `/api/patient/library/list`
- **Auth:** obrigatório (patient)
- **Uso:** retorna apenas artigos **publicados**.

### 4) Push token (registrar)
- **POST** `/api/patient/push/register`
- **Auth:** obrigatório (patient)
- **Uso:** salva `pushToken` em `subscribers/{phoneCanonical}` (ou estrutura equivalente).

### 5) Push status (diagnóstico)
- **GET** `/api/patient/push/status`
- **Auth:** obrigatório (patient)
- **Uso:** retorna status/permissão/token.

### 6) Pareamento (vínculo)
- **POST** `/api/patient/pair`
- **Auth:** obrigatório (patient)
- **Uso:** fluxo de vinculação por telefone+código.

### 7) Ping (lastSeen)
- **POST** `/api/patient/ping`
- **Auth:** obrigatório (patient)
- **Uso:** atualiza `users/{uid}.lastSeen` server-side.

### 8) Contrato (aceite)
- **POST** `/api/patient/contract/accept`
- **Auth:** obrigatório (patient)
- **Uso:** registra aceite idempotente (versão + data).

### 9) Notas (para levar para a sessão)
- **GET** `/api/patient/notes`
- **POST** `/api/patient/notes`
- **DELETE** `/api/patient/notes/[id]`
- **Auth:** obrigatório (patient)
- **Uso:** CRUD mínimo de notas do paciente (server-side) para evitar regras permissivas no Firestore.

---

## Presença / Compromisso (Paciente)

### 10) Confirmar presença
- **POST** `/api/attendance/confirm`
- **Auth:** obrigatório (patient)
- **Uso:** registra evento (ex.: `patient_confirmed`) para reforço de compromisso.
- **Integridade:** servidor **deriva o telefone do perfil** (`users/{uid}`) e **ignora `phone` do client**.

### 11) Consultar confirmados
- **GET** `/api/attendance/confirmed`
- **Auth:** obrigatório (patient)
- **Compat:** `GET /api/attendance/confirmd` é alias.

---

## Metadados operacionais (Admin)

### 12) Última sincronização de agenda
- **GET** `/api/appointments/last-sync`
- **Auth:** obrigatório (admin)
- **Uso:** metadados internos para diagnóstico de import/sync (não expor ao paciente).

---

## Admin — Agenda e lembretes

### 13) Enviar lembretes (manual)
- **POST** `/api/admin/reminders/send`
- **Auth:** obrigatório (admin)
- **Uso:** envio manual por slot (48h/24h/12h) com preview/dryRun e idempotência por sessão+slot.

---

## Admin — Constância (presença/faltas)

### 14) Importar presença/faltas
- **POST** `/api/admin/attendance/import`
- **Auth:** obrigatório (admin)
- **Uso:** importar logs (planilha 2) para `attendance_logs/*`.

### 15) Resumo/métricas
- **GET** `/api/admin/attendance/summary?days=7|30|90`
- **Auth:** obrigatório (admin)
- **Uso:** métricas agregadas. Período calculado por **`isoDate`** (data real da sessão).

### 16) Enviar follow-ups (presença/falta)
- **POST** `/api/admin/attendance/send-followups`
- **Auth:** obrigatório (admin)
- **Idempotência:** se `attendance_logs/{id}.followup.sentAt` existe → não reenviar.
- **Bloqueios de segurança:** `unlinked_patient`, `ambiguous_phone`, `phone_mismatch` (evita envio para pessoa errada).
- **DryRun:** retorna amostra interpolada + motivos de bloqueio.

---

## Admin — Biblioteca (Artigos)

### 17) Artigos
- **GET** `/api/admin/library/articles`
- **POST** `/api/admin/library/articles`
- **PATCH** `/api/admin/library/articles/[id]`
- **DELETE** `/api/admin/library/articles/[id]`

### 18) Seed (modelo)
- **POST** `/api/admin/library/seed`

### 19) Categorias
- **GET** `/api/admin/library/categories`
- **POST** `/api/admin/library/categories`
- **PATCH** `/api/admin/library/categories/[id]`
- **DELETE** `/api/admin/library/categories/[id]`
- **POST** `/api/admin/library/categories/bootstrap`

---

## Cron (opcional)

### 20) Enviar lembretes automaticamente
- **GET** `/api/cron/reminders`
- **Auth:** segredo via header.

### 21) Limpeza de logs (retenção)
- **GET** `/api/cron/retention`
- **Auth:** segredo via header.

---

## Admin — Operação (Ops)

### 22) Health check
- **GET** `/api/admin/ops/health`

### 23) Registro do dia (auditoria operacional)
- **GET** `/api/admin/ops/daily-log?date=YYYY-MM-DD`
- **POST** `/api/admin/ops/daily-log`

### 24) Listagem de registros
- **GET** `/api/admin/ops/daily-logs?days=14`

---

## Endpoints legados
- `_push_old/*`: **desativados** (410 em dev / 404 em produção).
- `/api/patient-auth` (login paciente por e-mail): **desativado por padrão**; só habilitar com env explícita (não recomendado).


### 25) Suspender/reativar acesso do paciente (segurança)
- **POST** `/api/admin/patient/access`
- **Auth:** obrigatório (admin)
- **Uso:** suspender acesso ao painel do paciente **apenas** por segurança/privacidade (ex.: aparelho perdido, pareamento indevido).  
  **Não** é mecanismo para lidar com faltas; faltas são tratadas com psicoeducação + follow-ups.
- **Payload (mínimo):** `{ uid, accessDisabled: true|false, reason? }`
- **Side-effects:** escreve em `users/{uid}` (`accessDisabled`, `accessDisabledAt`) + `audit_logs` + `history`.

