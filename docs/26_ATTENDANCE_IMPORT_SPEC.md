# 26_ATTENDANCE_IMPORT_SPEC

Especificação do import de **Presença/Faltas** (planilha/relatório) para alimentar:
- painel de constância (7/30/90 dias)
- disparos futuros (parabenizar presença / orientar em caso de falta)

> Objetivo clínico: transformar dado operacional em suporte de vínculo.  
> A terapia não se sustenta em “uma boa sessão”, mas na **continuidade**.

---

## 1) Entrada (planilha)

### 1.1 Formato aceito
- CSV (recomendado)
- Separador: `,` (padrão) ou `;` (e, em alguns relatórios, `TAB`)

### 1.2 Cabeçalho (exemplo mais comum)
```
ID, NOME, DATA, HORA, PROFISSIONAL, SERVIÇOS, LOCAL, STATUS
```

Notas:
- No **Modo Automático**, o sistema tenta reconhecer sinônimos comuns de cabeçalho.
- No **Modo Mapeado** (relatório alternativo / 2ª planilha), o Admin seleciona quais colunas representam cada campo.

### 1.3 Colunas obrigatórias
- `ID` → **ID do paciente no sistema externo** (não é ID da sessão)
- `DATA` + `HORA`  
  - `DATA` → `DD/MM/AAAA` ou `YYYY-MM-DD`
  - `HORA` → `HH:mm`
**ou**
- `DATA/HORA` (coluna única)  
  - Ex.: `18/02/2026 14:00`, `2026-02-18 14:00`, `2026-02-18T14:00`

### 1.4 Colunas opcionais
- `NOME`
- `PROFISSIONAL`
- `SERVIÇOS`
- `LOCAL`
- `STATUS` → se ausente/vazio, usa o **Status padrão** selecionado no Admin

Observação:
- Se alguma coluna opcional **não existir no cabeçalho**, o import segue normalmente e gera **um aviso no cabeçalho** (sem warnings repetidos por linha).

### 1.5 Relatórios alternativos (2ª planilha) — Modo Mapeado
Quando o relatório vier com cabeçalhos “fora do padrão”, o Admin pode usar:
- **Modo:** `mapped`
- **columnMap:** objeto com o nome exato das colunas do CSV

Exemplo:
```json
{
  "reportMode": "mapped",
  "columnMap": {
    "id": "Código",
    "datetime": "Início",
    "status": "Compareceu",
    "name": "Paciente"
  }
}
```

Campos possíveis no `columnMap`:
- `id` (obrigatório)
- `date`, `time` (alternativa ao `datetime`)
- `datetime` (alternativa a `date+time`)
- `status`, `name`, `profissional`, `service`, `location` (opcionais)

---

## 2) Normalização

Cada linha vira um registro normalizado com:
- `patientId` (string) ← `ID`
- `isoDate` (string `YYYY-MM-DD`) ← `DATA` (ou parte data de `DATA/HORA`)
- `time` (string `HH:mm`) ← `HORA` (ou parte hora de `DATA/HORA`)
- `status` ∈ `{present, absent}` ← `STATUS` (ou fallback)

### 2.1 Mapeamento de status
Aceita variações comuns:
- `presença`, `presente`, `compareceu`, `ok`, `sim`, `1`, `true` → `present`
- `falta`, `faltou`, `não`, `0`, `false`, `no_show` → `absent`

Quando `STATUS` vier preenchido mas não reconhecido:
- continua importando
- gera **warning** (“STATUS não reconhecido, usando status padrão”)

---

## 3) Validação

### 3.1 Erros (bloqueiam a linha)
- `missing_id` → `ID` vazio
- `invalid_date` → data inválida (em `DATA` ou em `DATA/HORA`)
- `invalid_time` → hora inválida (em `HORA` ou em `DATA/HORA`)
- `duplicate_in_file` → linha duplicada no mesmo upload (mesma chave lógica)

### 3.2 Avisos (não bloqueiam)
- campos vazios (`NOME`, `PROFISSIONAL`, `SERVIÇOS`, `LOCAL`) — quando a coluna existir
- `unknown_status` → status não reconhecido
- `no_phone_for_patient` → paciente sem `phoneCanonical` resolvido (impacta follow-ups)

---

## 4) Resolução do telefone (server-side)

O import é feito via **Admin SDK** (server-side) e tenta enriquecer cada linha com telefone:
- Busca em `users` por `patientExternalId == ID` (fallback: `patientId == ID`)
- Usa `users.phoneCanonical` (fallback: `users.phone`)

Observação clínica/operacional:
- o telefone normalmente é do **responsável** e pode ser compartilhado.
- se não houver `phoneCanonical`, o log **ainda é importado** para constância, mas follow-ups ficam bloqueados.

---

## 5) Deduplicação e docId

Para permitir múltiplas sessões por paciente e evitar colisões, o docId do log segue:
```
{patientId}_{isoDate}_{HHmm}_{slug}
```

- `HHmm` = `time` sem `:`
- `slug` = slug curto derivado de `PROFISSIONAL` (fallback: `SERVIÇOS` → `LOCAL` → `x`)

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
- `importMode` (`auto|mapped`)
- `source` (string)
- `createdAt` / `updatedAt` (timestamp)

### 6.3 Log operacional
Quando `dryRun=false`, salva um resumo em `history`:
- `type: attendance_import_summary`
- `count`, `skipped`, `source`, `sampleErrors[]`

---

## 7) API (DryRun e Commit)

Endpoint:
- `POST /api/admin/attendance/import`

Payload:
- `csvText` (string, obrigatório)
- `source` (string, opcional)
- `defaultStatus` (string, opcional)
- `reportMode` = `auto` | `mapped` (opcional; padrão `auto`)
- `columnMap` (objeto, opcional; só usado quando `reportMode=mapped`)
- `dryRun` (boolean)

Quando `dryRun=true`, retorna:
- contagens (`candidates`, `wouldImport`, `skipped`, `skippedDuplicateInFile`, `warned`, `warnedNoPhone`)
- `errors[]` e `warnings[]` (limitados)
- `sample[]` (até 10 linhas)
- `normalizedRows[]` → preview normalizado **para export** (até 5000 linhas)
- `normalizedRowsTruncated: true|false`
- `reportMode`

> Privacidade: telefone do preview/export é retornado mascarado quando disponível.

---

## 8) UX no Admin (Presença/Faltas)

Fluxo:
1) **Fonte / Status padrão**
2) **Modo**:
   - Automático (recomendado)
   - Mapear colunas (2ª planilha/relatório)
3) **Upload do CSV**
4) Se “Mapear colunas”: ajustar **mapeamento** (opcional “Auto-preencher”)
5) **Verificar** (dryRun)
6) Revisar resumo + erros/avisos
7) Exportar:
   - **Baixar inconsistências (CSV)**
   - **Baixar preview normalizado (CSV)**
8) **Importar** (grava no Firestore)
9) **Limpar**

Critério de segurança operacional:
- **Importar** só fica habilitado se o upload atual foi **validado** (hash de validação).

---

## 9) Critérios de sucesso (produto)

- Import é simples e previsível.
- Admin consegue auditar o que será gravado antes de gravar.
- Relatórios alternativos não travam a operação (mapeamento resolve).
- Mensagens futuras reforçam:
  - Presença: “continuidade é cuidado”
  - Falta: “retomar é parte do cuidado” (sem julgamento)
- Qualquer bloqueio aparece com **motivo** (nunca “sumiu”).
