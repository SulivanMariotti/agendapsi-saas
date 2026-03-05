# 38 — Billing/Planos: Limites por plano (enforcement)

Data: 2026-03-04

## Objetivo
Garantir que os limites definidos por plano sejam **aplicados no momento de criação**, evitando crescimento descontrolado por tenant antes da etapa de cobrança real.

Este documento complementa:
- `docs/37_BILLING_PLANOS_FEATURE_FLAGS.md`

## Onde os limites são definidos
Arquivo fonte:
- `src/lib/server/tenantPlan.js`

Chaves de limite (MVP+):
- `whatsappTemplatesMax`
- `patientsMax`
- `seriesMax` (séries em `appointmentSeries`, inclui *holds* e séries de sessões)

## Onde os limites são aplicados (enforcement)
Implementação (server-side):
- `src/lib/server/agendapsiData.js`

Regras:
1) **Pacientes (`patientsMax`)**
   - Aplicado quando o CPF ainda não existe no índice (`patientCpfIndex/{cpf}`).
   - Se exceder, gera erro:
     - `code = PLAN_LIMIT_EXCEEDED`
     - HTTP 403 (nas APIs do Profissional)

2) **Séries (`seriesMax`)**
   - Aplicado quando for necessário criar um novo doc em `appointmentSeries`:
     - criação de série de sessões
     - criação de série de holds
     - conversão de hold avulso para série (quando não existia série)
     - reagendar “esta e futuras” quando isso gera *split* e cria nova série

## Resposta padrão da API ao exceder limite
As rotas do Profissional normalizam para:
- Status: **403**
- Payload:
```json
{
  "ok": false,
  "code": "PLAN_LIMIT_EXCEEDED",
  "error": "Limite do plano atingido (...)",
  "planId": "free|pro|enterprise",
  "limitKey": "patientsMax|seriesMax|whatsappTemplatesMax",
  "limit": 30
}
```

## Notas
- Por padrão, se `tenants/{tenantId}.planId` estiver ausente, assume **`pro`** (compatibilidade).
- Billing real (assinatura/pagamento/bloqueios por inadimplência) permanece fora do escopo.
