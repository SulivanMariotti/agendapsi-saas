# AgendaPsi — Prontuário / Evolução por sessão (MVP)

Atualizado: **2026-03-02**

## Objetivo
Registrar **evolução por sessão** (prontuário) com **texto livre**, mantendo:
- prontuário como **histórico longitudinal do paciente**
- consulta da evolução pelo **agendamento/sessão**
- exclusão do agendamento libera o horário, mas **não apaga** histórico

---

## Conceito (produto)
### Evolução por sessão (prontuário)
- Campo **livre** de digitação (**sem códigos**).
- Vinculada ao **paciente** e referenciada pela sessão (ocorrência do agendamento).
- Serve para registrar o que foi trabalhado/observado **dentro do âmbito da sessão**.

### O que NÃO é (para evitar confusão)
- Não é “ocorrência extra”.
- Não é log operacional.

---

## Modelo de dados (MVP)
Caminho:
- `tenants/{tenantId}/patients/{patientId}/sessionEvolutions/{occurrenceId}`  
  (docId = `occurrenceId`)

Campos:
- `occurrenceId` (string)
- `seriesId` (string, opcional)
- `sessionStartAt` (timestamp)
- `text` (string)
- `createdByUid` (string)
- `createdAt`, `updatedAt`

---

## UX (MVP)
No detalhe do agendamento:
- campo de texto para evolução
- botão salvar
- histórico recente do paciente (evoluções)

> Pendência de UX: exibir em abas junto com “Ocorrência (extra)” para reduzir confusão.

---

## Checklist de validação
- [ ] Salvar evolução persiste no caminho do paciente.
- [ ] Reabrir detalhe da sessão mostra o texto salvo.
- [ ] Excluir o agendamento não apaga a evolução já registrada.
