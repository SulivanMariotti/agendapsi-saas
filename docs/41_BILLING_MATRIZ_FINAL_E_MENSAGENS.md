# Billing — Matriz final + mensagens consistentes

Data: 2026-03-04  
Escopo: AgendaPsi (SaaS)

## 1) Campos no tenant

Documento: `tenants/{tenantId}`

- `status`: `active | suspended`  
  - **Operacional** (SaaS). `suspended` bloqueia tudo (profissional e paciente).

- `planId`: `free | pro | enterprise`  
  - **Plano** (limites + features).

- `billingStatus`: `active | trial | past_due | canceled`  
  - **Cobrança** (Pós-MVP; sem gateway ainda).

- `trialEndsAt` (opcional)  
- `billingPastDueAt` (opcional)  
- `billingGraceEndsAt` (opcional)

ENV:
- `BILLING_GRACE_DAYS` (default 3; 0..30)

## 2) Regras oficiais (matriz)

### 2.1 Tenant status (operacional)
- `status != active` → bloqueio total  
  - Profissional: `/api/auth/session` e `/api/professional/*` bloqueiam (403 `TENANT_SUSPENDED`)  
  - Paciente: `/api/paciente/*` bloqueia (403 `TENANT_SUSPENDED`)

### 2.2 Billing status (cobrança)
- `active` → tudo liberado (respeitando plano)
- `trial` (não expirado) → tudo liberado (respeitando plano)
- `trial` expirado → tratado como `past_due` (sem cron)
- `past_due`:
  - durante carência (`billingGraceEndsAt` futuro) → **writes liberados**
  - após carência → **writes bloqueados**, reads liberados
- `canceled` → **writes bloqueados**, reads liberados

> Filosofia de produto: preservar leitura/continuidade, bloquear criação/alteração quando necessário.

## 3) Códigos de erro padronizados

### 3.1 Bloqueio por billing (writes)
- HTTP 403
- `code="BILLING_WRITE_BLOCKED"`
- JSON inclui `billing` para UI exibir banner/motivo.

### 3.2 Limite por plano
- HTTP 403
- `code="PLAN_LIMIT_EXCEEDED"`

### 3.3 Operacional (tenant suspenso)
- HTTP 403
- `code="TENANT_SUSPENDED"`

## 4) Mensagens consistentes (UI)

Fonte única de textos:
- `src/lib/shared/billingText.js`
- Banners (server):
  - `src/components/Billing/BillingBannerServer.js`

O Admin SaaS usa os mesmos rótulos (`Ativo/Trial/Pagamento pendente/Cancelado`) em toasts e selects.

## 5) Rotas impactadas

- Profissional (banner + gating de writes):
  - `/profissional`
  - `/api/professional/*`
- Admin do consultório (banner + gating de writes):
  - `/admin-tenant`
  - `/api/professional/admin/*`
- SaaS (controle de billingStatus):
  - `/admin → SaaS → Tenants`
  - `/api/admin/saas/tenants (PATCH)`

