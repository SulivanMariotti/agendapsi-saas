# Lembrete Psi — Onde paramos

> Este arquivo espelha o `docs/00_ONDE_PARAMOS.md` para manter compatibilidade com históricos antigos.

# Onde paramos — Lembrete Psi (2026-02-16)

## Estado atual (validado)

### Operação (modo manual)
- Você opera diariamente pelo Admin:
  1) **Agenda → Carregar Planilha** (janela móvel **hoje → +30 dias**)
  2) **Verificar** → 3) **Sincronizar**
  4) **Gerar Preview do Disparo** (dryRun)
  5) **Enviar lembrete**
- **Não há Cron Jobs configurados** na Vercel (nenhuma automação rodando).

### Diretriz clínica/UX (painel do paciente)
- Produto reforça vínculo e constância.
- **Sem botão/CTA de cancelar/remarcar**.
- WhatsApp, quando exibido: **apenas para confirmação de presença**.

---

## Entregas concluídas nesta rodada

### 1) Follow-ups de constância (presença/falta) com anti-spam (idempotência)
- `POST /api/admin/attendance/send-followups`
  - Se `attendance_logs/{id}.followup.sentAt` existir → **não reenviar** (`blockedReason: already_sent`).
  - DryRun mostra contadores e amostra, incluindo itens bloqueados por “já enviado”.
  - Marca tentativas em `attendance_logs/{id}.followup.*` (diagnóstico e rastreio).

### 2) Agenda do paciente 100% server-side (fim do `permission-denied`)
- Paciente deixou de ler `appointments/*` via Firestore client.
- Painel do paciente carrega via:
  - `GET /api/patient/appointments` (Admin SDK)
- Firestore Rules foram fechadas para:
  - `appointments/*` **read: admin-only**.

### 3) Confirmação de presença (status “confirmado” coerente)
- `GET /api/attendance/confirmed`
  - Retorna `appointmentIds[]` para pintar “confirmado” na agenda.
  - Mantém compatibilidade: aceita `appointmentId` para checar boolean.
- `GET /api/attendance/confirmd` ficou como alias.

### 4) Psicoeducação passiva (painel do paciente)
- Cards rotativos de reflexão + mantra fixo.
- Copy do WhatsApp ajustado: **confirmação**, sem atalho de cancelamento.

### 5) Endpoint opcional de cron (não habilitado)
- Criado `GET /api/cron/reminders` (protegido por `CRON_SECRETS` (compat: `CRON_SECRET`)).
- Documentado em `docs/26_VERCEL_CRON_REMINDERS.md`.
- Decisão operacional atual: **manter envios manuais**.

---

## Próximo passo sugerido (quando retomar)
1) **Operação manual mais blindada**
   - Checklist diário no Admin (import → preview → envio) + verificação rápida de “bloqueados sem token”.
2) **Presença/faltas**
   - Rotina de import (diária ou semanal) + follow-ups com idempotência (já pronto).
3) **Mobile/App (Capacitor)**
   - Retomar apenas com web estável e regras/rotas consolidadas.

