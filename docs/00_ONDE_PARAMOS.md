# Onde paramos — Lembrete Psi (2026-02-18)

## Estado atual (validado)

### Operação (modo manual — recomendado)
Você opera diariamente pelo Admin, no fluxo:

**Admin → Agenda → Carregar Planilha → Verificar → Sincronizar → Gerar Preview do Disparo → Enviar lembrete**

- Janela de upload: **hoje → +30 dias** (rodar também em fim de semana/feriado).
- **Não há Cron Jobs configurados** na Vercel (decisão atual: **modo manual**).

### Diretriz clínica/UX (painel do paciente)
- O painel do paciente existe para **sustentar vínculo e constância**.
- **Sem botão/CTA de cancelar/remarcar**.
- WhatsApp, quando existir: **apenas para confirmação de presença** (nunca como atalho para cancelar/remarcar).
- Psicoeducação passiva: mantra fixo + cards rotativos.

---

## Entregas concluídas nesta rodada (2026-02-18)

### 1) Operação “à prova de dia corrido” (Admin → Agenda)
Documentação e UX de operação manual para reduzir risco humano:
- **Runbook + checklist 1 página + template de registro**: `docs/27_*`
- Card **Operação do Dia** (Admin → Agenda):
  - progresso do pipeline (import → verificar → sincronizar → preview → envio)
  - contadores e bloqueios: `SEM_PUSH`, `INATIVO`, `SEM_TELEFONE`, `ALREADY_SENT`
  - **CHECK** (push não confirmado) com alerta
  - **bloqueio de envio** enquanto houver CHECK (fail-safe)
  - export **CSV de diagnóstico** da seleção atual
  - botão **Copiar resumo do dia** (para registro)
  - **Registro do dia**: salvar + marcar como concluído
  - **Auditoria**: histórico dos últimos 14 dias (salvo/concluído + contadores)
  - **Falha-segura**: detecta inconsistências e mostra instrução objetiva do que fazer

> Norte clínico: falha operacional vira falha de cuidado ativo — e aumenta chance de falta.

### 2) Manual de Uso no Admin (Agenda + Presença/Faltas)
- Novo menu **Manual de Uso** no Admin com:
  - finalidade de cada módulo (Agenda / Presença-Faltas)
  - passo a passo (uso correto)
  - diagnóstico e erros comuns
  - boas práticas (operações que protegem constância)
- Atalhos “**Ver no Manual**” dentro de **Agenda** e **Presença/Faltas** para abrir direto na seção certa.
- Documento canônico: `docs/73_ADMIN_MANUAL_DE_USO.md`

### 3) Decisões técnicas importantes (mantidas)
- **Agenda do paciente é server-side**:
  - painel do paciente consome `GET /api/patient/appointments` (Admin SDK).
  - Firestore Rules: `appointments/*` é **admin-only** (paciente não lê via client).
- **Follow-ups de constância (presença/falta) têm idempotência**:
  - `POST /api/admin/attendance/send-followups` não reenviará se `attendance_logs/{id}.followup.sentAt` já existir.
- **Confirmação de presença**:
  - `GET /api/attendance/confirmed` retorna `appointmentIds[]` para marcar “confirmado”.
  - `confirmd` é alias.
- Existe endpoint opcional `GET /api/cron/reminders` (protegido por `CRON_SECRETS` (compat: `CRON_SECRET`)), mas **não está em uso** (decisão atual: manual).

---

## Próximos itens (backlog imediato)
- **Segurança para produção (bloqueadores)** — concluído nesta rodada:
  - [x] Login paciente por e-mail sem verificação desativado (fluxo principal: telefone+código)
  - [x] RBAC: removido fallback por `users.role` no `requireAdmin` + rules blindadas
  - [x] Identidade do paciente travada no `users/{uid}` (sem editar `phoneCanonical/email/role`)
  - [x] Removido recurso DEV “Trocar paciente”
  - [x] Headers de segurança (HSTS/XFO/nosniff/Referrer/Permissions + CSP report-only)
  - [x] Rate limit em endpoints sensíveis + erros sem vazamento
  - [x] Logs/retencao: PII minimizado + `expireAt` + **TTL habilitado** (`history.expireAt`, `audit_logs.expireAt`)

- **Próximo ajuste de segurança (não-bloqueador, recomendado):** CSP sair de **Report-Only** para **Enforce** (após observar relatórios).
- **Paciente: menu Artigos/Biblioteca** (psicoeducação mais completa + “Para levar para a sessão” + mantra fixo “leitura não substitui sessão”; sem CTA cancelar/remarcar).
- **Dados/Consistência**: documentar modelo NoSQL Firestore (denormalização + chave única paciente).
- **Autenticação do paciente** (mais segura) antes de PWA/App.

> Futuro (quando o sistema estiver 100% OK): **SaaS multi-tenant** para revenda.
