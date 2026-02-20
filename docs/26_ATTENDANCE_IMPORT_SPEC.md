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
- Suporte a arquivo com **BOM** (caractere invisível no início)
- Separador: autodetect no cabeçalho (`;` / `,` / TAB)

### 1.2 Cabeçalho esperado (flexível)
Aceita variações e sinônimos (ex.: `DATAHORA`, `DATA/HORA`).

Campos principais:
- `ID`
- `DATA` + `HORA` **OU** `DATAHORA`/`DATA/HORA` (coluna única)

Campos opcionais:
- `STATUS`, `NOME`, `PROFISSIONAL`, `SERVIÇOS`, `LOCAL`, `TELEFONE`

### 1.3 Colunas obrigatórias
- `ID`
- **OU** `DATA` + `HORA`
- **OU** `DATAHORA` / `DATA/HORA` (coluna única)

### 1.4 Colunas opcionais
- `NOME`
- `PROFISSIONAL`
- `SERVIÇOS`
- `LOCAL`
- `STATUS` → se ausente/vazio, usa o **Status padrão** selecionado no Admin
- `TELEFONE` → opcional (fallback); recomendado quando o relatório não tem vínculo pronto

---

## 2) Normalização

Cada linha vira um registro normalizado com:
- `patientId` (string) ← coluna `ID`
- `isoDate` (string `YYYY-MM-DD`) ← data real da sessão
- `time` (string `HH:mm`) ← hora (quando existir)
- `status` ∈ `{present, absent}` ← `STATUS` (ou fallback)

### 2.1 Mapeamento de status
Aceita variações comuns:
- presença: `presença`, `presente`, `compareceu`, `ok`, `1`, `true`
- falta: `falta`, `faltou`, `não`, `0`, `false`

Quando `STATUS` vier preenchido mas não reconhecido:
- continua importando
- gera **warning** e usa status padrão

---

## 3) Validação

### 3.1 Erros (bloqueiam a linha)
- `missing_id`
- `invalid_date`
- `invalid_time`
- `duplicate_in_file`

### 3.2 Avisos (não bloqueiam)
- campos vazios (`NOME`, `PROFISSIONAL`, `SERVIÇOS`, `LOCAL`)
- `unknown_status`
- `no_phone_for_patient` → impacta follow-ups

---

## 4) Resolução do telefone (server-side)

O import usa **Admin SDK** e tenta enriquecer cada linha com telefone:
- Prioridade 1: `users.phoneCanonical` (por vínculo do `ID`)
- Fallback: `TELEFONE` do CSV (quando válido)

Campos auxiliares (para auditoria e segurança de follow-up):
- `phoneSource`: `profile|csv|null`
- `isLinked`: boolean
- `linkedUserId`: uid (quando resolve com segurança)

Observação clínica/operacional:
- telefone pode ser compartilhado (responsável/família).
- se não houver `phoneCanonical`, o log **ainda é importado** para constância, mas follow-ups ficam bloqueados.

---

## 5) Deduplicação e docId

DocId determinístico:
```
{patientId}_{isoDate}_{HHmm}_{profSlug}
```

- `HHmm` = `time` sem `:` (fallback: `0000`)
- `profSlug` = slug curto derivado de `PROFISSIONAL` (fallback: `prof`)

> Reimportar o mesmo arquivo não duplica: o docId garante merge.

---

## 6) Escrita no Firestore

Coleção alvo:
- `attendance_logs/{docId}`

Campos gravados (mínimo):
- `patientId`, `isoDate`, `status`, `source`, `createdAt`, `updatedAt`

Campos quando disponíveis:
- `phoneCanonical`, `phoneSource`, `isLinked`, `linkedUserId`
- `time`, `name`, `profissional`, `service`, `location`

Resumo operacional (quando `dryRun=false`):
- grava em `history` um `attendance_import_summary` (sem PII)

---

## 7) DryRun (auditoria antes de gravar)

Endpoint:
- `POST /api/admin/attendance/import`

Quando `dryRun=true`, retorna:
- contagens e amostras
- preview normalizado (exportável)

> Privacidade: telefone no preview/export deve vir mascarado quando possível.

---

## 8) UX no Admin (Presença/Faltas)

Fluxo:
1) Upload CSV
2) Verificar (dryRun)
3) Revisar erros/avisos
4) Exportar inconsistências/preview
5) Importar

Critério de segurança operacional:
- Importar só habilita se o upload atual foi validado (hash/validação).

---

## 9) Critérios de sucesso (produto)

- Import previsível.
- Auditoria antes de gravar.
- Follow-ups reforçam constância sem moralismo.
- Bloqueios aparecem com motivo (nunca “sumiu”).
