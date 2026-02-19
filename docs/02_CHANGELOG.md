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

## 2026-02-19 — Constância 30d + Import mais tolerante

- **Correção de métrica:** `/api/admin/attendance/summary` agora computa a janela por **data da sessão** (`isoDate`),
  evitando distorção quando o admin importa dias depois.
- **Série por dia:** endpoint retorna `byDay[]` (últimos N dias), `daysWithData` e `daysWithoutData`.
- **Atenção clínica (heurística):** endpoint retorna `attention[]` (sequência de faltas, última sessão, taxa) para apoiar cuidado ativo.
- **Import alinhado com SPEC:** `/api/admin/attendance/import` exige apenas **ID/DATA/HORA**; demais colunas são opcionais
  e geram aviso no cabeçalho (sem warnings repetidos por linha quando a coluna não existe).
- **UI Admin (Presença/Faltas):** painel ganhou seção “Insights clínicos” + tabela “Atenção clínica (sinais de afastamento)”.



- **Import (2ª planilha/relatório):** suporte a **Modo Mapeado** (`reportMode=mapped`) com `columnMap` para cabeçalhos incomuns.
- **DATA/HORA combinada:** import aceita coluna única de data+hora (ex.: `18/02/2026 14:00`, `2026-02-18T14:00`) como alternativa a DATA+HORA.
- **UI Admin (Import):** seletor de modo + painel de mapeamento com “Auto-preencher” baseado no cabeçalho detectado.


---

## 2026-02-19 — Segurança pós-v1 (schema-lite + anti-abuso IP)

- **Validação de payload (schema-lite):** criado helper `payloadSchema` e aplicado em rotas críticas (reduz payload inesperado e melhora erros 400).
  - Admin: `/api/admin/attendance/import` (limite de tamanho do CSV + validação de campos e `columnMap`).
  - Paciente: `/api/patient/pair` (telefone/código) e `/api/attendance/confirm` (appointmentId/channel).
  - Admin: `/api/admin/reminders/send` (limite de lista + chaves permitidas) e `/api/admin/patient/*` (register/delete/pair-code) com validação de payload.
  - Legado: `/api/send` (envio push antigo) com chaves permitidas + limite de lista.
  - Legado inseguro: `/api/patient-auth` (email) — validação mais forte quando habilitado em ambiente controlado.
- **Anti-abuso por IP:** adicionada dupla proteção (limiter por IP + limiter por usuário/telefone) nas rotas de vinculação e confirmação.
- **Normalização de IP no rate-limit:** melhora robustez em ambientes com proxy/CDN (ex.: `::ffff:` e porta).

---

## 2026-02-19 — Revisão de endpoints (Admin SDK) — bloqueio do login por e-mail do paciente

- **`/api/patient-auth` (email) agora parece inexistente em produção:** retorna **404** quando o endpoint está desativado (padrão), reduzindo descoberta/enumeração.
- **Habilitação explícita para testes/legado:** exige `ENABLE_INSECURE_PATIENT_EMAIL_LOGIN="true"` (server) e `NEXT_PUBLIC_ENABLE_INSECURE_PATIENT_EMAIL_LOGIN="true"` (client).
- **Payload mais estrito:** rejeita chaves desconhecidas (apenas `email`).

---

## 2026-02-19 — Paciente (Admin SDK) — ping/contrato/notas server-side

- **Novo `POST /api/patient/ping`:** atualiza `users/{uid}.lastSeenAt` via Admin SDK (best-effort), reduzindo dependência de writes no client.
- **Novo `POST /api/patient/contract/accept`:** aceita contrato/enquadre via Admin SDK com idempotência por versão.
- **Novo `GET/POST /api/patient/notes` + `DELETE /api/patient/notes/[id]`:** notas (diário rápido) passaram a ser carregadas e gravadas via API,
  evitando `permission-denied` quando rules endurecem.
- **PatientFlow:** removeu `setDoc/updateDoc` do client para lastSeen/contrato; notas migradas para API (`usePatientNotes`).

### Hotfix — 2026-02-19 — Apagar nota (ID via URL fallback)

- **`DELETE /api/patient/notes/[id]`:** adicionada extração de `id` pelo `pathname` como fallback quando `ctx.params` vem vazio/indefinido em alguns ambientes.
