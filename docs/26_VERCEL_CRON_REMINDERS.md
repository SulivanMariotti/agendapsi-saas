# 26 — Cron de Lembretes (48h/24h/12h) — Automático

## Objetivo clínico
O lembrete automático reduz faltas por esquecimento e sustenta a **constância** (a terapia acontece na continuidade).

## O que este passo adiciona
- Endpoint protegido: `GET /api/cron/reminders`

O cron:
- Busca sessões futuras (janela ~48h + tolerância)
- Determina o slot correto (**48h/24h/12h**) pela proximidade
- **NÃO duplica** (usa `appointments/{id}.reminders.slotX.sentAt` como idempotência)

---

## 1) Configurar o segredo do cron (CRON_SECRET)
### 1.1 Local (Windows)
1. Abra o arquivo `.env.local`
2. Adicione uma linha:
   - `CRON_SECRET=uma_chave_grande_aleatoria`

Sugestão: use um valor longo (32+ caracteres) com letras/números.

### 1.2 Vercel (Production)
1. Vá em **Vercel Dashboard** → seu projeto `agenda.msgflow.app.br`
2. Clique em **Settings** → **Environment Variables**
3. Adicione:
   - **Key**: `CRON_SECRET`
   - **Value**: (mesmo valor do `.env.local`)
   - **Environment**: marque **Production** (e opcionalmente Preview/Development)
4. Clique em **Save**

> Importante: o cron só funciona se `CRON_SECRET` existir no ambiente.

---

## 2) Agendar no Vercel (recomendado)
O jeito mais simples (sem colocar segredo no repositório) é criar o Cron pelo dashboard.

1. Vá em **Vercel Dashboard** → seu projeto
2. Abra **Cron Jobs** (ou **Settings → Cron Jobs**, dependendo do layout)
3. Clique em **Add Cron Job**
4. Configure:
   - **Schedule (cron)**: `0 * * * *` (1x por hora)
   - **Path**: `/api/cron/reminders?key=SEU_CRON_SECRET`

> Observação: aqui o segredo fica salvo no Vercel (não no Git).

---

## 3) Teste manual (sem enviar)
O endpoint aceita **dry run**:

- `GET /api/cron/reminders?dryRun=1&key=SEU_CRON_SECRET`

Retorna contadores (candidatos, tokens ausentes, inativos, etc.) e **não envia**.

---

## 4) Teste manual (enviar de verdade)
- `GET /api/cron/reminders?key=SEU_CRON_SECRET`

Após executar:
1. Verifique coleção `history` no Firestore:
   - `type = "cron_reminders_send_summary"`
2. Verifique em `appointments/{id}.reminders.slotX.sentAt` se marcou o slot.

---

## 5) Ajuste fino (se quiser)
Se você preferir **mais precisão** (ex.: rodar de 30 em 30 min), use:
- `*/30 * * * *`

Se preferir menos execução (ex.: 6x/dia), use horários fixos.

---

## 6) Observações clínicas (mensagem)
- Não há CTA de cancelar/remarcar.
- O conteúdo segue a lógica do produto: **espaço reservado** + reforço de compromisso.
- O texto vem de `config/global` (MSG1/MSG2/MSG3 ou msg48h/msg24h/msg12h).
