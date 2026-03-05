# 35 — Hardening: Rate limit + origin guard nas APIs do Profissional

Data: 2026-03-04

## Contexto

As rotas `/api/professional/*` são **cookie-based** (sessão `__session`) e são chamadas diretamente pelo navegador do Profissional.
Para reduzir risco de abuso (scraping, brute force de endpoints, automações agressivas) e de CSRF/cross-site em produção, aplicamos:

- `enforceSameOrigin` (produção) para bloquear chamadas cross-site em métodos não-idempotentes
- `rateLimit` por bucket + `uid` (melhor esforço em memória; pode ser global via Firestore onde fizer sentido)

## Implementação

### Helper padrão

Criado helper:

- `src/lib/server/requireProfessionalApi.js`

Ele:
1) aplica `enforceSameOrigin` (produção)
2) resolve sessão via `getProfessionalApiSession()` (**inclui tenant ativo/suspensão**)
3) aplica `rateLimit` por `bucket` + `uid`

### Buckets e limites atuais

| Endpoint | Bucket | Limite (req/min) |
|---|---|---:|
| criar agendamento | `professional:appointment` | 60 |
| visão dia | `professional:day` | 240 |
| criar/alterar hold | `professional:hold` | 60 |
| próximo horário | `professional:next-available` | 240 |
| excluir ocorrência | `professional:occurrence-delete` | 60 |
| evolução | `professional:occurrence-evolution` | 60 |
| logs da ocorrência | `professional:occurrence-logs` | 180 |
| reagendar | `professional:occurrence-reschedule` | 60 |
| status | `professional:occurrence-status` | 60 |
| códigos de ocorrência | `professional:occurrence-codes` | 120 |
| histórico evoluções do paciente | `professional:patient-evolutions` | 180 |
| histórico logs do paciente | `professional:patient-logs` | 180 |
| schedule (GET/PUT) | `professional:schedule` | 120 |
| visão semana | `professional:week` | 240 |

> Ajustes finos podem ser feitos conforme telemetria real (sem quebrar UX).

## Auth

Também adicionamos hardening mínimo em:

- `POST /api/auth/session` com `rateLimit` global (Firestore) e `enforceSameOrigin`
- `POST /api/auth/logout` com `rateLimit` e `enforceSameOrigin`

## Validação

- chamadas GET continuam funcionando normalmente
- métodos POST/PUT/PATCH/DELETE em produção bloqueiam cross-site (`TENANT` + sessão cookie)
- 429 retorna JSON com `retryAfterSeconds` e header `Retry-After`
