# 26 — Cron de Lembretes (48h/24h/12h) — Opcional

## Objetivo clínico
Automatizar lembretes reduz faltas por esquecimento e sustenta **constância**.

⚠️ **Importante:** este recurso é **opcional**.
- Se você prefere operar manualmente (Admin → Agenda → Preview → Enviar), **não crie Cron Jobs**.
- O endpoint não roda sozinho.

---

## O que existe no projeto
- Endpoint protegido: `GET /api/cron/reminders`

### Proteção por segredo (recomendado)
**Produção: header-only** (evita segredo em URL/logs)
- `Authorization: Bearer <segredo>` **(preferido)**
- ou `x-cron-secret: <segredo>`

### Fallback legado (desativado em produção)
- `?key=<segredo>`
- Só funciona se `ALLOW_CRON_QUERY_KEY=true` (não recomendado; use apenas como transição)

O endpoint:
- busca sessões futuras (janela ~48h + tolerância)
- escolhe o slot (**48h/24h/12h**) pela proximidade
- **não duplica** (usa `appointments/{id}.reminders.slotX.sentAt` como idempotência)

---

## 1) Quando usar (recomendação prática)

Use cron quando:
- você quer que os lembretes saiam mesmo em dias corridos
- o time não quer depender do clique diário

Não use cron quando:
- você quer controle total e já opera manualmente (seu caso atual)

> Mesmo se você decidir usar cron depois, o sistema foi desenhado para **não virar spam** por duplicidade.

---

## 2) Configurar o segredo (CRON_SECRETS)

### 2.1 Local (Windows)
1. Abra `.env.local`
2. Adicione **um segredo forte** (32+ chars, aleatório):
   - `CRON_SECRETS=uma_chave_grande_aleatoria`

> Você pode colocar **mais de um** segredo (separado por vírgula) para rotação:
> `CRON_SECRETS=SEGREDO_ATUAL,SEGREDO_NOVO`

### 2.2 Vercel (Production)
1. Vercel Dashboard → Project
2. Settings → Environment Variables
3. Adicione `CRON_SECRETS` (Production)

> Compatibilidade: `CRON_SECRET` ainda funciona, mas o padrão recomendado agora é `CRON_SECRETS`.

---

## 3) Testar sem enviar (dryRun)

### 3.1 Teste com Authorization (recomendado)
Exemplo (curl):
- `GET /api/cron/reminders?dryRun=1`
- Header: `Authorization: Bearer SEU_SEGREDO`

Retorna contadores (candidatos elegíveis, etc.) e **não envia**.

### 3.2 Teste com x-cron-secret (alternativa)
- Header: `x-cron-secret: SEU_SEGREDO`

---

## 4) Testar enviando de verdade

- `GET /api/cron/reminders`
- Com o header (Authorization ou x-cron-secret)

Depois verifique:
- `appointments/{id}.reminders.slotX.sentAt` gravado

---

## 5) Criar Cron Job na Vercel (se decidir automatizar)

✅ **Preferência:** use um agendador que consiga enviar **headers**.

- Se o seu agendador permitir configurar header, configure:
  - URL/Path: `/api/cron/reminders`
  - Header: `Authorization: Bearer SEU_SEGREDO`

### Se a ferramenta NÃO suportar headers
Use apenas como **transição**:
1. Habilite `ALLOW_CRON_QUERY_KEY=true` (Production)
2. Configure a URL/Path com:
   - `/api/cron/reminders?key=SEU_SEGREDO`

⚠️ **Nota de segurança:** segredo em URL pode aparecer em logs/prints/histórico. Migrar para header-only assim que possível.

---

## 6) Observações clínicas
- Sem CTA de cancelar/remarcar.
- Conteúdo vem de `config/global` (MSG1/MSG2/MSG3 e/ou msg48h/msg24h/msg12h).
- Automação é para **proteger constância**, não para “cobrar”.
