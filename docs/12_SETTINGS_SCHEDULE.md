# Settings — Agenda do Profissional (AgendaPsi)

Data: 2026-02-28

## Objetivo
Centralizar no **Painel Admin** as configurações que determinam como a **agenda do profissional** se comporta (grade, funcionamento por dia, pausa de almoço, duração padrão e buffer).

> Decisão: **o profissional não configura** horários de funcionamento. Ele apenas consome a configuração (evita inconsistência e mantém governança no Admin).

## Onde fica (UI)
- **URL:** `/admin`
- **Menu:** `AgendaPsi — Agenda do Profissional`

## Persistência (Firestore)
Documento por tenant:
- `tenants/{tenantId}/settings/schedule`

### Campos principais
- `slotIntervalMin` (number): 30 | 45 | 60
- `defaultBlocks` (number): 1..8 (duração padrão em blocos)
- `bufferMin` (number): 0..120
- `lunch`:
  - `enabled` (bool)
  - `start` (HH:MM)
  - `end` (HH:MM)
- `week` (config “crua” por dia):
  - `{mon|tue|...|sun}: { enabled, start, end }`
- `weekAvailability` (derivado / efetivo):
  - `{mon|tue|...|sun}: [{ start, end }, ...]`
  - Quando o almoço está **dentro** do intervalo do dia, divide em 2 ranges: `[{start, lunch.start}, {lunch.end, end}]`

### Metadados
- `createdAt` (serverTimestamp)
- `updatedAt` (serverTimestamp)

## API (Admin)
- `GET /api/admin/agendapsi/schedule?tenantId=...`
- `PUT /api/admin/agendapsi/schedule`
  - Body: `{ tenantId, slotIntervalMin, defaultBlocks, bufferMin, lunch, week }`

Segurança:
- Bearer Token (Firebase ID token)
- Custom claim `role=admin` (ou `admin=true`)
- Origin guard + rate-limit

## Consumo no Profissional
O painel `/profissional` usa `weekAvailability` para:
- decidir se o dia está aberto/fechado
- montar a grade por **ranges efetivos** (ex.: remove intervalo de almoço)

## Regras importantes (MVP)
- **Buffer (`bufferMin`) é aplicado como “intervalo entre sessões”**:
  - Ao criar **Hold** ou **Agendamento**, o sistema bloqueia o início de outros atendimentos dentro do buffer.
  - O cálculo do buffer é arredondado por cima para caber na grade (`slotIntervalMin`). Ex.: grade 30m + buffer 15m → considera 1 bloco (30m).
- O recurso **“Próximo horário”** também respeita o buffer (não sugere horários que conflitem com intervalos entre sessões).
