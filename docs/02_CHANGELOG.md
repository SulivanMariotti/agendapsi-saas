# Changelog — Sessão até 2026-02-15

## Passo 14
- Logs de falha/ok passaram a salvar `reminderType` e `reminderTypes` (slots) para agrupamento “Campanhas”.

## Passo 14.1
- Histórico (Campanhas) normaliza e reconhece `reminderType/reminderTypes`, evitando “Sem slot” indevido.

## Passo 15
- Reconciliação do upload da agenda por **janela**:
  - sessões FUTURAS que não vieram no upload atual → `cancelled` + `missing_in_upload` (soft, sem apagar histórico).
  - garante que cancelamento na clínica interrompa 24h/12h.

## Passo 16 (iterações)
- Mensagens:
  - suporte a placeholders PT/EN na interpolação.
  - `AdminScheduleTab`: usa `msg1/msg2/msg3` e envia `messageBody` quando disponível.
- Push:
  - correção de duplicidade (SW não duplica quando houver `payload.notification`).
  - envio com `webpush.notification` + `tag`/`dedupeKey` + `data`.

## Limpeza de testes (produção)
- Script `scripts/purgeAttendanceLogs.cjs` (v3 ASCII) para apagar `attendance_logs` e opcionalmente `history/audit_logs`.
