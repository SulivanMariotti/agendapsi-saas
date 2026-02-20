# Atualização — 2026-02-19 (Step 11)

## Objetivo
Preparar continuidade sem retrabalho: consolidar documentação do estado atual (Presença/Faltas + Paciente server-side + Segurança).

## O que ficou registrado
- Presença/Faltas:
  - import CSV robusto (BOM + autodetect de separador + DATA/HORA em coluna única)
  - métricas por `isoDate`
  - follow-ups com bloqueios de segurança (`unlinked_patient`, `ambiguous_phone`, `phone_mismatch`)
- Paciente (server-side para reduzir fricção): ping, contrato e notas via API.
- Segurança:
  - v1 concluída
  - pós-v1 aplicado
  - schema-lite (`payloadSchema.js`) em rotas críticas.

## Onde olhar primeiro ao retomar
- `docs/00_ONDE_PARAMOS.md`
- `docs/00_PROMPT_NOVO_CHAT.md`
- `docs/01_HANDOFF.md`
- `docs/02_BACKLOG.md`
- `docs/04_PROXIMOS_PASSOS.md`
