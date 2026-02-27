# ANÁLISE FAT (XML de NFS-e) — Admin-only (2026-02-27)

## Propósito
Módulo interno (BI operacional) para **importar, armazenar e analisar NFS-e** por período, com foco em fechamento mensal.

- Entrega visão “1 olhar e pronto” de: **faturado (bruto)**, **líquido** e **tributos separados**
- Mostra **Tomador (CNPJ/CPF + Nome)** para controle e conciliação
- Evita duplicidade (NF já importada)
- **Acesso apenas em**: `/admin/fat`  
  (não aparece no menu do `/admin`)

## Fontes e campos (layout NFS-e SPED)
O parser mira o namespace:
`<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse">`

Campos principais (varia por provedor, então há fallbacks):
- **Competência do serviço (dCompet)**: `DPS/infDPS/dCompet`  
  > Observação: **não usamos dCompet como filtro principal de fechamento**, pois pode vir inconsistente. O fechamento é por **Emissão**.
- **Emissão (dhEmi)**: `DPS/infDPS/dhEmi`
- **Tomador**: `infDPS/toma/(CNPJ|CPF)` e `infDPS/toma/xNome`
- **Valores**:
  - **Bruto (faturado)**: `.../vServPrest/vServ` (quando existir) ou fallback `infNFSe/valores/vBC`
  - **Líquido (fechamento)**: `infNFSe/valores/vLiq` *(ajustado: deduz PIS/COFINS quando aplicável)*
  - **Retenções (fechamento)**: `infNFSe/valores/vTotalRet` *(ajustado: soma PIS/COFINS)*
- **Tributos (separados)** (quando presentes):
  - **ISS**: `infNFSe/valores/vISSQN`
  - **PIS/COFINS**: `.../tribFed/piscofins/(vPis|vCofins)`
  - **IRRF/CSLL**: `.../(vRetIRRF|vRetCSLL)`
  - Totais: `.../totTrib/vTotTrib/(vTotTribFed|vTotTribEst|vTotTribMun)`


## Regra Itaquaquecetuba — PIS/COFINS entram no “retido” e abatimento do líquido
Para **fechamento** em Itaquaquecetuba, consideramos **PIS e COFINS como valores a deduzir do líquido**, mesmo quando o XML **não marca** esses campos como “retidos”.

O sistema aplica (quando `vPis`/`vCofins` existirem):
- `totalRet_fechamento = vTotalRet + vPis + vCofins`
- `liquido_fechamento = vLiq - vPis - vCofins`

> Proteção anti “abatimento duplo”: se o provedor já trouxer `vLiq` com PIS/COFINS abatidos, o parser **não** abate novamente.

Compatibilidade:
- Notas importadas **antes** desta regra podem estar salvas com `liquido/totalRet` antigos. A consulta aplica a regra **em memória** quando `calcV` estiver ausente/antigo.
- Para persistir o novo cálculo no histórico, reimporte a NF (dedup impedirá duplicar) ou implemente um recalculador por `batchId` no futuro.


## Persistência (Firestore)
Collections (admin-only):
- `fat_nfse_invoices/{invoiceId}`
  - `invoiceId`: prioriza `infNFSe/@Id` (quando existir). Fallback: hash/concat de `emitCNPJ + nNFSe + dhEmi`.
  - Campos armazenados:
    - `issuedAt` (Date) — emissão
    - `competenceDate` (Date) — dCompet quando existir
    - `tomador`: `{ doc, name, type }`
    - `emitente`: `{ doc, name }`
    - `values`: `{ bruto, liquido, iss, pis, cofins, irrf, csll, totalRet }`
    - `calcV`: versão do cálculo de fechamento (ex.: `2` para regra Itaqua com PIS/COFINS abatidos).
    - `source`: `{ fileName, importedAt, batchId }`
- `fat_nfse_import_batches/{batchId}`
  - Metadados do upload: período, contagens, duplicadas, erros, usuário admin, timestamps.

## Deduplicação
No import:
- Se `invoiceId` já existir em `fat_nfse_invoices`, a nota entra como **duplicada** (skip de persistência), evitando somar duas vezes.

## UI / Fluxo do Admin (/admin/fat)
A tela é dividida em **3 seções** (não “troca botões” no topo):

### 1) Importar (Upload de XML)
- Upload de **1 XML com várias notas** e/ou **múltiplos XMLs**
- Ações:
  - **Analisar** (prévia)
  - **Importar e salvar** (persistir + gerar `batchId`)
- Mostra: Importadas / Duplicadas / Erros

### 2) Consultar (Histórico)
Filtros opcionais:
- **Competência (YYYY-MM)** → mapeado internamente para intervalo de **Emissão** do mês (do dia 01 ao último dia)
- **Emissão (de/até)** (ambos necessários quando usar este filtro)
- **Tomador (CNPJ/CPF)**
- **Número da NFS-e**

Ações:
- **Buscar**
- **Limpar filtros**
- **Baixar XLS** (exporta exatamente o resultado exibido na tela)

> Regra: **basta 1 filtro**. Se tudo estiver em branco, a consulta é bloqueada (evita varrer o banco).

### 3) Excluir (por número)
- Informar número da NFS-e
- **Verificar** (dry-run) lista o que será afetado
- Para excluir, exige digitar **EXCLUIR** (confirmação)

## Troubleshooting rápido
- Valores 3108.00 virando 310800.00 → correção de parsing numérico (ponto decimal vs milhar).
- Competência “não bate” com mês filtrado → fechamento por **Emissão**; competência do XML pode vir divergente.
