# Leia-me — Atualizações (2026-02-27)

Este arquivo registra as **entregas do dia** para facilitar continuidade e auditoria de mudanças.

## Entregas

### 1) Auditoria por lote (batchId) — F3 ✅
- Dashboard do Admin ganhou o card **“Últimos lotes (batchId)”**
- Cada item abre o **Histórico** já filtrado pelo `batchId`

### 2) ANÁLISE FAT (NFS-e) — ajustes Itaqua + ergonomia ✅
- **Regra Itaquaquecetuba (fechamento):** PIS/COFINS entram no **total retido** e são **abatidos do líquido**.
- **Compatibilidade:** NFs importadas antes desta regra são corrigidas **na consulta** (recalcula em memória); novos imports salvam `calcV=2`.
- Consulta: filtro por **Número da NFS-e**.
- Export: botão **Baixar XLS** (abre em colunas no Excel) + botão **Limpar filtros**.
- UI: fonte da tabela “Notas do mês” levemente menor (≈ -2px).

## Documentos de referência
- `docs/00_ONDE_PARAMOS.md`
- `docs/00_PROMPT_NOVO_CHAT.md`
- `docs/04_PROXIMOS_PASSOS.md`
- `docs/46_ANALISE_FAT_NFSE.md`
- `docs/02_CHANGELOG.md`
