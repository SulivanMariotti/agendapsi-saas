# Próximos passos — checklist rápido (atualizado em 2026-02-18)

## A) Produção (essencial)
- Confirmar `config/global` com mensagens msg1/msg2/msg3 e títulos.
- Validar `firebase-messaging-sw.js` atualizado (desregistrar SW no browser e recarregar).
- Confirmar Firestore rules publicadas (especialmente `users`, `audit_logs`, `subscribers`, `library_*`).
- Confirmar **TTL ativo** (policies): `history.expireAt`, `audit_logs.expireAt` e `_rate_limits.expireAt`.
- Rodar limpeza de testes (apenas se for necessário):
  - attendance: `node scripts/purgeAttendanceLogs.cjs --yes`
  - histórico: `node scripts/purgeAttendanceLogs.cjs --collection=history --yes`
  - auditoria: `node scripts/purgeAttendanceLogs.cjs --collection=audit_logs --yes`

## B) Próxima entrega (prioridade clínica)
- **Presença/Faltas**: melhorar painel de constância (30 dias) com insights clínicos (sem moralismo).
- Ingestão de **segunda planilha/relatório** (presença/faltas) para painel e follow-ups futuros.

## C) Robustez (recomendado)
- Auditoria por **batchId** do envio (opcional): rastrear lote do dia.
- Idempotência por sessão+slot:
  - gravar `appointments/{id}.reminders.slotX.sentAt` ao enviar, e checar antes de reenviar.
- Documentar modelo NoSQL (denormalização + chave única do paciente).


## D) Segurança (pós-v1) — quando voltar para hardening
- Validação forte de entrada (schema) em rotas API (Zod) + limites de tamanho.
- Anti-abuso por IP/fingerprint simples nas rotas críticas.
- Revisão de endpoints com Admin SDK (bypass das rules): role + ownership sempre antes de ler/gravar.
- Higiene de logs/erros: evitar PII em logs, padronizar erros e manter rastreabilidade.
- Atualizar documentação de segurança/endpoint catalog após cada hardening.
