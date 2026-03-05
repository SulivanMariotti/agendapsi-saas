# 39 — Billing Status (trial/active/past_due/canceled) + Bloqueios graduais

Data: 2026-03-04

## Objetivo
Adicionar um **estado de cobrança por tenant** (sem cobrança real ainda), para permitir:
- Trial por tempo limitado
- Bloqueio gradual quando não estiver ativo (ex.: `past_due`)
- UX clara (banner informativo) sem derrubar o acesso do profissional (read-only)

## Campos (Firestore)
Documento: `tenants/{tenantId}`

- `billingStatus`: `"active" | "trial" | "past_due" | "canceled"` (string)
- `trialEndsAt`: Timestamp (opcional)

Compatibilidade:
- Se `billingStatus` ausente => assume `"active"`.

## Interpretação (server-side)
- `trial` com `trialEndsAt` expirado => tratado como `past_due` (sem depender de cron).
- `writeAllowed = true` somente quando:
  - `active`
  - `trial` **não expirado**

## Bloqueios
### Profissional (APIs `/api/professional/*`)
- **Reads** continuam funcionando
- **Writes** (POST/PUT/PATCH/DELETE) retornam 403:
  - `code="BILLING_STATUS_BLOCKED"`
  - `error="billing-inactive"`
  - `billing: { statusRaw, statusEffective, trialEndsAtIso, trialDaysLeft, writeAllowed }`

### Admin do tenant (`/admin-tenant` via APIs `/api/professional/admin/*`)
- Mesma regra: writes bloqueados quando `writeAllowed=false`.

### Portal do paciente (`/paciente`)
- Mantém acesso ao **informativo** (agenda/contrato)
- Features pagas do portal são desligadas quando billing não ativo:
  - `libraryEnabled=false`
  - `notesEnabled=false`
  - `remindersEnabled=false`

## UX (banners)
- `/profissional` e `/admin-tenant` exibem banner quando `billingStatusEffective != active`
  - `trial`: mostra dias restantes (quando disponível)
  - `past_due` / `canceled`: informa bloqueio de ações

## SaaS (Super Admin)
- Tela `/admin → SaaS → Tenants` permite alterar:
  - `planId`
  - `billingStatus` (com trial default de 14 dias quando ativado)

Auditoria:
- `TENANT_BILLING_STATUS_CHANGE` em `audit_logs`.

## Próximos passos (quando formos para cobrança real)
- Introduzir `billingProvider` + `subscriptionId`
- `billingStatus` e `trialEndsAt` passarem a ser derivados via webhook
- "grace period" opcional (ex.: 3 dias) para não bloquear imediatamente em `past_due`

## Grace Period (carência) — Passo 11
Ver: `docs/40_BILLING_GRACE_PERIOD.md`.


---

## Referência

- Ver também: `docs/41_BILLING_MATRIZ_FINAL_E_MENSAGENS.md`
