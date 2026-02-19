# Changelog — Lembrete Psi (até 2026-02-18)

## Até 2026-02-16 (resumo)
- Follow-ups de constância (presença/falta) com idempotência.
- Agenda do paciente 100% server-side (`GET /api/patient/appointments`) + rules `appointments` admin-only.
- Confirmação de presença: `GET /api/attendance/confirmed` (alias `confirmd`).
- Psicoeducação passiva no painel do paciente (mantra + cards).
- Endpoint opcional de cron (`/api/cron/reminders`) documentado, mas não habilitado.

---

## 2026-02-18 — Hardening de segurança (pós-v1)

- **RBAC paciente estrito**: `requirePatient()` aplicado em rotas do paciente (nega se `role` ausente/incorreta; fallback seguro via `users/{uid}.role`).
- **Integridade da confirmação**: `POST /api/attendance/confirm` não aceita mais `phone` do client; deriva do `users/{uid}`.
- **`/api/appointments/last-sync` admin-only** (reduz vazamento de metadados).
- **Endpoints legados `_push_old/*` desativados** (410 dev / 404 prod).
- **Rate limit global (Firestore)** em rotas críticas (`/api/auth`, `/api/patient/pair`, `/api/attendance/confirm`, push) + TTL recomendado para `_rate_limits.expireAt`.

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

---

## 2026-02-18 — Entregas

### A) Segurança v1 (produção-ready)
- Login paciente por e-mail **desativado por padrão**; vínculo por **telefone + código** (single-use por dispositivo).
- Admin via **custom claims** (sem fallback por `users.role`).
- Firestore rules endurecidas: `users` (sem editar identidade/role), `audit_logs/subscribers` admin-only, `patient_notes` com `patientId` travado.
- Remoção do botão DEV “Trocar paciente”.
- Hardening: headers + **CSP ENFORCE em produção**, rate limit, erros seguros, origin guard padronizado.
- Retenção: `expireAt` + **TTL configurado** em `history` e `audit_logs`.

### B) Biblioteca (Paciente + Admin)
- Paciente: menu **Biblioteca** com modal rolável e fechável (X/Fechar/ESC), busca, mantra fixo e “Para levar para a sessão”.
- Admin: repositório de artigos (CRUD) com status (rascunho/publicado).
- Categorias: CRUD + ativar/desativar/ordenar + criação inline no editor do artigo.



---

## 2026-02-19 — Presença/Faltas (robustez + segurança)

- **Import CSV mais tolerante**:
  - separador autodetectado (`;`/`,`/TAB) + suporte a CSV com **BOM**
  - `NOME/PROFISSIONAL/SERVIÇOS/LOCAL` são **opcionais** (warnings, não bloqueiam)
  - suporte a **DATA/HORA** em coluna única (além de DATA + HORA)
  - coluna **TELEFONE** opcional como fallback; grava `phoneSource/isLinked/linkedUserId` quando possível
- **Painel de constância**: `GET /api/admin/attendance/summary` passa a usar **`isoDate`** (data real da sessão) para o período.
- **Follow-ups mais seguros**: `POST /api/admin/attendance/send-followups` bloqueia envio quando
  - paciente não está vinculado (`unlinked_patient`)
  - telefone é ambíguo sem vínculo (`ambiguous_phone`)
  - conflito entre telefone do log e do perfil (`phone_mismatch`)
- **UI (Admin → Follow-ups)**: resumo exibe contadores dos novos bloqueios + rótulos legíveis + card de orientação clínica/segurança.
