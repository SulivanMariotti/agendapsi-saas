# Billing — Grace Period (carência) para `past_due`

Data: 2026-03-04  
Status: Pós-MVP (infra preparada; sem cobrança integrada ainda)

## Objetivo

Permitir um **período de carência** quando o tenant entra em `billingStatus="past_due"`, evitando bloqueio imediato e preservando a continuidade do cuidado.

Durante a carência:
- **Profissional** e **Admin do tenant** conseguem continuar **criando/alterando** por um curto período.
- Após a carência: bloqueia **writes** (criação/alteração/exclusão) e mantém **reads**.

## Campos (Firestore)

Em `tenants/{tenantId}`:

- `billingStatus`: `"active" | "trial" | "past_due" | "canceled"`
- `trialEndsAt`: timestamp (opcional)
- `billingPastDueAt`: timestamp (opcional)  
  Registrado quando o SaaS define `past_due`.
- `billingGraceEndsAt`: timestamp (opcional)  
  Definido como `now + graceDays` quando o SaaS define `past_due`.

## ENV

- `BILLING_GRACE_DAYS` (default: **3**, min 0, max 30)

## Regras efetivas

### 1) Trial
- `billingStatus="trial"` e `trialEndsAt` no futuro → **writes liberados**
- se `trialEndsAt` no passado → trata como `past_due` e aplica carência (baseada em `trialEndsAt` se não houver `billingPastDueAt`)

### 2) Past due
- Se `now <= billingGraceEndsAt` → `inGrace=true` → **writes liberados**
- Se `now > billingGraceEndsAt` → `inGrace=false` → **writes bloqueados**
- Reads continuam liberados (agenda/visões).

### 3) Canceled
- Bloqueio de writes imediato (reads continuam possíveis onde fizer sentido).

## Enforcement (onde bloqueia)

- `/api/professional/*` (writes) via `requireProfessionalApi()`  
- `/api/professional/admin/*` (writes) via `requireTenantAdmin()`

O bloqueio retorna:
- HTTP **403**
- `code="BILLING_STATUS_BLOCKED"`
- `billing` com `statusEffective`, `graceDaysLeft`, `graceEndsAtIso`, etc.

## UX

- Banner em `/profissional` e `/admin-tenant`:
  - Trial: mostra `trialDaysLeft`
  - Past due em carência: mostra `graceDaysLeft`
  - Past due fora da carência: informa bloqueio de criação/alteração

## Preparação para integração futura (sem implementar cobrança)

Campos recomendados (não obrigatórios agora) para um provedor (Stripe/Pagar.me/etc):
- `billingProvider` (ex.: "stripe")
- `billingCustomerId`
- `billingSubscriptionId`
- `billingCurrentPeriodEnd`
- `billingLastEventAt`
- `billingLastEventId`

A integração futura deve apenas **atualizar** `billingStatus` e datas; o enforcement já está centralizado.


---

## Referência

- Ver também: `docs/41_BILLING_MATRIZ_FINAL_E_MENSAGENS.md`
