# 75_RETENCAO_LOGS_TTL_E_CRON

Objetivo: manter o sistema **mais seguro e enxuto em producao**, evitando que `history` e `audit_logs` virem um deposito infinito de dados.

Principio clinico-etico:
- **coletar o minimo necessario**
- manter logs apenas pelo tempo util para operacao/auditoria

---

## 1) O que mudou no codigo

### 1.1 `history` (colecao)
- Todos os logs passam por um sanitizador server-side:
  - telefone e email sao **mascarados** (ex.: `***1234`, `a***@dominio.com`)
  - `token` bruto nunca e salvo (somente `tokenHash`/`tokenTail` quando existir)
- Todo log novo recebe:
  - `createdAt` (serverTimestamp)
  - `expireAt` (Timestamp futuro)

### 1.2 `audit_logs` (colecao)
- Todo log novo recebe `expireAt` (Timestamp futuro)
- Retencao padrao mais longa por responsabilidade administrativa

---

## 2) Parametros de retencao (ENV)

Defina em producao (Vercel/Cloud Run/etc):

- `HISTORY_RETENTION_DAYS` (padrao: 180)
- `AUDIT_RETENTION_DAYS` (padrao: 365)

Recomendacao inicial:
- `history`: 90 a 180 dias
- `audit_logs`: 180 a 365 dias

---

## 3) Opcao A (recomendada): Firestore TTL automatico

O Firestore tem suporte a TTL (Time-to-Live) por campo Timestamp.

**Campo usado pelo Lembrete Psi:** `expireAt`

Passo a passo no Firebase Console:
1) Firebase Console -> Firestore Database
2) Abra "Time to live (TTL)" (ou "TTL")
3) Habilite TTL
4) Adicione configuracao:
   - Collection group: `history`
   - Field: `expireAt`
5) Repita para:
   - Collection group: `audit_logs`
   - Field: `expireAt`

Observacoes:
- TTL pode demorar para apagar (nao e imediato)
- A aplicacao continua funcionando igual

### 3.1 Requisitos e caminho alternativo (quando a aba TTL nao aparece)

Alguns projetos nao mostram a aba de TTL no Firebase Console. Nesses casos, configure via **Google Cloud Console**.

Requisito:
- O projeto precisa ter **Billing habilitado** (caso contrario, a criacao da policy retorna 403).

Caminho (Google Cloud Console):
1) Selecione o projeto (ex.: `lembrete-psi`)
2) Menu -> Firestore
3) Time to live (TTL)
4) Create policy
   - Collection group: `history`
   - Field: `expireAt`
5) Repita para `audit_logs`.

Status operacional (2026-02-18):
- TTL configurado para `history.expireAt` e `audit_logs.expireAt`.

Nota importante:
- A exclusao pode ocorrer **ate ~24h apos** o horario indicado em `expireAt`.

---

## 4) Opcao B (fallback): Cron de retencao

Existe a rota:
- `GET /api/cron/retention` (header Authorization Bearer)
  - Ex.: `Authorization: Bearer <segredo>`

Ela apaga em lotes:
- docs com `expireAt <= now`
- e tambem tenta limpar docs antigos por `createdAt` (para registros legados sem `expireAt`)

Recomendacao:
- rodar 1x por dia (ex.: 03:00)

Seguranca:
- Produção: header-only (Authorization Bearer ou x-cron-secret).
- Legado: `?key=` só com `ALLOW_CRON_QUERY_KEY=true` (transição; não recomendado).
- usa o mesmo segredo de cron (recomendado: `CRON_SECRETS`)

---

## 5) Nota clinica

Retencao e minimizacao nao sao apenas "LGPD".
Elas sustentam a missao do produto:
- **o foco e a constancia do cuidado**, nao armazenar informacoes alem do necessario.
