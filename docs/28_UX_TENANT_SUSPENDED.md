# UX — Tenant Suspenso (SaaS)

## Objetivo
Quando um tenant está com `tenants/{tenantId}.status != "active"`, o sistema deve **bloquear o acesso**
e exibir uma mensagem **clara e não-técnica** para:

- Profissional (login)
- Paciente (portal)

## Comportamento
### Profissional
- `POST /api/auth/session` retorna `403` com `code="TENANT_SUSPENDED"`.
- O componente de login apresenta: **"Este tenant está suspenso no momento..."**.

### Paciente
- Endpoints `/api/paciente/*` retornam `403` com `code="TENANT_SUSPENDED"`.
- O portal renderiza uma tela dedicada com:
  - título “Acesso temporariamente suspenso”
  - ação “Tentar novamente”
  - ação “Sair”

## Nota LGPD/Produto
A mensagem não deve revelar informações internas do sistema nem listar motivos.
A comunicação deve orientar o paciente/profissional a contatar a clínica/suporte.
