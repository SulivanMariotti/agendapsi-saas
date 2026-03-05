# AgendaPsi — Requisitos & Backlog (fonte da verdade)

Data atualização: **2026-03-04**  
Timezone: **America/Sao_Paulo**

Este documento consolida requisitos em:
**Épicos → Funcionalidades → Regras de negócio → Critérios de aceitação**, marcando **MVP / Pós‑MVP**, dependências e riscos.

> Convenção de status: ✅ concluído | 🟨 em andamento | ⬜ pendente

---

## ÉPICO A — Fundamentos (✅)
**Objetivo:** base técnica e isolamento por tenant.

Funcionalidades:
- Seed Firestore (tenant demo, paciente teste, séries + ocorrências)
- Sessão server-side do Profissional
- Isolamento por tenant via `userTenantIndex/{uid}` (sem `collectionGroup`)

Critérios de aceitação:
- Seed cria dados consistentes
- Login do profissional cria sessão server-side
- Usuário sem tenant não acessa rotas protegidas

---

## ÉPICO B — Painéis, Rotas e UX Base (✅)
**Objetivo:** separar claramente papéis e reduzir confusão.

Funcionalidades:
- `/admin` (Super Admin SaaS)
- `/admin-tenant` (Admin do consultório: owner/admin)
- `/profissional` (rotina/agenda)
- `/paciente` (portal via API)
- Deep link por aba no `/admin-tenant` (`?tab=...`)

Critérios de aceitação:
- Profissional comum não acessa `/admin-tenant`
- Owner/Admin acessa `/admin-tenant`
- Portal do paciente sem Firestore no client

Doc: `docs/34_PANEIS_ROTAS_PERMISSOES.md`

---

## ÉPICO C — Admin do consultório (Owner/Admin) (✅)
**Objetivo:** o próprio consultório gerenciar configurações do tenant.

Funcionalidades:
- Configurar agenda (`tenants/{tenantId}/settings/schedule`)
- Códigos de ocorrência (`tenants/{tenantId}/occurrenceCodes`)
- Settings Portal do Paciente (`tenants/{tenantId}/settings/patientPortal`)
- Templates WhatsApp (`tenants/{tenantId}/whatsappTemplates`)

Critérios de aceitação:
- CRUD completo via `/admin-tenant`
- Permissão somente `owner|admin`

---

## ÉPICO D — Profissional / Agenda (✅)
**Objetivo:** rotina de agenda e registro clínico por ocorrência.

Funcionalidades:
- Visões Dia/Semana/Mês
- Holds + conversão
- Recorrência (plano 1..30)
- Editar recorrente: “só esta” vs “esta e futuras”
- Status: Agendado, Confirmado, Finalizado, Não comparece, Cancelado, Reagendado
- Evolução por sessão + histórico do paciente
- WhatsApp no detalhe com templates selecionáveis

Critérios de aceitação:
- Fluxos críticos funcionam sem perda de consistência (série/ocorrência)
- Sem regressões de UX (overlay, salvar unificado)

---

## ÉPICO E — Paciente / Portal (✅)
**Objetivo:** portal informativo sem CTA de cancelar/remarcar, via APIs.

Funcionalidades MVP:
- Agenda (informativo)
- Seu cadastro (subset)
- Termo/Contrato (visualizar + aceitar)
- Lembretes (opt-in/out)
- Biblioteca (somente published)
- Anotações do paciente (criar/listar/remover com exclusão lógica)

Regras:
- Proibido CTA de cancelar/remarcar
- Sem Firestore no client; tudo via API server-side
- Sessão isolada em `patientApp`

Critérios de aceitação:
- Sem `permission-denied` no `/paciente`
- Aceite de termo versionado
- Toggle de lembretes persiste após F5

---

## ÉPICO F — SaaS (Super Admin) (✅)
**Objetivo:** operar multi-tenant com controle e auditoria mínima.

Funcionalidades:
- Tenants: criar/listar/suspender/reativar
- Vincular Owner: email/uid; convite quando email não existir
- Bloqueio real quando tenant suspenso (profissional + paciente)
- Auditoria mínima (`audit_logs`)

Critérios de aceitação:
- Suspensão bloqueia `/api/paciente/*` e `/api/auth/session`
- Owner link cria membership + `userTenantIndex`

---

## ÉPICO G — Segurança, LGPD e Sigilo (⬜) — Implementar depois
**Objetivo:** tratar corretamente dados pessoais sensíveis e conteúdo sigiloso.

Funcionalidades:
- G1 Classificação de dados + minimização (PII vs clínico/sigiloso)
- G2 Criptografia de campo (evolução + patientNotes) com chaves no servidor (KMS/envelope)
- G3 Auditoria ampliada sem vazar conteúdo (read/write)
- G4 Retenção/purge seguro (política e job)
- G5 App Check + CSP + cache-control e hardening contínuo

Riscos/atenção:
- LGPD (saúde = dado sensível), confidencialidade clínica e segurança operacional.

---

## ÉPICO H — Hardening de APIs (✅)
**Objetivo:** reduzir superfície de ataque e abuso.

Funcionalidades:
- `enforceSameOrigin` (produção) em rotas cookie-based
- `rateLimit` por bucket + uid nas APIs do profissional e admin do consultório
- Retornos early quando `ok=false`

Critérios de aceitação:
- Abuso retorna 429 com `Retry-After`
- Cross-site POST/PATCH/DELETE é bloqueado em produção

---

## ÉPICO I — Planos & Billing (🟨)
**Objetivo:** base de SaaS para planos e billing sem gateway ainda.

Funcionalidades:
- `planId` por tenant + limites (pacientes/séries/templates)
- `billingStatus` (`trial/active/past_due/canceled`) + grace period
- Bloqueio gradual: past_due após carência e canceled bloqueiam writes; reads seguem

Critérios de aceitação:
- `PLAN_LIMIT_EXCEEDED` e `BILLING_WRITE_BLOCKED` padronizados
- UX (banner) consistente em `/profissional` e `/admin-tenant`

Docs:
- `docs/37_BILLING_PLANOS_FEATURE_FLAGS.md`
- `docs/39_BILLING_STATUS_TRIAL_PASTDUE.md`
- `docs/40_BILLING_GRACE_PERIOD.md`
- `docs/41_BILLING_MATRIZ_FINAL_E_MENSAGENS.md`

---

## ÉPICO J — Cadastro Completo do Paciente (🟨) — MVP concluído, Pós‑MVP pendente
**Objetivo:** permitir cadastro **completo** do paciente com campos obrigatórios, mantendo **pré‑cadastro rápido** no agendamento.

**Status (MVP): ✅ concluído (2026-03-04)**  
**Status (Pós‑MVP): ⬜ pendente**

### Funcionalidades (MVP)
J1. ✅ **Ficha completa do paciente (Profissional)** (2026-03-04)
- Tela de cadastro/edição completa do paciente (mobile/desktop)
- Campos obrigatórios do projeto (ver doc J0)
- Validação de entrada/saída + normalização (CPF, telefone, datas)

J2. ✅ **Pré‑cadastro rápido a partir da agenda** (2026-03-04)
- Ao clicar em horário vazio: criar paciente com **mínimo necessário**
- Permitir completar depois sem bloquear o uso da agenda
- Marcar paciente como `profileStatus="incomplete|complete"`

J3. ✅ **Observações gerais do paciente no agendamento** (2026-03-04)
- Exibir observações gerais (não prontuário) no detalhe do agendamento/overlay

### Funcionalidades (Pós‑MVP)
J4. Campos opcionais avançados (convênio, responsável legal, preferências)
J5. Upload de documentos (com regras rígidas e LGPD) — se necessário
J6. Multi‑profissional: atribuição de paciente a profissionais e restrição de acesso

### Regras de negócio
- Pré‑cadastro não deve salvar campos clínicos; apenas identificação/contato mínimo
- Campos sensíveis (saúde) e sigilosos (evolução/anotações) continuam separados do cadastro
- Auditoria de alterações na ficha do paciente (metadados, sem conteúdo clínico)

### Critérios de aceitação
- Criar paciente “mínimo” a partir da agenda e depois completar
- Validação robusta: não aceitar CPF inválido quando obrigatório
- Ficha completa persiste corretamente e aparece no agendamento
- Permissões: somente membros do tenant; paciente nunca edita ficha completa (portal mantém subset)

Dependências:
- Modelo de dados do paciente (campos oficiais)
- UX: rotas/telas de pacientes no Profissional

Riscos/atenção:
- LGPD (dado sensível e confidencialidade)
- Evitar campos clínicos na ficha geral (prontuário fica na evolução por sessão)

Doc: `docs/42_CADASTRO_COMPLETO_PACIENTE.md`

---
