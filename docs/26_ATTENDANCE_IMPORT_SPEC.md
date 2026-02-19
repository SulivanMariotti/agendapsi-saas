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
- Separador: autodetect no cabeçalho (`;` / `,` / TAB)

### 1.2 Cabeçalho esperado
```
ID, (DATA+HORA | DATAHORA), (HORA), (STATUS), (NOME), (PROFISSIONAL), (SERVIÇOS), (LOCAL), (TELEFONE)
```

### 1.3 Colunas obrigatórias
- `ID` → **ID do paciente no sistema externo** (não é ID da sessão)
- **OU** `DATA` + `HORA`
  - `DATA` → `DD/MM/AAAA` ou `YYYY-MM-DD`
  - `HORA` → `HH:mm`
- **OU** `DATAHORA` / `DATA/HORA` (coluna única)
  - formatos aceitos: `DD/MM/AAAA HH:mm` ou `YYYY-MM-DD HH:mm` (também aceita `T` no meio)

### 1.4 Colunas opcionais
- `NOME`
- `PROFISSIONAL`
- `SERVIÇOS`
- `LOCAL`
- `STATUS` → se ausente/vazio, usa o **Status padrão** selecionado no Admin
- `TELEFONE` → opcional (fallback); recomendado no relatório 2 quando não houver vínculo pronto

---

## 2) Normalização

Cada linha vira um registro normalizado com:
- `patientId` (string) ← coluna `ID`
- `isoDate` (string `YYYY-MM-DD`) ← coluna `DATA`
- `time` (string `HH:mm`) ← coluna `HORA`
- `status` ∈ `{present, absent}` ← coluna `STATUS` (ou fallback)

### 2.1 Mapeamento de status
Aceita variações comuns (ex.: `presença`, `presente`, `compareceu`, `ok`, `1`, `true` → `present`; `falta`, `faltou`, `não`, `0`, `false` → `absent`).

Quando `STATUS` vier preenchido mas não reconhecido:
- continua importando
- gera **warning** (“STATUS não reconhecido, usando status padrão”)

---

## 3) Validação

### 3.1 Erros (bloqueiam a linha)
- `missing_id` → `ID` vazio
- `invalid_date` → `DATA` inválida
- `invalid_time` → `HORA` inválida
- `duplicate_in_file` → linha duplicada no mesmo upload (mesma chave lógica)

### 3.2 Avisos (não bloqueiam)
- campos vazios (`NOME`, `PROFISSIONAL`, `SERVIÇOS`, `LOCAL`)
- `unknown_status` → status não reconhecido
- `no_phone_for_patient` → paciente sem `phoneCanonical` resolvido (impacta follow-ups)

---

## 4) Resolução do telefone (server-side)

O import é feito via **Admin SDK** (server-side) e tenta enriquecer cada linha com telefone:
- Prioridade 1: `users.phoneCanonical` (vínculo por ID)
- Fallback: `TELEFONE` do CSV (se presente/valido)
- Busca em `users` por `patientExternalId == ID` (fallback: `patientId == ID`)
- Usa `users.phoneCanonical` (fallback: `users.phone`)

Observação clínica/operacional:
- o telefone normalmente é do **responsável** e pode ser compartilhado.
- se não houver `phoneCanonical`, o log **ainda é importado** para constância, mas follow-ups ficam bloqueados.

---

## 5) Deduplicação e docId

Para permitir múltiplas sessões por paciente e evitar colisões, o docId do log segue:
```
{patientId}_{isoDate}_{HHmm}_{profSlug}
```

- `HHmm` = `time` sem `:`
- `profSlug` = slug curto derivado de `PROFISSIONAL` (fallback: `prof`)

> Reimportar o mesmo arquivo não “duplica”: o `docId` determinístico garante merge.

---

## 6) Escrita no Firestore

### 6.1 Coleção alvo
- `attendance_logs/{docId}`

### 6.2 Campos gravados
- `patientId` (string)
- `phoneCanonical` (string|null)
- `hasPhone` (boolean)
- `name` (string|null)
- `isoDate` (string)
- `time` (string)
- `profissional` (string|null)
- `service` (string|null)
- `location` (string|null)
- `status` (`present|absent`)
- `source` (string)
- `createdAt` / `updatedAt` (timestamp)

### 6.3 Log operacional
Quando `dryRun=false`, salva um resumo em `history`:
- `type: attendance_import_summary`
- `count`, `skipped`, `source`, `sampleErrors[]`

---

## 7) DryRun (auditoria antes de gravar)

Endpoint:
- `POST /api/admin/attendance/import`

Quando `dryRun=true`, retorna:
- contagens (`candidates`, `wouldImport`, `skipped`, `skippedDuplicateInFile`, `warned`, `warnedNoPhone`)
- `errors[]` e `warnings[]` (limitados)
- `sample[]` (até 10 linhas)
- `normalizedRows[]` → preview normalizado **para export** (até 5000 linhas)
- `normalizedRowsTruncated: true|false`

> Privacidade: telefone do preview/export é retornado mascarado quando disponível.

---

## 8) UX no Admin (Presença/Faltas)

Fluxo:
1) **Upload do CSV** (botão “Escolher arquivo”)
2) **Verificar** (dryRun)
3) Revisar resumo + erros/avisos
4) Exportar:
   - **Baixar inconsistências (CSV)**
   - **Baixar preview normalizado (CSV)**
5) **Importar** (grava no Firestore)
6) **Limpar**

Critério de segurança operacional:
- **Importar** só fica habilitado se o upload atual foi **validado** (hash de validação).

---

## 9) Critérios de sucesso (produto)

- Import é simples e previsível.
- Admin consegue auditar o que será gravado antes de gravar.
- Mensagens futuras reforçam:
  - Presença: “continuidade é cuidado”
  - Falta: “retomar é parte do cuidado” (sem julgamento)
- Qualquer bloqueio aparece com **motivo** (nunca “sumiu”).
