# 33 — Convite de Owner (quando e-mail não existe no Auth)

Data: 2026-03-04

## Objetivo
Permitir que o **Super Admin (SaaS)** vincule um **Owner/Admin do tenant** mesmo quando o e-mail ainda **não existe** no Firebase Auth.

Estratégia MVP+:
- Se o e-mail não existir no Auth, o sistema **gera um convite** com link único.
- O convidado abre o link, cria conta (ou entra) e **aceita o convite**.
- Só após aceitar, o usuário consegue criar sessão em `/api/auth/session` (pois agora já existe membership + `userTenantIndex`).

> Importante: isso **não** altera a regra de isolamento: ninguém ganha acesso sem membership explícita no tenant.

---

## Modelo de dados (global)

Coleção: `tenantInvites/{tokenHash}` (docId = sha256(tokenRaw))

Campos principais:
- `type`: `"tenantOwner"`
- `status`: `"pending" | "accepted" | "revoked" | "expired"`
- `tenantId`
- `emailLower`
- `role`: `"owner"`
- `createdByUid`
- `createdAt`
- `expiresAt` (Timestamp) — TTL lógico
- `acceptedByUid`, `acceptedEmailLower`, `acceptedAt` (quando aceito)

**Segurança**
- O token raw **não é armazenado** no Firestore (somente o hash).
- O link contém o token raw (segredo). Qualquer pessoa com o link consegue ver o e-mail do convite e tentar aceitar — por isso o aceite valida:
  - **e-mail do usuário autenticado == emailLower do convite**
  - convite `pending` e não expirado

---

## Endpoints

### Super Admin (criação do convite)
`POST /api/admin/saas/tenants/owner { tenantId, email|uid }`

- Se `uid` ou `email` existir no Auth → **link direto** (modo `"linked"`)
- Se `email` não existir no Auth → **cria convite** (modo `"invite"`)
  - retorna `invite.link` (url/relative), `expiresAtIso`, `emailMasked`
  - em dev: retorna também `invite.token` (somente para debug)

Auditoria:
- `TENANT_OWNER_INVITE_CREATE`

### Público (consulta do convite)
`GET /api/invite/info?token=...`

Retorna dados básicos para UI:
- tenantId + tenantName
- email (do convite)
- expiresAt

### Público (aceite do convite)
`POST /api/invite/accept { token, idToken }`

- Valida token + expiração + status
- Verifica `idToken` e compara e-mail com `emailLower`
- Cria/atualiza:
  - `tenants/{tenantId}/users/{uid}` com `role="owner"`
  - `tenants/{tenantId}.ownerUid` (se vazio)
  - `userTenantIndex/{uid}`
- Bloqueia se tenant suspenso (`TENANT_SUSPENDED`)

Auditoria:
- `TENANT_OWNER_INVITE_ACCEPT`

---

## UI

### Admin → SaaS → Tenants
Ao tentar vincular Owner por e-mail:
- se usuário existe → mantém comportamento atual
- se usuário não existe → cria convite e mostra **“Último convite criado”** com botão de copiar link

### Página pública
`/invite?token=...`
- Mostra tenant + e-mail convidado
- Permite:
  - **Criar conta** (email/password) OU **Entrar**
  - Google Sign-in (desde que o e-mail seja exatamente o do convite)
- Após aceitar:
  - chama `/api/auth/session` para iniciar sessão e redireciona para `/profissional`

---

## Variáveis de ambiente

Opcional:
- `OWNER_INVITE_TTL_HOURS` (default: `72`)

Opcional (para link absoluto):
- `NEXT_PUBLIC_APP_URL` (ex.: `https://agendapsi.msgflow.app.br`)
  - se ausente, o backend retorna link relativo (`/invite?token=...`)

---

## Checklist rápido
- [ ] Admin SaaS cria convite para e-mail inexistente → UI mostra link
- [ ] Acessar `/invite?token=...` → carrega tenant + e-mail
- [ ] Criar conta com o e-mail do convite → aceita → entra em `/profissional`
- [ ] Tentar aceitar com outro e-mail → `EMAIL_MISMATCH`
- [ ] Tenant suspenso → `TENANT_SUSPENDED`
