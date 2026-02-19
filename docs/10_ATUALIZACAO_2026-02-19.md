# Atualização — 2026-02-19

## O que foi fechado hoje

### 1) Constância (Admin) — Insights clínicos (sem moralismo)
- Aba **Presença/Faltas** ganhou:
  - Card de **Sinal geral** (heurística por taxa/volume)
  - Mini-visão de **últimos 14 dias** (volume + presença/falta por dia)
  - **Cobertura do período** (dias com/sem dados)
  - Tabela **Atenção clínica** (sequência de faltas, última sessão, taxa)

### 2) Correção de métrica (backend)
- `GET /api/admin/attendance/summary` passa a calcular a janela por **data da sessão** (`isoDate`),
  evitando distorção quando o import é feito dias depois.
- Endpoint retorna também:
  - `byDay[]`, `daysWithData`, `daysWithoutData`
  - `attention[]` (heurística por paciente)

### 3) Import mais tolerante (alinhado com a SPEC)
- `POST /api/admin/attendance/import`:
  - exige apenas **ID/DATA/HORA**
  - NOME/PROFISSIONAL/SERVIÇOS/LOCAL/STATUS são **opcionais**
  - quando faltar coluna opcional, gera **aviso no cabeçalho** (sem warnings repetidos por linha)
  - adicionados sinônimos comuns de cabeçalho para suportar relatórios alternativos

## Próximo foco
- Ingestão da **segunda planilha/relatório** (mapear cabeçalhos reais) + validações específicas.
