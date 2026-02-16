# Implementação — Idempotência 48h/24h/12h + Placeholders (Handoff 2026-02-15)

## 1) Slot 48h/24h/12h (como é calculado)
No client, durante `parseCSV` (Verificar), o slot é selecionado por janela:
- `slot3` (≈12h) se `diffHours <= offset3 + tol`
- `slot2` (≈24h) senão, se `diffHours <= offset2 + tol`
- `slot1` (≈48h) senão, se `diffHours <= offset1 + tol`

Com tolerância fixa: `tol = 6` horas.

Isso garante **1 slot por sessão** dentro de uma mesma verificação.

## 2) Onde o envio acontece
- UI: `src/components/Admin/AdminScheduleTab.js` → `handleDispatchReminders()`
- API: `src/app/api/admin/reminders/send/route.js`

## 3) Idempotência persistida por sessão+slot
### Requisito
Evitar duplicidade em:
- retries
- clique duplo
- re-disparo manual dentro da mesma janela

### Implementação
No endpoint `POST /api/admin/reminders/send`:
- Para cada item (sessão+slot), lê o doc `appointments/{appointmentId}` e verifica:
  - `reminders.slotX.sentAt`
- Se já existe → **skip** (incrementa `skippedAlreadySent`).
- Se não existe → tenta enviar e, em sucesso:
  - grava `appointments/{id}.reminders.slotX.sentAt = serverTimestamp()`

## 4) Placeholders garantidos
### Problema
- `String.replace()` simples pode trocar apenas a primeira ocorrência.
- Caso `messageBody` venha do client com placeholders “sobrando”, o server antes não reprocessava.

### Solução
- Client: template apply global, `{chave}` e `{{chave}}`, PT/EN.
- Server: sempre roda `applyTemplate()` também em `messageBody` (mesmo quando veio pronto).

Placeholders suportados:
- `{nome}` / `{{nome}}`
- `{profissional}` / `{{profissional}}`
- `{data}` / `{{data}}`
- `{hora}` / `{{hora}}`
E equivalentes EN quando aplicável (`{name}`, `{professional}`, `{date}`, `{time}`), dependendo do template/config.

## 5) Dedupe no dispositivo + SW (continua valendo)
- Envio usa `webpush.notification` com `tag` baseado em `dedupeKey`.
- No `firebase-messaging-sw.js`, quando `payload.notification` existe, o SW **não** chama `showNotification()` para evitar duplicidade 2x.
