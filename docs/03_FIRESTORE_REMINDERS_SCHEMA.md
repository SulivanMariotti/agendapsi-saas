# Firestore — Estrutura `appointments.reminders` (Handoff 2026-02-15)

## Documento
`appointments/{appointmentId}`

## Estrutura
```js
appointments/{id} {
  // ...
  reminders: {
    slot1: {
      sentAt: Timestamp,           // gravado somente em sucesso
      dedupeKey: "id:slot1",
      attempts: number,
      lastAttemptAt: Timestamp,
      lastResult: "success"|"failure",
      lastError?: string,
      lastErrorCode?: string,
      lastMessageId?: string
    },
    slot2: { ... },
    slot3: { ... }
  }
}
```

## Regras de idempotência
- Se `reminders.slotX.sentAt` existe → **não reenviar slotX**
- Slots são independentes:
  - pode existir `slot1.sentAt` e `slot2.sentAt` no mesmo appointment (em dias diferentes), sem conflito.

## Observabilidade
Campos úteis para auditoria/depuração:
- `attempts`, `lastAttemptAt`, `lastResult`, `lastError`, `lastErrorCode`, `lastMessageId`, `dedupeKey`
