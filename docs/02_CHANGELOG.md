# Changelog — Lembrete Psi (até 2026-02-16)

## Até 2026-02-15 (resumo)
- Histórico (Campanhas): normalização de `reminderType/reminderTypes`.
- Reconciliação do upload da agenda por **janela** (sessões futuras que somem do upload → `cancelled/missing_in_upload`).
- Placeholders PT/EN (`{nome}`/`{{nome}}`, etc.) garantidos no preview e no envio.
- Correção de push duplicado (Service Worker não duplica quando existir `payload.notification`).
- Script de limpeza: `scripts/purgeAttendanceLogs.cjs`.

---

## 2026-02-16 — Entregas

### A) Follow-ups de constância (presença/falta) com idempotência
- Endpoint: `POST /api/admin/attendance/send-followups`
- Anti-spam:
  - se `attendance_logs/{id}.followup.sentAt` existe → bloqueia reenviar (`already_sent`).
- DryRun aprimorado: amostra inclui bloqueios (já enviado, sem token, inativo).
- Telemetria no log:
  - `attendance_logs/{id}.followup.lastAttemptAt`, `lastResult`, `lastError`, `status`, `sentAt`.

### B) Agenda do paciente 100% server-side (fim de permission-denied)
- Novo endpoint: `GET /api/patient/appointments` (Admin SDK).
- Hook do paciente migrou para `fetch`.
- Firestore Rules:
  - `appointments/*` virou **admin-only**.

### C) Confirmar presença (status coerente)
- `GET /api/attendance/confirmed` retorna `appointmentIds[]`.
- `GET /api/attendance/confirmd` mantido como alias.

### D) Psicoeducação passiva + copy clínica (sem cancelamento)
- Painel do paciente: mantra + cards rotativos.
- Copy do WhatsApp: apenas confirmação (sem facilitar remarcação/cancelamento).

### E) Endpoint de cron (opcional, não habilitado)
- `GET /api/cron/reminders` (protegido por `CRON_SECRET`).
- Documentação: `docs/26_VERCEL_CRON_REMINDERS.md`.
- Decisão operacional atual: **envios manuais**.

