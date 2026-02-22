# Backlog (lista viva — atualizado em 2026-02-21)

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
  - [x] `batchId` em Admin Send / Cron / Follow-ups + persistência em `history` e `audit_logs`
  - [x] Histórico: filtro por `batchId` + resumo do lote
  - [ ] Dashboard: card “Últimos lotes (batchId)” + link para Histórico filtrado (deixar para amanhã)

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
- [x] Painel de constância (30 dias) — **fase 1**:
  - `attendance_logs` por `isoDate`
  - `summary` expandido (byDay/cobertura/attention) + filtros + trend/segments
  - UI com filtros e ordenação por prioridade
- [ ] Painel de constância — **fase 2** (clínico):
  - insights de vínculo/constância (sem moralismo)
  - mensagens/trechos de psicoeducação por padrão (cards)
  - validação com dados reais (2ª planilha)
- [x] Processar **segunda planilha/relatório** (presença/faltas) para montar painel de constância e disparar follow-ups (presença/falta) com `dryRun` + idempotência.

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
- [x] Schema-lite (payload) em rotas críticas: `src/lib/server/payloadSchema.js` (allowedKeys + maxBytes)
- [ ] Expandir schema-lite para todas as rotas com escrita + (futuro) schema forte (Zod)
  - [x] Rotas “sem body”: seed/bootstrap/ping/delete note com allowedKeys: []
  - [x] `showKeys` quiet em produção (menos vazamento de detalhes)
- [ ] **Admin Auth forte (PENDÊNCIA ≥ 9/10):** migrar `ADMIN_PASSWORD` → Firebase Auth + MFA/TOTP obrigatório (ou magic link), com migração progressiva e desligamento do legado em produção.
- [ ] **Futuro:** autenticação do paciente com menos fricção e segura (OTP/magic link) antes de PWA/App

## 6) Dados / Consistência (Firestore)
- [x] Documentar modelo NoSQL Firestore (sem joins), estratégia de denormalização e chave única (ex.: `patientId` + `phoneCanonical`) — ver docs/14_MODELO_NOSQL_FIRESTORE_CHAVE_UNICA.md
- [ ] Deduplicar `users` por email/phoneCanonical; normalizar telefone no `users/{uid}`
  - [x] Ferramenta Admin: normalizar `phoneCanonical`
  - [x] Relatório Admin: duplicatas de `phoneCanonical` (por padrão ocultando desativados) + toggle
  - [x] Reativação oficial no Admin (sem recadastro)
  - [ ] Merge/dedup assistido (decidir “registro principal” e consolidar com segurança)

## 7) Futuro (pós “100% OK”): SaaS / Revenda
- [ ] Multi-tenant por clínica (`tenantId` em tudo) + isolamento de dados
- [ ] Custom claims/roles por tenant
- [ ] Onboarding (criar tenant + admin) + billing (planos/limites)
- [ ] Conteúdos (Artigos/Biblioteca) e templates/configs **por tenant** (por clínica)

## 9) Mobile (somente Painel do Paciente)
- [x] Viewport + base mobile-first (spacing/typography) apenas no paciente.
- [x] Drawer menu (off-canvas) no paciente.
- [x] Bottom nav premium **(Sessão/Diário/Leituras/Contrato)**.
- [x] Remover FAB “+” das notas (redundante).
- [x] Agenda em cards colapsáveis (mobile).
- [x] Diário: busca visível + foco automático.
- [x] Próxima sessão compacta + confirmação em destaque (sem CTA de cancelar/remarcar).
- [x] Notificações compactas (status pill + explicação opcional).
- [x] Biblioteca: busca/categorias sticky no modal (mobile).
- [x] Contrato: título sempre visível no mobile + acesso via bottom nav.
- [x] Reduzir altura/“peso” do topo (Top AppBar fixa + mantra compacto).
- [x] Remover contornos excessivos (cards viram superfície; borda só em inputs/separadores).
- [x] Paleta do paciente: fundo em escala de cinza + primário `bg-violet-950/95` + tokens/tema.
