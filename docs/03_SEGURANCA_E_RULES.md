# Segurança e Firestore Rules — AgendaPsi (SaaS)

Atualizado: **2026-02-28**

## 1) Objetivo
Garantir:
- **isolamento por tenant** (zero acesso cross-tenant)
- **mínimo privilégio** por role
- proteção de dados sensíveis (LGPD), especialmente evolução/prontuário

---

## 2) Padrões oficiais do AgendaPsi

### 2.1 Isolamento por tenant
- Todo dado de negócio vive em `tenants/{tenantId}/...`.
- Identificação do tenant do usuário é resolvida por:
  - `userTenantIndex/{uid}` (global)
  - membership canônico em `tenants/{tenantId}/users/{uid}`

> Decisão: evitar `collectionGroup` para membership; usar `userTenantIndex`.

Referência: `docs/09_AUTH_E_ISOLAMENTO_TENANT.md`.

### 2.2 Sessão server-side
- Cookie httpOnly `__session` criado via Firebase Admin `createSessionCookie`.
- Validação no servidor via `verifySessionCookie`.

---

## 3) Roles e permissões

### 3.1 Roles (MVP)
- `owner`: profissional dono do tenant
- `professional`: (futuro)
- `admin`: (admin do SaaS, se existir no futuro)

### 3.2 Política mínima
- **Profissional/Owner**: leitura e escrita dentro do seu tenant.
- **Paciente** (quando existir): leitura limitada (sem ações de cancelamento/remarcação).

Referência: `docs/04_ROLES_E_REGRAS.md`.

---

## 4) Firestore Rules (diretrizes)

### 4.1 Princípios
- Negar por padrão.
- Sempre validar:
  1) `request.auth != null`
  2) usuário ativo (`userTenantIndex/{uid}.isActive == true`)
  3) `tenantId` do path == `tenantId` do índice
  4) role mínima para a operação

### 4.2 Recomendações práticas
- Centralizar helpers em Rules:
  - `isSignedIn()`
  - `tenantIdForUid()`
  - `hasRole(role)` / `isOwner()`
- Para documentos sensíveis (ex.: `progressNote`):
  - permitir apenas roles profissionais
  - **evitar expor** em queries amplas para paciente

### 4.3 O que deve ficar server-side (Admin SDK)
Algumas garantias são mais seguras/consistentes no servidor:
- Rematerializar ocorrências futuras quando editar série
- Garantir unicidade de CPF por tenant
- Gating de escrita por `planStatus` (trial/active/past_due/expired)

---

## 5) LGPD (mínimo operacional para o MVP)

### 5.1 Classificação
- `progressNote` (evolução/prontuário) é **dado sensível**.

### 5.2 Regras de implementação
- Não logar conteúdo clínico.
- Evitar snapshots com informação clínica na agenda.
- Preferir snapshots leves (nome/contato/observações gerais).

### 5.3 Auditoria (planejamento)
- Criar trilha de auditoria para escritas relevantes (sem conteúdo clínico), ex.:
  - qual usuário alterou
  - qual documento
  - quando
  - tipo de ação

---

## 6) Como validar segurança rapidamente
- [ ] Usuário autenticado não consegue ler tenant diferente (testar com tenantId trocado)
- [ ] Usuário inativo (`isActive=false`) perde acesso
- [ ] Tentativa de leitura direta de `tenants/{tenantId}/...` sem sessão falha
- [ ] Somente roles profissionais conseguem gravar/ler `progressNote`

---

## 7) Arquivos relacionados
- `firestore.rules` (na raiz do projeto)
- `docs/09_AUTH_E_ISOLAMENTO_TENANT.md`
- `docs/04_ROLES_E_REGRAS.md`
