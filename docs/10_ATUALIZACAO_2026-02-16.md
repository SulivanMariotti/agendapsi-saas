# Atualização — 2026-02-16

Resumo do que foi implementado/ajustado nesta rodada para sustentar **constância terapêutica** (cuidado ativo + psicoeducação + responsabilização) sem facilitar cancelamento.

---

## Entregas

1) **Follow-ups presença/falta (anti-spam)**
- Endpoint: `POST /api/admin/attendance/send-followups`
- Idempotência por log: se `attendance_logs/{id}.followup.sentAt` existe → não reenviar.
- DryRun mostra amostras e bloqueios (`already_sent`, `no_token`, `inactive_patient`...).

2) **Agenda do paciente 100% server-side**
- Endpoint: `GET /api/patient/appointments` (Admin SDK)
- Painel do paciente migrou para consumir a API.
- Firestore Rules: `appointments/*` passou a **admin-only**.

3) **Confirmação de presença coerente**
- `GET /api/attendance/confirmed` retorna `appointmentIds[]`.
- `confirmd` mantido como alias.

4) **Psicoeducação no painel do paciente**
- Cards rotativos + mantra fixo.
- Copy do WhatsApp ajustado para **confirmação**, sem CTA de cancelar/remarcar.

5) **Cron opcional (não habilitado)**
- Criado `GET /api/cron/reminders` (protegido por `CRON_SECRET`).
- Documentado em `docs/26_VERCEL_CRON_REMINDERS.md`.
- Decisão operacional atual: **envios manuais**.

---

## Observação operacional
O fluxo diário permanece:
**Admin → Agenda → Carregar Planilha → Verificar → Sincronizar → Preview → Enviar**.

