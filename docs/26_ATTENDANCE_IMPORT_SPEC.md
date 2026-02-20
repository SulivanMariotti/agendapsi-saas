# 26_ATTENDANCE_IMPORT_SPEC

Especificação do import de **Presença/Faltas** (planilha/relatório) para alimentar:
- painel de constância
- disparos futuros (parabenizar presença / orientar em caso de falta)

> Objetivo clínico: transformar dado operacional em suporte de vínculo.
> A terapia não se sustenta em “uma boa sessão”, mas na **continuidade**.

---

## 1) Entrada (planilha)

### 1.1 Formato aceito
- CSV (recomendado)
- Suporte a arquivo com **BOM**
- Separador: autodetect no cabeçalho (`;` / `,` / TAB)

### 1.2 Colunas (flexível)
Campos principais:
- `ID`
- `DATA` + `HORA` **OU** coluna única `DATAHORA`/`DATA/HORA`

Campos opcionais:
- `STATUS`, `NOME`
- `PROFISSIONAL`, `SERVIÇO`, `LOCAL`
- `TELEFONE` (opcional; melhora vínculo operacional)

### 1.3 Modo “Mapeado”
Quando cabeçalhos variam, mapear colunas reais → campos canônicos.

**Compatibilidade**
- servidor aceita `columnMap.dateTime` **ou** `columnMap.datetime`.

**TELEFONE**
- select opcional e normalização para `phoneCanonical`.

---

## 2) Normalização e regras
- `isoDate` é a data real da sessão.
- `status` normalizado para `present|absent|unknown` quando possível.
- Campos opcionais não bloqueiam import.

---

## 3) Saídas
- grava em `attendance_logs/*`
- alimenta summary e follow-ups (com bloqueios de segurança)
