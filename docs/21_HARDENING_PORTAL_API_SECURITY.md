# Hardening — Portal do Paciente (APIs): Origin Guard + Rate Limit

Data: 2026-03-03

## Objetivo
Ativar de forma efetiva:
- **Origin Guard (CSRF hardening)** via `enforceSameOrigin` (checando retorno `ok/res`).
- **Rate Limit** via `rateLimit` (usando `bucket/limit/windowMs/errorMessage`).

> Observação: antes deste hardening, algumas rotas chamavam os helpers mas não verificavam o retorno (`ok/res`) e usavam chaves incompatíveis (`key`, `keyPrefix`, `max`), o que resultava em proteção **inoperante**.

## Rotas ajustadas
- `GET|POST|DELETE /api/paciente/notes`
  - buckets: `paciente:notes:get`, `paciente:notes:post`, `paciente:notes:delete`
- `GET /api/paciente/library`
  - bucket: `paciente:library:get`
- `POST /api/paciente/access-code`
  - bucket: `paciente:access-code` (global=true)

## Como validar
1. Em dev, confirme que tudo continua funcionando (origin guard é permissivo fora de production).
2. Em produção:
   - Faça POST/DELETE cross-site (ou simulando `sec-fetch-site=cross-site`) e confirme 403.
   - Faça spam de requests e confirme 429 com `Retry-After`.
