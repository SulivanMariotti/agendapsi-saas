# Segurança — Plano para liberar produção (checklist vivo)

> Norte clínico: segurança e privacidade sustentam vínculo. Qualquer brecha vira quebra de confiança e aumenta chance de falta.

## Status atual (2026-02-20)
✅ Segurança v1 concluída + hardening pós-v1 em andamento.

### Já resolvido (baseline)
- Paciente: login por telefone + código (single-use por dispositivo).
- Login inseguro do paciente por e-mail: desativado por padrão.
- Admin: custom claims + guards server-side.
- Firestore rules endurecidas (paciente não altera identidade; notas/agenda via API server-side).
- Origin guard + rate limit em rotas críticas.
- CSP/headers em produção.
- Logs com `expireAt` + TTL ativo (`history`, `audit_logs`, `_rate_limits`).

---

## Regras atuais de acesso (importante)
### Paciente: manter acesso contínuo (constância)
O paciente deve permanecer logado para reduzir fricção e sustentar presença.

**Bloqueio de acesso do paciente é SOMENTE por segurança/privacidade**, nunca por “status clínico” ou faltas.

Campos aceitos para bloquear:
- `accessDisabled: true`
- `securityHold: true`
- `access.disabled: true`
- `accessStatus` em `disabled|blocked|suspended|hold`

### Revogação de token (incidente)
`verifyIdToken(..., checkRevoked)` deve estar **ligado em produção** (toggle por env) para cortar acesso em caso de:
- dispositivo perdido/roubado
- pareamento indevido
- suspeita de abuso

---

## Pendências para nota ≥ 9/10 (prioridade)
1) **Admin login forte**
- Migrar `ADMIN_PASSWORD` → Firebase Auth com **MFA/TOTP obrigatório** (preferido) ou magic link (alternativa).
- Migração progressiva e desligamento do legado em produção.

2) CSP
- Planejar redução/remoção de `unsafe-inline` (nonce/hashes).

3) Validação de payload
- Expandir validações (schema mais forte) nas rotas restantes, padronizando erros.

---

## Auditoria
- Ações sensíveis devem registrar `audit_logs` (com TTL) e, quando útil, `history`.
- Endpoint para suspender/liberar acesso do paciente deve sempre auditar (`POST /api/admin/patient/access`).
