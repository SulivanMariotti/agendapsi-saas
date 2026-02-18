# Lembrete Psi

**Propósito:** sustentar vínculo terapêutico e constância (reduzir faltas) com lembretes e psicoeducação.

- Stack: **Next.js 16 (App Router)** + **Firebase (Firestore + Admin SDK + Web Push/FCM)**
- Diretriz clínica/UX (painel do paciente):
  - reforçar compromisso e continuidade
  - **sem botão/CTA de cancelar/remarcar**
  - WhatsApp (quando existir): **apenas para confirmação de presença**

## Rodando localmente

```bash
npm install
npm run dev
```

Acesse: http://localhost:3000

## Operação (modo manual recomendado)

Fluxo diário (Admin → Agenda):
1. **Carregar Planilha** (janela móvel **hoje → +30 dias**)
2. **Verificar**
3. **Sincronizar**
4. **Gerar Preview do Disparo** (dryRun)
5. **Enviar lembrete**

O Admin tem suporte operacional:
- Card **Operação do Dia** (diagnóstico, CHECK, CSV, registro diário, auditoria e falha-segura)
- Menu **Manual de Uso** (Agenda + Presença/Faltas)

## Docs

A documentação do projeto está em `./docs`.

Arquivos mais úteis para operação e continuidade:
- `docs/00_ONDE_PARAMOS.md`
- `docs/00_PROMPT_NOVO_CHAT.md`
- `docs/01_HANDOFF.md`
- `docs/27_OPERATIONS_RUNBOOK.md`
- `docs/73_ADMIN_MANUAL_DE_USO.md`

## Segurança (importante)
- Paciente **não lê** `appointments/*` diretamente no Firestore (client). Agenda do paciente é **server-side**:
  - `GET /api/patient/appointments` (Admin SDK)
- Firestore Rules: `appointments/*` é **admin-only**. Veja `docs/25_FIRESTORE_RULES_GUIDE.md`.

## Cron (opcional)
Existe um endpoint opcional de cron (`/api/cron/reminders`), mas **não roda sozinho**.
Só funciona se você configurar Cron Jobs na Vercel. Veja `docs/26_VERCEL_CRON_REMINDERS.md`.
