# Dev Badge — Tenant ativo no Portal do Paciente

## Objetivo
Evitar confusão durante testes locais ao configurar `tenants/{tenantId}/settings/patientPortal` no Admin.

## Comportamento
- **Somente em DEV** (`process.env.NODE_ENV !== "production"`).
- Exibe um badge discreto com o `tenantId` ativo no Portal do Paciente.
- O `tenantId` exibido é o mesmo retornado por `GET /api/paciente/agenda`.

## Arquivo
- `src/components/Patient/AgendaPsiPatientFlow.js`

## Como validar
1. Rodar `npm run dev`
2. Abrir `/paciente` e logar
3. Verificar badge `tenantId: ...` no topo da tela (logo acima do header)
