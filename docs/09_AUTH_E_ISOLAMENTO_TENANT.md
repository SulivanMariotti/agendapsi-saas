# Auth e isolamento por tenant — AgendaPsi

Atualizado: 2026-02-28

## Objetivo
Garantir que o usuário logado só acesse dados do seu tenant e role.

## Padrão oficial (AgendaPsi)
- `userTenantIndex/{uid}`:
  - `tenantId`
  - `role`
  - `isActive`
- Membership canônico:
  - `tenants/{tenantId}/users/{uid}` com campo `uid` duplicado (para consistência/auditoria)

## Sessão
- Cookie httpOnly: `__session` (Firebase Admin `createSessionCookie`)
- SSR valida cookie com `verifySessionCookie`

## Por que não usar `collectionGroup` para membership
- Dependência de índices/config e falhas em alguns ambientes.
- O padrão do AgendaPsi evita isso com `userTenantIndex`.


## Admin auth (senha)
- Endpoint: `POST /api/auth`
- Variáveis:
  - `ADMIN_PASSWORD` (obrigatório)
  - `ADMIN_UID` (opcional em DEV; recomendado em produção)
