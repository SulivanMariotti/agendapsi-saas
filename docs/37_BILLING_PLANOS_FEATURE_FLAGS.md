# Billing/Planos — Feature Flags e Limites por Tenant (Pós‑MVP)

Data: 2026-03-04  
Status: **Pré‑billing** (sem cobrança integrada; apenas base técnica)

## Objetivo

Preparar o AgendaPsi para SaaS com planos, sem alterar o core do MVP agora:

- Definir **planos** (ex.: Free/Pro/Enterprise)
- Definir **limites** (ex.: quantidade de templates WhatsApp)
- Definir **feature flags efetivas** para o Portal do Paciente (settings ∩ plano)
- Permitir o **Super Admin** ajustar o plano do tenant em `/admin` (SaaS → Tenants)

> Importante: Billing real (assinatura/cobrança, status de pagamento, trial, etc.) entra depois.
> Aqui estabelecemos apenas o “pode ou não pode” e “até quanto pode”.

---

## Fonte da verdade

- `tenants/{tenantId}.planId` (string)
  - `free` | `pro` | `enterprise`
  - Compatibilidade: se ausente/ inválido → assume `pro` (para não quebrar tenants antigos)

---

## Definições de plano (server-side)

Arquivo: `src/lib/server/tenantPlan.js`

### Features (exemplo atual)
- `patientPortal.library`
- `patientPortal.notes`
- `patientPortal.reminders`

### Limites (exemplo atual)
- `whatsappTemplatesMax`

---

## Regras de efetividade (Portal do Paciente)

A configuração do tenant (Admin do tenant) continua em:
- `tenants/{tenantId}/settings/patientPortal`

Mas o comportamento efetivo é:
- **efetivo = (flag do tenant) AND (flag permitida pelo plano)**

Implementado em:
- `src/lib/server/patientPortalConfig.js`

Consequência:
- Mesmo se `libraryEnabled=true` no settings, o plano pode forçar **false**.

---

## Enforcements já aplicados

1) **Portal do paciente (APIs)**
- `getPatientPortalConfig()` já devolve as flags efetivas considerando o plano

2) **Templates WhatsApp (Admin do tenant)**
- `POST /api/professional/admin/whatsapp-templates` bloqueia quando ultrapassar `whatsappTemplatesMax`
- Erro padrão: `403` com `code="PLAN_LIMIT_EXCEEDED"`

---

## UI (Super Admin)

Em `/admin` → `SaaS → Tenants`:
- Coluna **Plano**
- Select `free/pro/enterprise`
- Botão **Aplicar** → `PATCH /api/admin/saas/tenants { tenantId, planId }`

Auditoria:
- `TENANT_PLAN_CHANGE` em `audit_logs`

---

## Próximos passos (quando entrar Billing real)

- Introduzir `billingStatus` (trialing/active/past_due/canceled) e comportamento associado
- Tela de “Plano e Cobrança” no tenant admin
- Limites adicionais (pacientes, profissionais, séries, etc.)
- Feature flags por plano com matriz completa


## Limites (MVP+)
Além de `whatsappTemplatesMax`, os planos passam a prever:
- `patientsMax`
- `seriesMax`

O enforcement está descrito em `docs/38_LIMITES_POR_PLANO_ENFORCEMENT.md`.


## Billing Status
Ver também: `docs/39_BILLING_STATUS_TRIAL_PASTDUE.md`.
