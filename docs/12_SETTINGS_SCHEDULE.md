# Settings/Schedule — AgendaPsi

Atualizado: **2026-03-02**

## Caminho
`tenants/{tenantId}/settings/schedule`

## Campos (MVP)
- `slotIntervalMin` (30/45/60)
- `bufferMin`
- `defaultBlocks`
- almoço:
  - `lunchEnabled`
  - `lunchStart` / `lunchEnd`
- `days`:
  - `enabled`
  - `ranges` (lista de `(35230, 3521)`)

## Regras
- O Profissional (Dia/Semana/Mês) deve respeitar:
  - ranges do dia
  - almoço (quando habilitado)
  - buffer
- “Próximos horários” usa schedule + buffer para sugerir slots livres.

