# Auth e isolamento por tenant — AgendaPsi

Atualizado: **2026-03-02**

## Objetivo
Garantir que cada usuário opere somente dentro do seu tenant.

## Padrão adotado
- Resolver tenant via `userTenantIndex/{uid}` (global).
- Confirmar membership canônico em `tenants/{tenantId}/users/{uid}`.

## Fluxo (alto nível)
1. Usuário autentica (Firebase Auth).
2. Server resolve `tenantId` via `userTenantIndex/{uid}`.
3. Server cria/valida sessão server-side e redireciona para `/profissional` ou `/admin`.

## Admin
- Login do Admin via senha (`ADMIN_PASSWORD`) em `/api/auth`.
- Operações do Admin preferencialmente via rotas server-side com Admin SDK.
- Evitar listeners client em módulos placeholder para não gerar `permission-denied`.
