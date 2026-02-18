# Changelog — Lembrete Psi (até 2026-02-17)

## Até 2026-02-16 (resumo)
- Follow-ups de constância (presença/falta) com idempotência.
- Agenda do paciente 100% server-side (`GET /api/patient/appointments`) + rules `appointments` admin-only.
- Confirmação de presença: `GET /api/attendance/confirmed` (alias `confirmd`).
- Psicoeducação passiva no painel do paciente (mantra + cards).
- Endpoint opcional de cron (`/api/cron/reminders`) documentado, mas não habilitado.

---

## 2026-02-17 — Entregas

### A) Operação manual blindada (Admin → Agenda)
- Runbook operacional + checklist 1 página + template de registro: `docs/27_*`.
- Card **Operação do Dia**:
  - progresso (import/verificar/sincronizar/preview/envio)
  - contadores e bloqueios: `SEM_PUSH`, `INATIVO`, `SEM_TELEFONE`, `ALREADY_SENT`
  - **CHECK** (push não confirmado) + alerta
  - **trava de envio** com CHECK > 0 (fail-safe)
  - export **CSV de diagnóstico**
  - **Copiar resumo do dia**
  - **Registro diário** (salvar + marcar concluído)
  - **Auditoria** (últimos 14 dias)
  - **Falha-segura** (detector + instruções objetivas)

### B) Admin — Manual de Uso (Agenda + Presença/Faltas)
- Novo menu “Manual de Uso” no Admin.
- Conteúdo com finalidade, passo a passo, diagnóstico e boas práticas.
- Atalhos contextuais “Ver no Manual” dentro de Agenda e Presença/Faltas.
- Correção aplicada durante implementação: erro de build `Module not found: Can't resolve './AdminManualTab'` (arquivo faltando).

### C) Documentação consolidada para continuidade
- Atualização de `00_ONDE_PARAMOS.md`, `00_PROMPT_NOVO_CHAT.md`, `01_HANDOFF.md`, `02_BACKLOG.md`, `16_API_ENDPOINTS_CATALOG.md`, `18_TROUBLESHOOTING_COMMON_ERRORS.md` e índice.
