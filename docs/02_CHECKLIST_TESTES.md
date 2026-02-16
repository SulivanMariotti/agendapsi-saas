# Checklist de Testes — 48h/24h/12h, Idempotência e Placeholders (Handoff 2026-02-15)

## A) Teste de idempotência (sem DevTools)
1. Criar sessão (Manual) → `Verificar` → `Sincronizar`
2. `Gerar Preview do Disparo` → `Disparar Lembretes`
3. Repetir `Gerar Preview` → `Disparar` novamente

**Esperado:**
- 1ª vez: `sentCount > 0`, `skippedAlreadySent = 0`
- 2ª vez: `sentCount = 0`, `skippedAlreadySent > 0`
- No Firestore: `appointments/{id}.reminders.slotX.sentAt` existe (e não muda).

## B) Teste de placeholders (Preview + Histórico)
1. Em Configurações (MSG1/2/3), usar templates com `{nome}/{data}/{hora}/{profissional}`.
2. Fazer Preview e disparo.
3. No Histórico, abrir o registro.

**Esperado:**
- `messageBody` sem `{nome}`, `{{nome}}` e similares (tudo preenchido).

## C) Teste de slots (48h/24h/12h)
Criar 3 sessões Manual (com push ativo):
- TESTE 48H: ~48h à frente
- TESTE 24H: ~24h à frente
- TESTE 12H: ~12h à frente

Para cada uma:
- `Verificar` → confirmar “Faltam ~XXh”
- `Sincronizar` → `Disparar`
- Firestore: verificar `reminders.slot1.sentAt` / `slot2.sentAt` / `slot3.sentAt`

## D) Teste de falha (auditoria hardening)
(Se houver cenário de falha: token inválido, FCM indisponível, etc.)
- Verificar no doc `appointments/{id}.reminders.slotX`:
  - `attempts` incrementa
  - `lastResult = "failure"`
  - `lastError` preenchido
  - `sentAt` **não** deve existir até ter sucesso
