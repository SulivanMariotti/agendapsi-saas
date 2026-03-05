# Super Admin SaaS — Tenants (MVP)

Atualizado: **2026-03-03**

## Objetivo
Permitir que o **Super Admin** (claim `role=admin`) crie e administre **tenants** (clientes) do AgendaPsi.

> Observação: este documento cobre **Tenants + Vincular Owner** (Admin do tenant). Convites por email e billing ficam Pós-MVP.

---

## Modelo (Firestore)

### `tenants/{tenantId}`
Campos mínimos:

- `name` (string)
- `nameLower` (string, para busca por prefixo)
- `status`: `active` | `suspended`
- `createdAt`, `createdBy`
- `updatedAt`, `updatedBy`

---

## API (Admin)

Base: `Authorization: Bearer <idToken>` com claim `role=admin` (via `requireAdmin`).

### GET `/api/admin/saas/tenants?q=`
- Sem `q`: lista os **50 mais recentes** (orderBy `createdAt` desc)
- Com `q`:
  - tenta `tenantId` exato
  - tenta busca por prefixo em `nameLower` (>= 2 chars)

Retorno:
- `{ ok: true, tenants: TenantSummary[] }`

### POST `/api/admin/saas/tenants`
Body:
- `{ "name": "Clínica Exemplo" }`

Cria `tenantId` no formato `tn_<hex>` e status `active`.

### PATCH `/api/admin/saas/tenants`
Body:
- `{ "tenantId": "tn_xxx", "status": "suspended" | "active" }`

---


### POST `/api/admin/saas/tenants/owner`
Body:
- `{ "tenantId": "tn_xxx", "email": "owner@dominio.com" }` **ou**
- `{ "tenantId": "tn_xxx", "uid": "FirebaseAuthUID" }`

Efeito:
- Cria/atualiza membership em `tenants/{tenantId}/users/{uid}` com `role="owner"` e `isActive=true`
- Faz upsert do índice `userTenantIndex/{uid}` (para o login resolver o tenant)
- Se `tenants/{tenantId}.ownerUid` estiver vazio, preenche com o uid vinculado

Retorno:
- `{ ok: true, tenantId, owner: { uid, email?, displayName } }`

## Auditoria
Ações gravadas em `audit_logs`:
- `TENANT_CREATE`
- `TENANT_STATUS_CHANGE`

---

## Riscos e notas
- Busca por nome depende de `nameLower`. Tenants antigos sem o campo podem não aparecer na busca por nome (mas aparecem na listagem padrão).
- Suspensão de tenant ainda precisa ser aplicada em **APIs do profissional/paciente** (Fatia 2/3 do épico).
