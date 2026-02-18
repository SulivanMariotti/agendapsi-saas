# Backlog (lista viva — atualizado em 2026-02-18)

> Marque com [x] quando concluir.

## 0) Prioridade clínica
- O sistema existe para sustentar **constância**.
- Sem atalhos no painel do paciente para **cancelar/remarcar**.

---

## 1) Operação / Auditoria (Admin)
- [x] Checklist operacional diário + runbook (docs/27_*)
- [x] Card **Operação do Dia** (progresso, contadores, CHECK, trava de envio)
- [x] CSV de diagnóstico (seleção atual)
- [x] Copiar resumo do dia + registro diário + auditoria (14 dias)
- [x] **Falha-segura** (detector + instrução objetiva)
- [ ] Auditoria por **batchId** do envio (opcional): rastrear lote do dia (enviados/bloqueados) para auditoria “sem dúvida”.

## 2) Admin — Manual de Uso
- [x] Menu **Manual de Uso** (Agenda + Presença/Faltas)
- [x] Atalhos “Ver no Manual” dentro de Agenda e Presença/Faltas

## 3) UX (Paciente) — psicoeducação e compromisso
- [ ] **Menu Artigos/Biblioteca** (artigos mais completos)
  - mantra fixo: “Leitura não substitui sessão. A mudança acontece na continuidade.”
  - seção “Para levar para a sessão”
  - sem CTA cancelar/remarcar
- [x] Mantra fixo + cards rotativos de reflexão
- [x] Estado de notificações: “Ativas neste aparelho” + instruções quando inativas

## 4) Presença/Faltas (Admin)
- [x] Importar planilha de presença/faltas
- [x] Follow-ups com idempotência (anti-spam): `attendance_logs.followup.sentAt`
- [ ] Melhorar painel de constância (métricas + insights) com ênfase clínica (sem moralismo)

## 5) Segurança / Acesso
- [x] Agenda do paciente server-side (`GET /api/patient/appointments`) + rules `appointments` admin-only

### 5.1) Segurança para produção (bloqueadores)
> Ordem: do **mais crítico/baixo score** → para o **menos crítico/alto score**.

- [x] **Bloquear login do paciente por e-mail sem verificação** (inseguro) — usar vinculação por telefone+código
- [x] **Impedir escalonamento para admin** via `users/{uid}.role` (rules + remoção de fallback em `requireAdmin`)
- [x] **Travar identidade do paciente** no `users/{uid}` (paciente só atualiza `lastSeen` + aceite de contrato)
- [x] **Travar `patient_notes.patientId`** no update (paciente não consegue trocar dono da nota)
- [x] **Remover recurso DEV "Trocar paciente"** do painel do paciente
- [x] **Hardening de headers** (CSP/HSTS/X-Frame-Options/etc.) no Next.js
  - [x] CSP **ENFORCE em produção** (Report-Only apenas em dev)
- [x] **Rate limit** em endpoints de autenticação (admin/paciente) + erros sem vazamento de detalhes
- [x] **Política de logs/retenção** (PII em history/audit) + acesso somente admin (TTL/cron + mascaramento)
  - [x] TTL habilitado no Firestore: policies `history.expireAt` e `audit_logs.expireAt`

- [x] **Cron secret (header-only em produção)**: Authorization/x-cron-secret + rotação via `CRON_SECRETS`; `?key=` só com `ALLOW_CRON_QUERY_KEY=true` (transição)

- [ ] **Futuro (antes de PWA/App):** OTP/magic link para paciente (sem fricção e com segurança)

## 6) Dados / Consistência (Firestore)
- [ ] Documentar modelo NoSQL Firestore (sem joins), estratégia de denormalização e chave única (ex.: patientId + phone canônico)
- [ ] Deduplicar `users` por email/phoneCanonical; normalizar telefone no `users/{uid}`

## 7) Futuro (pós “100% OK”): SaaS / Revenda
- [ ] Multi-tenant por clínica (`tenantId` em tudo) + isolamento de dados
- [ ] Custom claims/roles por tenant
- [ ] Onboarding (criar tenant + admin) + billing (planos/limites)
- [ ] Conteúdos (Artigos/Biblioteca) e templates/configs **por tenant** (por clínica)

### Segurança — Operacional
- [x] Adicionar `.gitignore` + `.env.example`.
- [x] Adicionar `npm run security:check` para bloquear compartilhamento acidental de `.env*`/chaves.


### Segurança (status)
- [x] Origin/CSRF padronizado em rotas sensíveis (helper `originGuard`).
