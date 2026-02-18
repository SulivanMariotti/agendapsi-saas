# Segurança — Plano para liberar produção (checklist vivo)

> Norte clínico: segurança e privacidade sustentam vínculo. Qualquer brecha vira quebra de confiança e aumenta chance de falta.

## Status atual (2026-02-18)

### Bloqueadores já resolvidos
- [x] **Paciente: login por e-mail sem verificação** desativado por padrão (era sequestro de sessão)
- [x] **Admin: remoção de fallback perigoso** via `users/{uid}.role` no `requireAdmin`
- [x] **Firestore rules**: paciente não consegue alterar identidade no `users/{uid}`
  - paciente só atualiza `lastSeen`, `contractAcceptedVersion`, `contractAcceptedAt`
- [x] **Firestore rules**: `patient_notes.patientId` travado no update
- [x] **Paciente: removido recurso DEV "Trocar paciente"** (impersonação) do painel

- [x] **Headers de segurança (Next.js)**
  - HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
  - CSP **ENFORCE em produção** (Report-Only apenas em dev, para evitar quebra por hot-reload/eval)

- [x] **Cron/segredo (header-only em produção)**
  - `/api/cron/*` aceita `Authorization: Bearer` (preferido) ou `x-cron-secret`
  - `?key=` desativado em produção (só com `ALLOW_CRON_QUERY_KEY=true` como transição)

- [x] **Origin/CSRF padronizado**
  - Helper `src/lib/server/originGuard.js`
  - Aplicado em: `/api/auth`, `/api/patient/pair`, `/api/patient/push/register`, `/api/attendance/confirm` e `requireAdmin` (todas rotas admin)

- [x] **Rate limit + hardening de auth**
  - `/api/auth` (admin) com rate limit + origin check
  - Fluxo do paciente (pair/appointments/resolve-phone) com rate limit
  - Erros padronizados (sem vazar detalhes internos)

- [x] **Privacidade & retenção de logs (history/audit)**
  - `history`: mascara telefone/e-mail e nunca grava token bruto
  - `history` e `audit_logs`: adiciona `expireAt` (TTL/rotacao)
  - **TTL habilitado no Firestore**: policies `history.expireAt` e `audit_logs.expireAt` (configurado no console)
  - Rota opcional: `/api/cron/retention` para limpeza por cron
  - Doc: `docs/75_RETENCAO_LOGS_TTL_E_CRON.md`

### Próximos (ordem sugerida)
1) **Revisão final LGPD operacional**
   - Exportação/backup: remover PII quando for para análise.
   - Garantir acesso mínimo (papéis/admin-only).

2) **Paciente: OTP/magic link (pré-app/PWA)**
   - Login seguro com menor fricção (especialmente para idosos)
   - Manter diretriz clínica: sem CTA de cancelamento/remarcação

## Observações técnicas
- `users/{uid}` é **whitelist**: criado/atualizado pelo Admin via Admin SDK.
- O painel do paciente lê agenda via **API server-side** (`/api/patient/appointments`).
  - Por isso, **identidade (phoneCanonical/email)** não pode ser editada pelo paciente no Firestore.

---

## Checklist de segredos (obrigatório antes de produção)
- ✅ **Nunca** versionar nem compartilhar `.env*` (somente local).
- ✅ Manter `.env.example` como template (sem valores).
- ✅ Rodar: `npm run security:check` antes de gerar zip/mandar para terceiros.
- ✅ Se algum `.env`/service account tiver sido compartilhado por engano: **rotacionar** imediatamente.
