# 26 — Cron de Lembretes (48h/24h/12h) — Opcional

## Objetivo clínico
Automatizar lembretes reduz faltas por esquecimento e sustenta **constância**.

⚠️ **Importante:** este recurso é **opcional**.
- Se você prefere operar manualmente (Admin → Agenda → Preview → Enviar), **não crie Cron Jobs**.
- O endpoint não roda sozinho.

---

## O que existe no projeto
- Endpoint protegido: `GET /api/cron/reminders`
- Proteção por segredo (`CRON_SECRET`):
  - Header: `x-cron-secret: <valor>`
  - OU Query: `?key=<valor>`

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

## 2) Configurar o segredo (CRON_SECRET)

### 2.1 Local (Windows)
1. Abra `.env.local`
2. Adicione:
   - `CRON_SECRET=uma_chave_grande_aleatoria`

### 2.2 Vercel (Production)
1. Vercel Dashboard → Project
2. Settings → Environment Variables
3. Adicione `CRON_SECRET` (Production)

---

## 3) Testar sem enviar (dryRun)

Abra:
- `GET /api/cron/reminders?dryRun=1&key=SEU_CRON_SECRET`

Retorna contadores (candidatos elegíveis, etc.) e **não envia**.

---

## 4) Testar enviando de verdade

Abra:
- `GET /api/cron/reminders?key=SEU_CRON_SECRET`

Depois verifique:
- `appointments/{id}.reminders.slotX.sentAt` gravado

---

## 5) Criar Cron Job na Vercel (se decidir automatizar)

1. Vercel Dashboard → seu Project
2. Menu → **Cron Jobs**
3. **Create / Add Cron Job**
4. Configure:
   - Schedule: `*/15 * * * *` (a cada 15 min — robusto)
   - URL/Path: `/api/cron/reminders?key=SEU_CRON_SECRET`

> Alguns layouts chamam de “URL” em vez de “Path”.

---

## 6) Observações clínicas
- Sem CTA de cancelar/remarcar.
- Conteúdo vem de `config/global` (MSG1/MSG2/MSG3 e/ou msg48h/msg24h/msg12h).
- Automação é para **proteger constância**, não para “cobrar”.

