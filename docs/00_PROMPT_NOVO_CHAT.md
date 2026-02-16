# Lembrete Psi — Handoff para novo chat (2026-02-15)

## Contexto rápido
Projeto **Lembrete Psi** (Next.js + Firebase) focado em **sustentar vínculo terapêutico** via lembretes de sessão e psicoeducação de constância.  
Diretriz UX: **não facilitar cancelamento/remarcação** (sem botão de cancelar e sem CTA de WhatsApp para cancelar).

## Estado do sistema (antes das alterações desta rodada)
- Admin → Pacientes: tabela compacta com rolagem interna (8 linhas), filtros server-side, paginação por cursor, busca inteligente.
- Admin → Histórico: rolagem, filtros, modal de detalhes, paginação, visão “Falhas de envio” e “Campanhas” por slot.
- Disparo push: corrigida duplicidade via SW (service worker) + envio `webpush.notification` com `tag/dedupeKey`; placeholders PT/EN suportados.
- Import agenda: reconciliação por janela; sessão que some do upload diário é marcada `cancelled/missing_in_upload`.
- Script limpeza: `scripts/purgeAttendanceLogs.cjs` (v3 ASCII).

## Objetivo desta rodada
1) Confirmar que o pipeline **48h / 24h / 12h** não duplica e sempre preenche placeholders `{nome}/{profissional}/{data}/{hora}`.  
2) Implementar idempotência persistida por **sessão+slot** em:
   - `appointments/{id}.reminders.slotX.sentAt`  
   para evitar duplicidade em retries/clique duplo/re-disparo.

## Implementações feitas
### A) Idempotência persistida por sessão+slot
- Endpoint `POST /api/admin/reminders/send` agora:
  - **verifica no Firestore** se `appointments/{id}.reminders.slotX.sentAt` já existe antes de enviar.
  - se existe, **pula** e contabiliza `skippedAlreadySent`.
  - se envia com sucesso, grava `sentAt` com `serverTimestamp()` no slot correspondente.

### B) Placeholders garantidos (client + server)
- Client (preview/parse): substituição passou a ser **global** e compatível com `{chave}` e `{{chave}}`, PT/EN.
- Server (envio real): mesmo quando `messageBody` já vem preenchido do client, o server aplica `applyTemplate()` para **garantir** que nenhum placeholder “escape”.

### C) Hardening (auditoria por slot)
No mesmo endpoint, para cada `appointments/{id}.reminders.slotX`:
- `attempts` (incrementa a cada tentativa)
- `lastAttemptAt`
- `lastResult`: `"success"` / `"failure"`
- `lastError` / `lastErrorCode` (somente em falha)
- `lastMessageId` (se retornado pelo FCM)
- `dedupeKey`: `{appointmentId}:{slotX}` (estável por sessão+slot)

> Observação: `sentAt` continua sendo gravado **somente em sucesso**, preservando idempotência.

## Arquivos alterados (final)
1) `src/app/api/admin/reminders/send/route.js` *(versão “hardening” é a mais recente)*  
2) `src/services/dataService.js`  
3) `src/components/Admin/AdminScheduleTab.js`

## Como validar rapidamente
- Fazer um disparo e confirmar que grava `appointments/{id}.reminders.slotX.sentAt`.
- Repetir disparo: deve retornar `sentCount: 0` e `skippedAlreadySent > 0`.
- Conferir que `messageBody` não contém `{nome}` / `{{nome}}` etc (Preview / Histórico).
- Ver `attempts` e `lastResult` mudando em caso de falha.

## Próximas melhorias possíveis (se houver continuação)
- (Opcional) Registrar também `reminders.slotX.templateKey`/`templateVersion` para auditoria clínica (sem expor “cancelamento”).
- (Opcional) Job/cron seguro para envio automático (se ainda estiver manual), usando a mesma idempotência por slot.
