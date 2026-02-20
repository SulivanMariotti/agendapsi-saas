# Próximos passos — checklist rápido (atualizado em 2026-02-19)

## A) Produção (essencial)
- Confirmar `config/global` com mensagens (msg1/msg2/msg3) e títulos (incluindo follow-ups presença/falta).
- Confirmar Firestore rules publicadas (principalmente `users`, `audit_logs`, `subscribers`, `library_*`, `patient_notes`).
- Confirmar **TTL ativo** (policies): `history.expireAt`, `audit_logs.expireAt` e `_rate_limits.expireAt`.
- Validar Web Push:
  - desregistrar SW (`firebase-messaging-sw.js`) no navegador e recarregar.

## B) Prioridade clínica (próxima entrega)
- [ ] **Painel de constância (30 dias)** com insights clínicos (sem moralismo):
  - visão geral + tendência
  - sinais leves/moderados/altos (heurísticos) com linguagem acolhedora e firme
  - filtros úteis (período/profissional/paciente)
- [ ] Consolidar ingestão da **2ª planilha/relatório real**:
  - validar cabeçalhos reais no modo mapeado
  - ajustar sinônimos/normalizações (sem pedir mudança no CSV do operador)

## C) Robustez (recomendado)
- [ ] Auditoria por **batchId** do envio (opcional): rastrear lote do dia (enviados/bloqueados) para auditoria “sem dúvida”.
- [ ] Idempotência por sessão+slot no envio de lembretes:
  - gravar `appointments/{id}.reminders.slotX.sentAt` ao enviar, e checar antes de reenviar.
- [ ] Documentar modelo NoSQL (denormalização + chave única do paciente).

## D) Segurança (pós-v1)
Já existe schema-lite + rate limit em rotas críticas.

Próximos:
- [ ] Expandir **schema-lite** para 100% dos endpoints com escrita (allowedKeys + maxBytes por rota).
- [ ] Adotar **schema forte** (ex.: Zod) gradualmente nos endpoints mais sensíveis.
- [ ] Revisão de endpoints que usam **Admin SDK**: garantir sempre **role + ownership + logs** antes de ler/gravar.
- [ ] Higiene de logs: não gravar PII, padronizar erros e manter rastreabilidade (audit_logs).
- [ ] LGPD operacional (retenção/backup/export) antes de OTP/PWA/App.
