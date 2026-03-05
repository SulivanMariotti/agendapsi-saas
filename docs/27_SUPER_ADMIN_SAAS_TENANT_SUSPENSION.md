# Super Admin SaaS — Suspensão de Tenant (efeito real)

Data: 2026-03-03

## Objetivo
Quando `tenants/{tenantId}.status != "active"`, o tenant está **suspenso** e deve ser bloqueado:
- Portal do Paciente (APIs `/api/paciente/*`)
- Sessão e endpoints críticos do Profissional (sessão server-side)

> Motivação: SaaS comercial precisa de um "kill switch" por tenant para suporte, billing, ou incidente.

---

## Fonte da verdade
- Documento do tenant: `tenants/{tenantId}`
- Campo: `status` com valores recomendados:
  - `active` (default quando ausente)
  - `suspended` (bloqueado)

Qualquer valor diferente de `active` é tratado como **bloqueado**.

---

## Implementação
### Helper server-side
- `src/lib/server/tenantStatus.js`
  - `ensureTenantActive(tenantId)` → `{ ok: true }` ou `{ ok: false, reason: "missing"|"suspended" }`

### Portal do Paciente (bloqueio via API)
Rotas que validam `tenantId` nas claims e bloqueiam se o tenant estiver suspenso:
- `GET  /api/paciente/agenda`
- `POST /api/paciente/portal`
- `GET|POST|DELETE /api/paciente/notes`
- `GET  /api/paciente/library`
- `POST /api/paciente/access-code` (bloqueia **antes** de consumir o código)

Resposta padrão:
- HTTP 403
- `{ ok:false, error:"tenant-suspended", code:"TENANT_SUSPENDED" }`

### Profissional (bloqueio na resolução de sessão)
- `src/lib/server/getProfessionalApiSession.js`
- `src/lib/server/requireProfessional.js`
- `POST /api/auth/session` (login)

Efeito:
- se tenant suspenso, a sessão não é criada/validada, e o acesso é bloqueado.

---

## Validação
1) No Admin (SaaS → Tenants), suspenda um tenant.
2) Portal do paciente (deste tenant):
   - chamadas para `/api/paciente/*` devem retornar 403 com `TENANT_SUSPENDED`.
3) Profissional (deste tenant):
   - login (`/api/auth/session`) deve retornar 403 `TENANT_SUSPENDED`
   - páginas protegidas redirecionam para login (sessão inválida)

---

## Notas de segurança / LGPD
- Bloqueio é operacional (SaaS) e não deve depender de status clínico.
- Portal do paciente continua sem Firestore no client (APIs server-side).
- Evitar logs com dados sensíveis nos erros de bloqueio.
