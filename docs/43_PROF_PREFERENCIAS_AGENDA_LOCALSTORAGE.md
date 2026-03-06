# AgendaPsi — Profissional: Preferências da Agenda (localStorage)

## Objetivo
Persistir preferências de UI/UX da agenda do profissional **no navegador** para manter continuidade após F5/novo login.

> Importante: **não** armazenar dados clínicos/sensíveis. Apenas preferências visuais e de navegação.

## Escopo (v1 — MVP)
- `viewMode`: `"day" | "week" | "month"`
- `statusFilter`: `"all" | "scheduled" | "confirmed" | "holds"`
- `searchScope`: `"view" | "all"` (busca **Nesta visão** vs **Todos os pacientes**)
- `headerCollapsed`: `boolean` (colapso manual da Camada 2 do header)
- `weekDensity`: `"comfortable" | "compact"` (densidade da visão **Semana**)
- Ação **Padrão** no header: limpa preferências salvas e aplica defaults imediatamente (inclui `searchScope`)

## Chave (por tenant + usuário)
Formato:
- `agendapsi:pro:agendaPrefs:v1:{tenantId}:{uid}`

Motivo:
- evita vazamento entre tenants
- evita colisão entre usuários do mesmo tenant

## Regras de fallback/segurança
- JSON inválido → volta para defaults
- valores fora do enum → sanitiza para default
- ausência de `tenantId` ou `uid` → não persiste

## Observações
- A aplicação da `viewMode` salva só é automática quando **não** há `view` explícito na URL.
  - Ex.: abrir `/profissional` sem query → respeita a preferência.
  - Ex.: abrir `/profissional?view=month` → respeita a URL (não sobrescreve).

## Próxima iteração (pós v1)
- sincronizar preferências entre abas (listener `storage`)
