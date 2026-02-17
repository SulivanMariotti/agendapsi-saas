# Lembrete Psi — Handoff para novo chat (2026-02-16)

Este pack serve para iniciar um novo chat e continuar o desenvolvimento **de onde paramos**, sem perder decisões clínicas/técnicas.

---

## Contexto do projeto
- App: **Lembrete Psi**
- Stack: **Next.js (App Router) + Firebase (Firestore/FCM + Admin SDK)**
- Diretriz clínica/UX (painel do paciente):
  - foco em **lembrar + psicoeducar + responsabilizar**
  - **sem botão/CTA de cancelar/remarcar**
  - WhatsApp (quando existir): **apenas para confirmação de presença**

---

## Onde paramos (estado atual)

### Operação (manual)
Rotina diária (Admin → Agenda):
1) Carregar Planilha (janela **hoje → +30 dias**)
2) Verificar
3) Sincronizar
4) Gerar Preview do Disparo (dryRun)
5) Enviar lembrete

> Não há Cron Jobs configurados na Vercel. O envio automático é **opcional**.

### Segurança (decisão importante)
- Paciente **não lê** `appointments/*` via Firestore client.
- Agenda do paciente é carregada via:
  - `GET /api/patient/appointments` (Admin SDK)
- Firestore Rules: `appointments/*` é **admin-only**.

---

## Principais entregas desta rodada

1) **Follow-ups de constância (presença/falta) com anti-spam**
   - Endpoint: `POST /api/admin/attendance/send-followups`
   - Idempotência por log: se `attendance_logs/{id}.followup.sentAt` existir → não reenviar.
   - DryRun mostra amostras e bloqueios (inclui `already_sent`).

2) **Agenda do paciente server-side (fim de permission-denied)**
   - `src/features/patient/hooks/usePatientAppointments.js` passou a usar `fetch('/api/patient/appointments')`.

3) **Confirmar presença (status coerente)**
   - `GET /api/attendance/confirmed` retorna `appointmentIds[]`.
   - `confirmd` mantido como alias.

4) **Psicoeducação no painel do paciente**
   - Cards rotativos + mantra fixo.
   - Copy do WhatsApp ajustado para confirmação (sem facilitar cancelamento).

5) **Cron opcional de lembretes (não habilitado)**
   - `GET /api/cron/reminders` protegido por `CRON_SECRET`.
   - Documentação: `docs/26_VERCEL_CRON_REMINDERS.md`.

---

## Arquivos alterados (essenciais)
- `src/app/api/admin/attendance/send-followups/route.js`
- `src/components/Admin/AdminAttendanceFollowupsCard.js`
- `src/app/api/patient/appointments/route.js`
- `src/features/patient/hooks/usePatientAppointments.js`
- `firestore.rules`
- `src/app/api/attendance/confirmed/route.js`
- `src/app/api/attendance/confirmd/route.js`
- `src/components/Patient/PatientFlow.js`
- `src/features/patient/components/NextSessionCard.js`
- `src/components/Admin/AdminConfigTab.js`
- `src/app/api/cron/reminders/route.js`

---

## Próximo passo sugerido (quando retomar)
- Consolidar um **checklist operacional diário** dentro do Admin (sem automatizar) para reduzir risco humano (dias corridos).
- Evoluir o painel de constância (presença/faltas) com indicadores e “alertas” (sem moralismo; firmeza + cuidado).

