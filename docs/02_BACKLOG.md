# Backlog (lista viva — atualizado em 2026-02-19)

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
- [x] **Menu Artigos/Biblioteca** (paciente)
  - mantra fixo: “Leitura não substitui sessão. A mudança acontece na continuidade.”
  - seção “Para levar para a sessão”
  - busca + categorias
  - modal com rolagem + fechar (X/Fechar/ESC)
  - sem CTA cancelar/remarcar
- [x] **Repositório de artigos (Admin)**: criar/editar/publicar/despublicar/excluir
- [x] **Categorias (Admin)**: CRUD + ativar/desativar/ordenar + criar inline no editor do artigo
- [x] Mantra fixo + cards rotativos de reflexão
- [x] Estado de notificações: “Ativas neste aparelho” + instruções quando inativas

## 4) Presença/Faltas (Admin)
- [x] Importar planilha de presença/faltas
- [x] Robustez do import (BOM + separador autodetect + TELEFONE opcional + DATA/HORA em coluna única + colunas opcionais não bloqueiam)
- [x] Follow-ups com idempotência (anti-spam): `attendance_logs.followup.sentAt`
- [x] Bloqueios de segurança em follow-ups: unlinked_patient / ambiguous_phone (sem vínculo) / phone_mismatch
- [ ] **Melhorar painel de constância (30 dias)**:
  - métricas (presenças/faltas/adiamentos) + tendência
  - insights clínicos (sem moralismo) e reforço de constância
  - filtros por período/profissional/paciente (se aplicável)
- [ ] Processar **segunda planilha/relatório** (presença/faltas) para montar painel de constância e disparar notificações futuras (parabenizar presença e orientar em caso de falta). (Modo mapeado pronto; falta validar com relatório real)

## 5) Segurança / Acesso (v1 concluída)
- [x] Desativar login paciente por e-mail sem verificação (padrão)
- [x] Admin apenas via **custom claims** (sem fallback em `users.role`)
- [x] Firestore rules endurecidas (`users`/`audit_logs`/`subscribers`/`patient_notes`)
- [x] Remover “Trocar paciente” (DEV) do painel do paciente
- [x] Headers de segurança + CSP enforce em produção
- [x] Rate limit + erros seguros nas rotas sensíveis
- [x] Origin/CSRF guard padronizado
- [x] Retenção: `expireAt` + **TTL ativo** em `history` e `audit_logs`
- [x] Cron endpoints endurecidos (header-only + rotação) **(cron ainda não implantado)**
- [x] Schema-lite (payload) em rotas críticas: src/lib/server/payloadSchema.js (allowedKeys + maxBytes)
- [ ] Expandir schema-lite para todas as rotas com escrita + (futuro) schema forte (Zod)
- [ ] **Futuro:** autenticação do paciente com menos fricção e segura (OTP/magic link) antes de PWA/App

## 6) Dados / Consistência (Firestore)
- [ ] Documentar modelo NoSQL Firestore (sem joins), estratégia de denormalização e chave única (ex.: patientId + phone canônico)
- [ ] Deduplicar `users` por email/phoneCanonical; normalizar telefone no `users/{uid}`

## 7) Futuro (pós “100% OK”): SaaS / Revenda
- [ ] Multi-tenant por clínica (`tenantId` em tudo) + isolamento de dados
- [ ] Custom claims/roles por tenant
- [ ] Onboarding (criar tenant + admin) + billing (planos/limites)
- [ ] Conteúdos (Artigos/Biblioteca) e templates/configs **por tenant** (por clínica)
