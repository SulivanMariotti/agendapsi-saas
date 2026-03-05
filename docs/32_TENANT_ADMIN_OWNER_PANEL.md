# 32 — Tenant Admin (Owner/Admin) — Painel de Configurações

Data: 2026-03-04

## Objetivo

Permitir que **Owner/Admin do tenant** gerencie configurações **do próprio tenant** sem depender do Super Admin (claim global `role="admin"`).

Escopo (MVP):
- **Portal do Paciente**: termo/contrato + flags de módulos
- **Templates de WhatsApp**: CRUD

## UI

- Rota: `/admin-tenant`
- Acesso: somente roles `owner` e `admin` (membership em `tenants/{tenantId}/users/{uid}`)

Observação:
- A rota `/profissional/configuracoes/agenda` agora redireciona Owner/Admin para este painel.

## APIs (server-side, com cookie __session)

Base: `/api/professional/admin/*`

### Patient Portal
- `GET /api/professional/admin/patient-portal`
- `PUT /api/professional/admin/patient-portal`

Dados:
- `tenants/{tenantId}/settings/patientPortal`
  - `termsVersion`, `termsText`, `libraryEnabled`, `notesEnabled`, `remindersEnabled`
  - `updatedAt`, `updatedBy` (e `createdAt` quando criar)

### WhatsApp Templates
- `GET /api/professional/admin/whatsapp-templates`
- `POST /api/professional/admin/whatsapp-templates`
- `PATCH /api/professional/admin/whatsapp-templates`
- `DELETE /api/professional/admin/whatsapp-templates?templateId=...`

Dados:
- `tenants/{tenantId}/whatsappTemplates/{templateId}`
  - `title`, `body`, `isActive`, `sortOrder`
  - `createdAt`, `updatedAt`, `updatedBy`

Observação:
- A listagem retorna ordenado por `sortOrder` e depois `title`.
- A ordenação secundária é feita **em memória** para evitar dependência de índice composto no Firestore.


## Segurança

- Autorização: `requireTenantAdmin(req)`
  - Usa sessão server-side (`__session`) via `getProfessionalApiSession()`
  - Permite apenas roles `owner|admin`
- Hardening (CSRF/CORS):
  - `enforceSameOrigin` em métodos não-idempotentes (produção)
- Rate limit:
  - buckets específicos por endpoint (ex.: `tenant-admin:patient-portal:put`)

## Como validar (checklist)

1) Logar como **Owner/Admin** no `/login`
2) Acessar `/admin-tenant`
   - Ver tabs: Portal do Paciente / Templates WhatsApp
3) Portal:
   - editar texto + aumentar `termsVersion` + salvar
   - atualizar flags e persistir após F5
4) WhatsApp:
   - criar template, editar, salvar, excluir
5) Logar como **professional** (não owner/admin)
   - `/admin-tenant` deve mostrar "restrito"
   - APIs devem retornar 403
