# Próximos passos — checklist rápido

## A) Produção (essencial)
- Confirmar `config/global` com mensagens msg1/msg2/msg3 e títulos.
- Validar `firebase-messaging-sw.js` atualizado (desregistrar SW no browser e recarregar).
- Rodar limpeza de testes (apenas se for necessário):
  - attendance: `node scripts/purgeAttendanceLogs.cjs --yes`
  - histórico: `node scripts/purgeAttendanceLogs.cjs --collection=history --yes`
  - auditoria: `node scripts/purgeAttendanceLogs.cjs --collection=audit_logs --yes`

## B) Robustez (recomendado)
- Idempotência por sessão+slot:
  - gravar `appointments/{{id}}.reminders.slotX.sentAt` ao enviar, e checar antes de reenviar.
- Melhorar preview no Admin para indicar “já enviado/ignorando”.
