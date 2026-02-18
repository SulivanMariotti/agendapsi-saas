# 11_HISTORY_LOGGING_STANDARD.md

Este documento define o **padrão de logs** do Firestore para a coleção `history`, que é **schema flexível**, mas deve seguir um contrato mínimo para manter rastreabilidade e permitir auditoria clínica-operacional **sem armazenar PII desnecessária**.

> Princípio do produto: **constância é cuidado**. Logs existem para sustentar o processo: prevenir falhas de envio, identificar bloqueios (ex.: paciente inativo), e garantir que o sistema não “abandone” o paciente por erro técnico.

---

## Coleção: `history/{id}`

### Campos obrigatórios (mínimo recomendado)

- `type` *(string)* — tipo do evento.
- `createdAt` *(timestamp)* — quando ocorreu (serverTimestamp recomendado).
- `expireAt` *(timestamp)* — quando pode ser apagado (TTL/rotação).

### Campos opcionais úteis

- `payload` *(map)* — dados estruturados do evento (sem PII sensível).
- `severity` *(string)* — `info | warn | error`
- `actor` *(string)* — `system | admin:{uid} | patient:{uid}`
- `correlationId` *(string)* — id para correlacionar múltiplos logs de um mesmo fluxo
- `version` *(string)* — versão do schema do payload (ex.: `v1`)

---

## Regras de privacidade (importante)

✅ Pode:
- `patientId` (uid)
- `appointmentId`, `uploadId`, contadores/estatísticas
- status e razões de bloqueio (`blockedReason`)
- **telefone/e-mail mascarados** (ex.: `***1234`, `a***@dominio.com`) quando realmente ajudar a debugar
- hashes/tails de token (`tokenHash`, `tokenTail`) — **nunca token bruto**

🚫 Evitar (não registrar):
- telefone ou e-mail completos
- texto final de mensagens (template já interpolado)
- anotações clínicas (`patient_notes`)
- diagnósticos, queixas, eventos íntimos

---

## Implementação (padrão do código)

Use sempre o helper server-side:
- `writeHistory(db, { type, ...fields })`

Ele garante automaticamente:
- mascaramento de PII comum (telefone/e-mail)
- redaction de `token` bruto
- truncagem de `userAgent`/strings longas
- `expireAt` baseado em `HISTORY_RETENTION_DAYS` (padrão 180)

Doc de retenção/TTL:
- `docs/75_RETENCAO_LOGS_TTL_E_CRON.md`

---

## Checklist de implementação (para o dev)

- [ ] Sempre usar `writeHistory` (não escrever direto em `history`)
- [ ] Sempre registrar `type`
- [ ] Nunca registrar texto final de mensagens
- [ ] Sempre registrar `blockedReason` quando `status=blocked`
- [ ] Manter logs legíveis e pequenos (evitar payload gigante)

