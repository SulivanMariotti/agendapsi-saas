# AgendaPsi — HANDOFF para novo chat

Data: **2026-03-05**  
Timezone: **America/Sao_Paulo**  
Objetivo deste arquivo: permitir retomar o desenvolvimento **exatamente de onde paramos** (sem depender do histórico do chat).

---

## 1) Identidade do projeto

- Projeto: **AgendaPsi (SaaS)**
- Stack: **Next.js (App Router) + Firebase (Firestore/Auth/Storage)** (+ FCM quando aplicável)
- Domínio: **agendapsi.msgflow.app.br**
- Regra crítica: **separação total do Lembrete Psi** (deploy/Firebase/dados/rules separados). Reuso permitido apenas de **código/UI/padrões**.

---

## 2) Objetivo do produto

Agenda clínica com foco na rotina do profissional, organização e constância do cuidado.

Painéis:
1) **Admin** (desktop completo)
2) **Profissional** (mobile + desktop)
3) **Paciente** (portal informativo **sem CTA de cancelar/remarcar**)

Premissas oficiais:
- **Sem importação por CSV**.
- Portal do paciente **sem Firestore no client** (tudo via **APIs server-side**).
- Sessões isoladas no mesmo navegador: paciente usa **Firebase App secundário** (`patientApp`).

---

## 3) Estado atual (onde paramos)

### 3.1 Fundamentos ✅
- Seed do Firestore (tenant demo + paciente teste + séries + ocorrências).
- Login do profissional com **sessão server-side**.
- Isolamento por tenant via `userTenantIndex/{uid}` (sem `collectionGroup`).

### 3.2 SaaS (Super Admin) ✅
- Admin → **SaaS → Tenants**:
  - criar/listar/suspender/reativar tenant
  - vincular **Owner** ao tenant (cria membership + `userTenantIndex/{uid}`)
- Suspensão tem efeito real:
  - Portal paciente bloqueia (`/api/paciente/*`) com **403 TENANT_SUSPENDED**
  - Profissional bloqueia sessão (`/api/auth/session`) com **403 TENANT_SUSPENDED**
- Auditoria mínima em `audit_logs` (ações de SaaS).

### 3.3 Admin ✅
- `tenants/{tenantId}/settings/schedule` configurável.
- `tenants/{tenantId}/occurrenceCodes/{codeId}` catálogo.
- **Portal do Paciente (settings)** por tenant em `tenants/{tenantId}/settings/patientPortal`
  - `termsText`, `termsVersion`
  - flags: `libraryEnabled`, `notesEnabled`, `remindersEnabled`
- **Templates WhatsApp** por tenant em `tenants/{tenantId}/whatsappTemplates` (CRUD).

### 3.4 Profissional (/profissional) ✅ (com upgrades recentes)
- Visões: **Dia / Semana / Mês**.
- Overlay de detalhe com chips/abas clínicas e salvar unificado (status + evolução + ocorrência extra).
- Recorrência (plano 1..30), holds e conversão; reagendar/excluir: “só esta” vs “esta e futuras”.
- WhatsApp no detalhe com **templates selecionáveis** (Admin gerencia; Profissional escolhe).

**Header da Agenda — Variante A (Clean Premium) ✅**
- Sticky + 2 camadas:
  - Camada 1 (sempre visível): período em destaque (clicável → “Ir para data”), navegação Anterior/Hoje/Próximo, ações (+Novo, Próximo atendimento, Ir para agora, Busca, Sair).
  - Camada 2 (colapsável): toggle Dia/Semana/Mês, busca por paciente nesta visão, badges de contagem **clicáveis** (filtro rápido).
- **Ir para agora** aparece só quando a tela está longe do horário atual (~>2h).
- **Próximo atendimento** (Dia/Semana): pula para o próximo agendamento/hold (ignora Cancelado) e abre o detalhe.
- Badges **Confirmados/Agendados/Holds** podem virar filtro:
  - itens fora do filtro ficam **apagados** (não somem) para não “parecer horário livre”.

**ÉPICO J — Cadastro Completo do Paciente (MVP) ✅**
- Pré-cadastro rápido no agendamento (CPF opcional; mínimo Nome + Celular).
- Modal “Editar cadastro” no detalhe (Dia/Semana/Mês).
- Badge “Cadastro incompleto” quando `profileStatus="incomplete"` ou `profileCompleted=false`.
- Detalhe do agendamento exibe `generalNotes` (fallback `notes`).

### 3.5 Paciente (/paciente) ✅
Módulos MVP:
- Agenda (informativo)
- Seu cadastro (subset)
- Contrato/Termo (visualizar + aceitar)
- Ativar lembretes (opt-in/opt-out)
- Biblioteca (somente publicados do Admin)
- Anotações do paciente (CRUD com exclusão lógica)

Regras do portal:
- Sem CTA de cancelar/remarcar
- Sem Firestore no client (APIs server-side)
- Auth isolado (`patientApp`)
- Rotas com `enforceSameOrigin` + `rateLimit`.

---

## 4) Modelo de dados (essencial)

Por tenant:
- `tenants/{tenantId}`
- `tenants/{tenantId}/users/{uid}` (membership)
- `tenants/{tenantId}/patients/{patientId}`
- `tenants/{tenantId}/appointmentSeries/{seriesId}`
- `tenants/{tenantId}/appointmentOccurrences/{occurrenceId}` (hold via `isHold`)
- `tenants/{tenantId}/occurrenceCodes/{codeId}`
- `tenants/{tenantId}/settings/schedule`
- `tenants/{tenantId}/settings/patientPortal`
- `tenants/{tenantId}/whatsappTemplates/{templateId}`

Índice global:
- `userTenantIndex/{uid}`

Subcoleções clínicas:
- `patients/{patientId}/sessionEvolutions/{occurrenceId}` (docId=occurrenceId)
- `appointmentOccurrences/{occurrenceId}/occurrenceLogs/{logId}` + espelho em `patients/{patientId}/occurrenceLogs/{logId}`

Portal do paciente:
- Preferências/aceite em `patients/{patientId}.portal.*`
- Anotações: `patients/{patientId}/patientNotes/{noteId}` (exclusão lógica)
- Biblioteca: `library_articles/{articleId}` (global; paciente vê só published via API)

---

## 5) Segurança e permissões (alto nível)

Papéis:
- **Super Admin SaaS**: claim `role="admin"` (global)
- **Admin/Owner do tenant**: membership em `tenants/{tenantId}/users/{uid}` (`role="owner"`/`admin`)
- **Profissional**: membership (`role="professional"`)
- **Paciente**: portal via API; token/claims carregam `tenantId` e `patientId`

Regras importantes:
- Princípio do menor privilégio
- Tenant isolation por path `tenants/{tenantId}/...`
- Portal do paciente permanece via API (sem listener Firestore no client)

---

## 6) Variáveis de ambiente (relevantes)

Além de `SERVICE_ACCOUNT_JSON_PATH`, `NEXT_PUBLIC_FIREBASE_*`, `ADMIN_PASSWORD`:
- `ENABLE_PATIENT_DEV_TOKEN=true` (somente dev)
- `NEXT_PUBLIC_ENABLE_PATIENT_DEV_DEMO=true` (somente dev)
- `PATIENT_ACCESS_CODE_TTL_MIN=15`

---

## 7) Como rodar localmente

1) `npm install`
2) `.env.local` com as variáveis do projeto
3) `npm run dev`
4) Acessos:
   - `http://localhost:3000/login` → profissional → `/profissional`
   - `http://localhost:3000/admin` → admin
   - `http://localhost:3000/paciente` → portal do paciente

---

## 8) Checklist de validação (rápido)

### Profissional — Agenda
- [ ] Dia/Semana/Mês abre sem erros
- [ ] Header: sticky + “Ir para data”
- [ ] “Ir para agora” aparece só quando longe do horário atual e rola corretamente
- [ ] “Próximo atendimento” pula e abre detalhe (Dia/Semana)
- [ ] Badges (Confirmados/Agendados/Holds) filtram e mantêm itens fora do filtro apagados (slots continuam ocupados)

### ÉPICO J — Cadastro completo
- [ ] Pré-cadastro rápido: agendar sem CPF (Nome + Celular)
- [ ] “Editar cadastro” abre modal e salva ficha
- [ ] `generalNotes` aparece no detalhe do agendamento
- [ ] Badge “Cadastro incompleto” some após completar

### Admin / SaaS
- [ ] Admin → SaaS → Tenants: criar/suspender/reativar
- [ ] Suspender tenant bloqueia profissional e paciente com UX amigável
- [ ] Templates WhatsApp CRUD
- [ ] Patient Portal settings salva corretamente

### Paciente
- [ ] `/paciente` abre sem `permission-denied`
- [ ] Contrato: aceitar funciona; bump `termsVersion` volta a pendente
- [ ] Lembretes: toggle persiste após F5
- [ ] Biblioteca: só published
- [ ] Anotações: criar/listar/remover (exclusão lógica)

---

## 9) Próximos passos sugeridos

1) **Persistir preferências do profissional** (visão, filtro, header compacto) — localStorage (Sugestão 3).
2) **Busca inteligente**: “Nesta visão” vs “Todos os pacientes” (Sugestão 4).
3) **Modo compacto Semana** (densidade: compacto/confortável) (Sugestão 5).
4) **Aviso sutil de conflitos** em sobreposição de horários (Sugestão 6).
5) Tenant Admin (Owner) no Admin sem depender do Super Admin.

---

## 10) Documentos de apoio

- `docs/05_UI_UX_MAPA_TELAS.md`
- `docs/31_PATCHES_ZIPS_APLICADOS.md`
- `docs/42_CADASTRO_COMPLETO_PACIENTE.md`
- `docs/26_SUPER_ADMIN_SAAS_TENANTS.md`
- `docs/27_SUPER_ADMIN_SAAS_TENANT_SUSPENSION.md`
- `docs/29_WHATSAPP_TEMPLATES.md`
- Referências base (v0):
  - `docs/01_REFERENCIA_MODELO_DADOS_v0.md`
  - `docs/02_REFERENCIA_SEGURANCA_PERMISSOES_v0.md`
