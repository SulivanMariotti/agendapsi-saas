# Changelog — Lembrete Psi (até 2026-02-18)

## Até 2026-02-16 (resumo)
- Follow-ups de constância (presença/falta) com idempotência.
- Agenda do paciente 100% server-side (`GET /api/patient/appointments`) + rules `appointments` admin-only.
- Confirmação de presença: `GET /api/attendance/confirmed` (alias `confirmd`).
- Psicoeducação passiva no painel do paciente (mantra + cards).
- Endpoint opcional de cron (`/api/cron/reminders`) documentado, mas não habilitado.

---

## 2026-02-17 — Entregas

### A) Operação manual blindada (Admin → Agenda)
- Runbook operacional + checklist 1 página + template de registro: `docs/27_*`.
- Card **Operação do Dia**:
  - progresso (import/verificar/sincronizar/preview/envio)
  - contadores e bloqueios: `SEM_PUSH`, `INATIVO`, `SEM_TELEFONE`, `ALREADY_SENT`
  - **CHECK** (push não confirmado) + alerta
  - **trava de envio** com CHECK > 0 (fail-safe)
  - export **CSV de diagnóstico**
  - **Copiar resumo do dia**
  - **Registro diário** (salvar + marcar concluído)
  - **Auditoria** (últimos 14 dias)
  - **Falha-segura** (detector + instruções objetivas)

### B) Admin — Manual de Uso (Agenda + Presença/Faltas)
- Novo menu “Manual de Uso” no Admin.
- Conteúdo com finalidade, passo a passo, diagnóstico e boas práticas.
- Atalhos contextuais “Ver no Manual” dentro de Agenda e Presença/Faltas.
- Correção aplicada durante implementação: erro de build `Module not found: Can't resolve './AdminManualTab'` (arquivo faltando).

### C) Documentação consolidada para continuidade
- Atualização de `00_ONDE_PARAMOS.md`, `00_PROMPT_NOVO_CHAT.md`, `01_HANDOFF.md`, `02_BACKLOG.md`, `16_API_ENDPOINTS_CATALOG.md`, `18_TROUBLESHOOTING_COMMON_ERRORS.md` e índice.

---

## 2026-02-18 — Segurança (bloqueadores para produção)

- Paciente: **login por e-mail sem verificação** desativado por padrão (mantido somente telefone+código).
- Admin: `requireAdmin` passou a aceitar **apenas claim** (`role=admin` ou `admin=true`) — sem fallback em `users.role`.
- Firestore Rules:
  - `users/{uid}`: paciente só atualiza `lastSeen` e aceite de contrato (sem editar identidade).
  - `patient_notes/{id}`: travado para impedir troca de `patientId` no update.
- Paciente: `PatientFlow` não tenta mais “criar perfil” no Firestore (perfil é whitelist/admin).
- Novo: `docs/74_SEGURANCA_PLANO_PRODUCAO.md` (checklist vivo para liberar produção).

- Paciente: removido botão/recurso DEV **“Trocar paciente”** do painel.

- Next.js: **hardening de headers** aplicado globalmente:
  - `Strict-Transport-Security` (HSTS)
  - `X-Frame-Options` (anti-clickjacking)
  - `X-Content-Type-Options` (nosniff)
  - `Referrer-Policy`
  - `Permissions-Policy`
  - `Content-Security-Policy` (**ENFORCE em produção**; Report-Only apenas em dev)

- Auth hardening:
  - `/api/auth` (admin): **rate limit** + **origin check** + comparação de senha em tempo constante.
  - Paciente: **rate limit** em `/api/patient/pair`, `/api/patient/appointments`, `/api/patient/resolve-phone`.
  - Padronização de erros (não vaza `e.message` em rotas sensíveis).
  - Removida a possibilidade de override/impersonação por querystring na rota de appointments.

- Logs/retencao:
  - `history`: escrita centralizada com minimizacao de PII (telefone/e-mail mascarados; token bruto nunca).
  - `history` e `audit_logs`: campo `expireAt` para TTL/rotacao.
  - TTL habilitado no Firestore: policies `history.expireAt` e `audit_logs.expireAt` (exclusao pode levar ate ~24h apos `expireAt`).
  - Nova rota opcional: `GET /api/cron/retention` (limpeza por cron), usando `CRON_SECRETS` (compat: `CRON_SECRET`).
  - Firestore rules: match explicito para `audit_logs` admin-only.
  - Docs: `docs/75_RETENCAO_LOGS_TTL_E_CRON.md` e atualizacao do padrao `docs/11_HISTORY_LOGGING_STANDARD.md`.

## 2026-02-18 — Segurança (segredos)
- Adicionado `.gitignore` com bloqueio de `.env*`.
- Adicionado `.env.example` (template sem valores).
- Adicionado `npm run security:check` para detectar `.env*` e padrões de segredos antes de compartilhar.


## 2026-02-18 — Segurança (cron secret)
- Cron routes (`/api/cron/*`) agora priorizam **header-only** em produção (Authorization Bearer / x-cron-secret).
- Suporte a rotação via `CRON_SECRETS` (lista separada por vírgula).
- Query `?key=` desativado em produção por padrão (só com `ALLOW_CRON_QUERY_KEY=true` como transição).
- Novo helper: `src/lib/server/cronAuth.js` + logs seguros de tentativas inválidas.
- Docs atualizadas: `docs/26_VERCEL_CRON_REMINDERS.md` e `docs/75_RETENCAO_LOGS_TTL_E_CRON.md`.


## 2026-02-18 — Segurança (continuação)
- Padronização de CSRF/origin: helper `src/lib/server/originGuard.js`.
- Aplicado em rotas sensíveis: `/api/auth`, `/api/patient/pair`, `/api/patient-auth`, `/api/patient/push/register`, `/api/attendance/confirm` e `requireAdmin`.

## 2026-02-18 — Segurança v1 finalizada
- Concluídos todos os bloqueadores para produção: RBAC/rules, auth paciente (pair-code), headers+CSP, rate-limit, CSRF/origin, logs+TTL.
- Cron routes já prontas para futura automação (header-only + rotação), sem necessidade de cron ativo hoje.

---

## 2026-02-18 — Paciente: Biblioteca (psicoeducação)
- Adicionado botão **“Biblioteca”** no cabeçalho do painel do paciente (desktop + menu mobile).
- Modal “Biblioteca de Apoio” com:
  - artigos curtos por temas + busca
  - mantra fixo (leitura não substitui sessão)
  - seção **“Para levar para a sessão”**
  - sem CTA de cancelar/remarcar

