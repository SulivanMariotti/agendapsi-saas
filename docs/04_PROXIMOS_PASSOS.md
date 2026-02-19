# Próximos passos — checklist rápido (atualizado em 2026-02-19)

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
- ✅ **Presença/Faltas**: painel de constância (30 dias) com insights clínicos (sem moralismo) + atenção clínica.
- ✅ Ingestão de **segunda planilha/relatório**: **Modo Mapeado** (colunas selecionáveis) + suporte a **DATA/HORA** em coluna única.
- ✅ Segurança (pós-v1): **validação de payload (schema-lite)** + **anti-abuso por IP** nas rotas críticas.
- ✅ Paciente (Admin SDK): **ping/contrato/notas server-side** (reduz `permission-denied` e fricção).
- ⏭️ Próximo: testar com **relatório real** do seu fornecedor e ajustar sinônimos/normalizações (status e formatos).

## C) Robustez (recomendado)
- Auditoria por **batchId** do envio (opcional): rastrear lote do dia.
- Idempotência por sessão+slot:
  - gravar `appointments/{id}.reminders.slotX.sentAt` ao enviar, e checar antes de reenviar.
- Documentar modelo NoSQL (denormalização + chave única do paciente).

## D) Segurança (pós-v1) — quando voltar para hardening
- ✅ Validação de entrada (schema-lite) nas rotas críticas + limites de tamanho (CSV e strings).
- ✅ Anti-abuso por IP (limiter IP + limiter por usuário/telefone) e normalização de IP.
- ✅ Redução de superfície: `/api/patient-auth` (login por e-mail) retorna **404 em produção** quando desativado (padrão).
- ⏭️ Evoluir validação para **Zod** (schema forte) quando quiser padronizar tudo e reduzir repetição.
- ⏭️ Revisão completa de endpoints com Admin SDK (bypass das rules): role + ownership sempre antes de ler/gravar.
- ✅ Paciente (parcial): writes críticos migrados para API (ping/contrato/notas).
- ⏭️ Higiene de logs/erros: evitar PII em logs, padronizar erros e manter rastreabilidade.
- ⏭️ Atualizar documentação de segurança/endpoint catalog após cada hardening.
