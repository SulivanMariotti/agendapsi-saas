# Backlog (lista viva — atualizado em 2026-02-17)

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
- [ ] **Futuro:** reintroduzir autenticação/login seguro do paciente (magic link/OTP) + hardening geral antes de PWA/App

## 6) Dados / Consistência (Firestore)
- [ ] Documentar modelo NoSQL Firestore (sem joins), estratégia de denormalização e chave única (ex.: patientId + phone canônico)
- [ ] Deduplicar `users` por email/phoneCanonical; normalizar telefone no `users/{uid}`

## 7) Futuro (pós “100% OK”): SaaS / Revenda
- [ ] Multi-tenant por clínica (`tenantId` em tudo) + isolamento de dados
- [ ] Custom claims/roles por tenant
- [ ] Onboarding (criar tenant + admin) + billing (planos/limites)
- [ ] Conteúdos (Artigos/Biblioteca) e templates/configs **por tenant** (por clínica)
