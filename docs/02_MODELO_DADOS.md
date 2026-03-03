# Modelo de dados — AgendaPsi (SaaS)

Atualizado: **2026-03-02**

> Este arquivo é o resumo executivo do modelo. Para detalhes completos: `docs/03_MODELO_FIRESTORE.md`.

---

## 1) Princípios
- **Isolamento por tenant**: todo dado de negócio vive dentro de `tenants/{tenantId}/...`.
- **Índice global mínimo**: apenas `userTenantIndex/{uid}` fora de `tenants/` para resolver tenant rapidamente no login.
- **Sem `collectionGroup`** como regra do projeto (preferir caminhos diretos por tenant).
- **Evitar índices compostos** sempre que possível:
  - uso de `slotKey` (ex.: `YYYY-MM-DD#HH:MM`) para buscas simples
  - logs por subcoleções (sem `where + orderBy` em collection raiz)
- **Timestamps**: `createdAt/updatedAt` com `serverTimestamp` quando aplicável.

---

## 2) Árvore de coleções (MVP)

```
userTenantIndex/{uid}

tenants/{tenantId}
  users/{uid}
  settings/schedule

  patients/{patientId}
    sessionEvolutions/{occurrenceId}     # evolução (texto livre) por sessão
    occurrenceLogs/{logId}              # espelho para histórico do paciente (registro extra)

  occurrenceCodes/{codeId}              # catálogo admin (para ocorrência extra)
  whatsappTemplates/{templateId}        # previsto

  appointmentSeries/{seriesId}
  appointmentOccurrences/{occurrenceId}
    occurrenceLogs/{logId}              # registro extra vinculado ao agendamento
```

> Observação: **Holds/Reservas** vivem em `appointmentOccurrences` com `isHold=true` (não existe coleção separada de hold).

---

## 3) Conceitos importantes

### 3.1 Evolução por sessão (prontuário)
- Texto livre.
- Guardado no **paciente** (`patients/{patientId}/sessionEvolutions/{occurrenceId}`).
- Referenciado por `occurrenceId` (sessão).

### 3.2 Ocorrência (registro extra)
- Registro estruturado fora do âmbito da sessão.
- Usa catálogo de códigos (Admin) + descrição.
- Guardado:
  - na ocorrência (`appointmentOccurrences/{occurrenceId}/occurrenceLogs/{logId}`)
  - e espelhado no paciente (`patients/{patientId}/occurrenceLogs/{logId}`) para histórico/relatórios.

---

## 4) Campos mínimos (alto nível)
- `appointmentOccurrences`: `startAt`, `endAt`, `slotKey`, `status`, `isHold`, `seriesId`, `sessionIndex`, `plannedTotalSessions`
- `patients`: dados cadastrais + `notes` (observações gerais)
- `sessionEvolutions`: `text`, `sessionStartAt`, `createdAt`, `updatedAt`, `createdByUid`
- `occurrenceLogs`: `codeId`, `code`, `description`, `createdAt`, `createdByUid`, `occurrenceId`, `patientId`, `sessionStartAt`
