# Lembrete Psi — Handoff para novo chat (2026-02-17)

Este pack serve para iniciar um novo chat e continuar o desenvolvimento **de onde paramos**, sem perder decisões clínicas/técnicas.

---

## Contexto do projeto
- App: **Lembrete Psi**
- Stack: **Next.js (App Router) + Firebase (Firestore/FCM + Admin SDK + Web Push)**
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

- Operação reforçada com **Runbook/Checklist/Log**: `docs/27_*`
- Admin tem o card **Operação do Dia** (progresso, contadores, CSV diagnóstico, copiar resumo, registro diário, auditoria 14 dias, falha-segura).

> Não há Cron Jobs configurados na Vercel. O endpoint de cron é **opcional** e não está em uso.

### Segurança (decisão importante)
- Paciente **não lê** `appointments/*` via Firestore client.
- Agenda do paciente é carregada via:
  - `GET /api/patient/appointments` (Admin SDK)
- Firestore Rules: `appointments/*` é **admin-only**.

---

## Principais entregas (até 2026-02-17)

1) **Operação manual blindada (redução de erro humano)**
   - Falha-segura + CHECK + trava de envio sem preview confiável
   - Auditoria (registro do dia + histórico 14 dias)
   - CSV diagnóstico + copiar resumo do dia

2) **Manual de Uso no Admin**
   - Menu “Manual de Uso” no painel admin (Agenda + Presença/Faltas)
   - Atalhos contextuais “Ver no Manual”
   - Doc canônico: `docs/73_ADMIN_MANUAL_DE_USO.md`

3) **Constância (presença/falta) com anti-spam**
   - `POST /api/admin/attendance/send-followups`
   - Idempotência: se `attendance_logs/{id}.followup.sentAt` existe → não reenviar.

4) **Confirmar presença**
   - `GET /api/attendance/confirmed` retorna `appointmentIds[]`
   - `confirmd` mantido como alias.

5) **Psicoeducação no painel do paciente**
   - mantra + cards rotativos
   - sem CTA cancelar/remarcar (WhatsApp somente confirmação)

---

## Próximo item de produto (planejado)
**Menu “Artigos/Biblioteca” no painel do paciente**
- psicoeducação mais completa (artigos)
- seção “Para levar para a sessão”
- mantra fixo “leitura não substitui sessão”
- conteúdo/temas pensados para reforçar constância.

---

## Docs canônicos para retomar rápido
- `docs/00_ONDE_PARAMOS.md`
- `docs/00_PROMPT_NOVO_CHAT.md`
- `docs/02_CHANGELOG.md`
- `docs/27_OPERATIONS_RUNBOOK.md`
- `docs/73_ADMIN_MANUAL_DE_USO.md`
