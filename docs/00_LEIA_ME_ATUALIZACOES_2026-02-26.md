# Atualização — 2026-02-26

## O que mudou (resumo)
### ANÁLISE FAT (NFS-e)
- Módulo Admin-only acessível via `/admin/fat` (não aparece no menu do `/admin`).
- Upload/análise de XML de NFS-e com:
  - faturado (bruto), líquido, tributos separados (ISS/PIS/COFINS/IRRF/CSLL/total retido)
  - Tomador (CNPJ/CPF + Nome)
- Persistência no Firestore com deduplicação:
  - `fat_nfse_invoices`
  - `fat_nfse_import_batches`
- Consulta por Emissão (de/até) e Tomador; campo “Competência (YYYY-MM)” funciona como atalho para Emissão do mês.
- Exclusão por número com “Verificar” + confirmação **EXCLUIR**.
- UX: organização Importar/Consultar/Excluir sem “troca de botões” no topo.

## Arquivos de referência
- `docs/46_ANALISE_FAT_NFSE.md`
- `docs/73_ADMIN_MANUAL_DE_USO.md`
- `docs/16_API_ENDPOINTS_CATALOG.md`
- `docs/18_TROUBLESHOOTING_COMMON_ERRORS.md`
- `docs/00_ONDE_PARAMOS.md`
- `docs/00_PROMPT_NOVO_CHAT.md`
