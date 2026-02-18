# 16_API_ENDPOINTS_CATALOG.md

> Norte clínico: rotas críticas (envio/decisões) devem ser **server-side** para proteger a constância.

## Convenções
- Next.js App Router: endpoints existem como `.../route.js`.
- Auth Admin: `Authorization: Bearer <Firebase ID Token>` + `role=admin` (ver `requireAdmin`).
- Segredo (cron): `CRON_SECRETS` (ou compat `CRON_SECRET`) via header `Authorization: Bearer ...` (preferido) ou `x-cron-secret`.
- Legado: query `?key=` só se `ALLOW_CRON_QUERY_KEY=true` (não recomendado).
- Logs/auditoria: ações críticas registram auditoria (quando aplicável).

---

## Paciente

### 1) Resolver telefone/canonicalização
- **GET** `/api/patient/resolve-phone`
- **Auth:** obrigatório
- **Uso:** garante `phoneCanonical` (fonte: `users/{uid}`; fallbacks quando necessário).

### 2) Agenda do paciente (server-side)
- **GET** `/api/patient/appointments`
- **Auth:** obrigatório
- **Uso:** retorna sessões futuras do paciente via Admin SDK.
- **Motivo:** evitar `permission-denied` e reduzir superfície (paciente não lê `appointments/*` direto no Firestore).

### 3) Push token (registrar)
- **POST** `/api/patient/push/register`
- **Auth:** obrigatório
- **Uso:** salva `pushToken` em `subscribers/{phoneCanonical}` (ou estrutura equivalente do projeto).

### 4) Push status (diagnóstico)
- **GET** `/api/patient/push/status`
- **Auth:** obrigatório
- **Uso:** retorna status/permissão/token (para orientar o paciente a manter notificações ativas).

### 5) Pareamento (quando habilitado)
- **POST** `/api/patient/pair`
- **Auth:** obrigatório
- **Uso:** fluxo de vinculação/pareamento com a clínica (quando usado).

---

## Presença / Confirmação (Paciente)

### 6) Confirmar presença
- **POST** `/api/attendance/confirm`
- **Auth:** obrigatório
- **Uso:** registra evento do paciente (ex.: `eventType = patient_confirmed`) para reforço de compromisso.

### 7) Consultar confirmados
- **GET** `/api/attendance/confirmed`
- **Auth:** obrigatório
- **Retorno:**
  - `{ ok: true, appointmentIds: string[] }`
  - se enviar `?appointmentId=...`, inclui `{ confirmed: boolean }`
- **Compat:** `GET /api/attendance/confirmd` é alias.

---

## Admin — Agenda e lembretes

### 8) Enviar lembretes (manual)
- **POST** `/api/admin/reminders/send`
- **Auth:** obrigatório (admin)
- **Uso:** envio manual por slot (48h/24h/12h) com preview/dryRun e idempotência por sessão+slot.

---

## Admin — Constância (presença/faltas)

### 9) Importar presença/faltas
- **POST** `/api/admin/attendance/import`
- **Auth:** obrigatório (admin)
- **Uso:** importar logs (planilha 2) para `attendance_logs/*`.

### 10) Resumo/métricas
- **POST** `/api/admin/attendance/summary`
- **Auth:** obrigatório (admin)
- **Uso:** métricas de constância por paciente (30/60/90 dias) para painel.

### 11) Enviar follow-ups (presença/falta)
- **POST** `/api/admin/attendance/send-followups`
- **Auth:** obrigatório (admin)
- **Idempotência:** se `attendance_logs/{id}.followup.sentAt` existe → não reenviar.
- **DryRun:** retorna amostra interpolada + motivos de bloqueio.

---

## Cron (opcional)

### 12) Enviar lembretes automaticamente
- **GET** `/api/cron/reminders`
- **Auth:** por segredo (`CRON_SECRETS`) via header (Authorization Bearer / x-cron-secret)
- **Uso:** scheduler chama a URL e o endpoint envia lembretes 48h/24h/12h com idempotência por slot.
- **Observação:** não roda sozinho; só funciona se você configurar Cron Jobs.



### 12B) Limpeza de logs (retencao)
- **GET** `/api/cron/retention`
- **Auth:** por segredo (`CRON_SECRETS`) via header (Authorization Bearer / x-cron-secret)
- **Uso:** apaga docs expirados de `history` e `audit_logs` (TTL/rotacao).
- **Observação:** opcional se TTL do Firestore estiver habilitado; recomendado 1x/dia como fallback.


---

## Admin — Operação (Ops)

### 13) Health check (falha-segura / diagnóstico)
- **GET** `/api/admin/ops/health`
- **Auth:** obrigatório (admin)
- **Uso:** checar rapidamente se o ambiente está apto (ex.: credenciais Admin SDK presentes) e orientar o operador.

### 14) Registro do dia (auditoria operacional)
- **GET** `/api/admin/ops/daily-log?date=YYYY-MM-DD`
- **POST** `/api/admin/ops/daily-log`
- **Auth:** obrigatório (admin)
- **Uso:** salvar resumo do dia e marcar como concluído.
- **Observação:** pensado para reduzir risco humano e facilitar diagnóstico no dia seguinte.

### 15) Listagem de registros (últimos dias)
- **GET** `/api/admin/ops/daily-logs?days=14`
- **Auth:** obrigatório (admin)
- **Uso:** trazer o histórico (salvo/concluído + contadores) e abrir detalhes por data.
