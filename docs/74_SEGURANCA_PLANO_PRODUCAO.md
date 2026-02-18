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
  - CSP em modo **Report-Only** (para observar violações antes de aplicar enforcement)

- [x] **Rate limit + hardening de auth**
  - `/api/auth` (admin) com rate limit + origin check
  - Fluxo do paciente (pair/appointments/resolve-phone) com rate limit
  - Erros padronizados (sem vazar `e.message`)

### Próximos (ordem sugerida)
1) **Privacidade & retenção de logs**
   - Definir retenção de `history/*` e `audit/*`
   - Garantir que PII fique apenas onde é necessário e somente Admin acessa

2) **Paciente: OTP/magic link (pré-app/PWA)**
   - Implementar login seguro com menor fricção (especialmente para idosos)
   - Manter diretriz clínica: sem CTA de cancelamento/remarcação

## Observações técnicas
- `users/{uid}` é **whitelist**: criado/atualizado pelo Admin via Admin SDK.
- O painel do paciente lê agenda via **API server-side** (`/api/patient/appointments`).
  - Por isso, **identidade (phoneCanonical/email)** não pode ser editada pelo paciente no Firestore.
