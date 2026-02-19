# 16_API_ENDPOINTS_CATALOG.md

> Norte clínico: rotas críticas (envio/decisões) devem ser **server-side** para proteger a constância.

## Convenções
- Rate limit: rotas críticas usam limiter (algumas com backing global no Firestore via `_rate_limits`).
- Next.js App Router: endpoints existem como `.../route.js`.
- Auth Admin: `Authorization: Bearer <Firebase ID Token>` + `role=admin` (ver `requireAdmin`).
- Segredo (cron): `CRON_SECRETS` (ou compat `CRON_SECRET`) via header `Authorization: Bearer ...` (preferido) ou `x-cron-secret`.
- Legado: query `?key=` só se `ALLOW_CRON_QUERY_KEY=true` (não recomendado).
- Logs/auditoria: ações críticas registram auditoria (quando aplicável).

---

## Paciente

### 1) Resolver telefone/canonicalização
- **GET** `/api/patient/resolve-phone`
- **Auth:** obrigatório (**role patient** — estrito)
- **Uso:** garante `phoneCanonical` (fonte: `users/{uid}`; fallbacks quando necessário).

### 2) Agenda do paciente (server-side)
- **GET** `/api/patient/appointments`
- **Auth:** obrigatório (**role patient** — estrito)
- **Uso:** retorna sessões futuras do paciente via Admin SDK.
- **Motivo:** evitar `permission-denied` e reduzir superfície (paciente não lê `appointments/*` direto no Firestore).

### 2B) Biblioteca (artigos publicados)
- **GET** `/api/patient/library/list`
- **Auth:** obrigatório (**role patient** — estrito)
- **Uso:** retorna apenas artigos **publicados** para psicoeducação (apoio à constância).


### 3) Push token (registrar)
- **POST** `/api/patient/push/register`
- **Auth:** obrigatório (**role patient** — estrito)
- **Uso:** salva `pushToken` em `subscribers/{phoneCanonical}` (ou estrutura equivalente do projeto).

### 4) Push status (diagnóstico)
- **GET** `/api/patient/push/status`
- **Auth:** obrigatório (**role patient** — estrito)
- **Uso:** retorna status/permissão/token (para orientar o paciente a manter notificações ativas).

### 5) Pareamento (quando habilitado)
- **POST** `/api/patient/pair`
- **Auth:** obrigatório (**role patient** — estrito)
- **Uso:** fluxo de vinculação/pareamento com a clínica (quando usado).

---

## Metadados operacionais (Admin)

### X) Última sincronização de agenda
- **GET** `/api/appointments/last-sync`
- **Auth:** obrigatório (**role admin**)
- **Uso:** metadados internos para diagnóstico de import/sync (não expor ao paciente).

---

## Presença / Confirmação (Paciente)

### 6) Confirmar presença
- **POST** `/api/attendance/confirm`
- **Auth:** obrigatório (**role patient** — estrito)
- **Uso:** registra evento do paciente (ex.: `eventType = patient_confirmed`) para reforço de compromisso.
- **Integridade:** o servidor **deriva o telefone do perfil** (`users/{uid}`) e **ignora `phone` do client**.

### 7) Consultar confirmados
- **GET** `/api/attendance/confirmed`
- **Auth:** obrigatório (**role patient** — estrito)
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
- **GET** `/api/admin/attendance/summary?days=7|30|90`
- **Auth:** obrigatório (admin)
- **Uso:** métricas agregadas de constância (por período) para painel. Período calculado por `isoDate` (data real da sessão).

### 11) Enviar follow-ups (presença/falta)
- **POST** `/api/admin/attendance/send-followups`
- **Auth:** obrigatório (admin)
- **Idempotência:** se `attendance_logs/{id}.followup.sentAt` existe → não reenviar.
- **DryRun:** retorna amostra interpolada + motivos de bloqueio.

---


---

## Admin — Biblioteca (Artigos)

### 11B) Listar e criar artigos
- **GET** `/api/admin/library/articles`
- **POST** `/api/admin/library/articles`
- **Auth:** obrigatório (admin)
- **Uso:** CRUD de artigos da biblioteca (rascunho/publicado).

### 11C) Atualizar e excluir artigo
- **PATCH** `/api/admin/library/articles/[id]`
- **DELETE** `/api/admin/library/articles/[id]`
- **Auth:** obrigatório (admin)

### 11D) Criar artigos modelo (seed)
- **POST** `/api/admin/library/seed`
- **Auth:** obrigatório (admin)
- **Uso:** cria artigos base (não sobrescreve os existentes).


## Admin — Biblioteca (Categorias)

### 11E) Listar e criar categorias
- **GET** `/api/admin/library/categories`
- **POST** `/api/admin/library/categories`
- **Auth:** obrigatório (admin)
- **Uso:** CRUD de categorias para organizar a biblioteca.

### 11F) Atualizar e excluir categoria
- **PATCH** `/api/admin/library/categories/[id]`
- **DELETE** `/api/admin/library/categories/[id]`
- **Auth:** obrigatório (admin)

### 11G) Gerar categorias a partir dos artigos
- **POST** `/api/admin/library/categories/bootstrap`
- **Auth:** obrigatório (admin)
- **Uso:** cria categorias com base nos rótulos já usados nos artigos (idempotente).


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


---

## Endpoints legados
- `_push_old/*`: **desativados** (410 em dev / 404 em produção) para reduzir superfície.
