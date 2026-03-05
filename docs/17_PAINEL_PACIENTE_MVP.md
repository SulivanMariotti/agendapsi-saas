# Painel Paciente (MVP) — requisitos, dados, segurança e UX

Atualizado: **2026-03-02**

## Objetivo
Disponibilizar um **painel do paciente** para **visualizar** seus agendamentos e informações úteis para presença/constância,
**sem qualquer CTA** de cancelar/remarcar. O painel deve ser **simples, mobile-first**, e expor **apenas dados mínimos**.

> Regra de produto: o paciente não cancela/remarca no sistema. Qualquer comunicação deve reforçar presença/constância.

---

## Escopo MVP (o que entra)
### 1) Acesso e autenticação (MVP)
- Paciente acessa `/paciente` autenticado via **Firebase Auth**.
- O `uid` do paciente deve estar vinculado ao tenant e ao `patientId`.

**Vínculo (fonte de verdade)**
- `tenants/{tenantId}/users/{uid}` com:
  - `role: "patient"`
  - `patientId`
  - `isActive`
- `userTenantIndex/{uid}` (login global) também deve refletir:
  - `tenantId`, `role: "patient"`, `patientId`

> Assumi **Auth normal** (e-mail/senha ou Google) para manter o mesmo padrão de sessão server-side já usado no painel Profissional.
> Alternativa pós-MVP: “link seguro” por token (portal link) para acesso sem senha.

### 2) Dashboard do paciente
- Lista de **próximos agendamentos** (ex.: próximos 90 dias, ordenado por data).
- Destaque do **próximo atendimento**.
- Exibir:
  - data + horário (timezone do tenant/app)
  - modalidade/local (presencial/online) quando existir
  - status (somente leitura)
  - progresso do plano quando aplicável (ex.: `4/30`)

### 3) Detalhe do agendamento (somente leitura)
- Informações do atendimento (data/hora, modalidade/local, status, plano).
- Orientações fixas de presença (texto curto e neutro).
- **Ações permitidas (sem remarca/cancelamento):**
  - botão “Falar no WhatsApp” (mensagem pré-preenchida reforçando presença)
  - botão “Adicionar ao calendário” (arquivo `.ics` ou link)
  - botão “Abrir local / link da sessão” (quando houver)

### 4) Estados e mensagens (UX)
- **Cancelado**: mostrar aviso claro (“Sessão cancelada pela clínica/profissional”) e orientar a entrar em contato (WhatsApp).
- **Reagendado**: mostrar como “Sessão reagendada” e apontar para a nova data (se disponível).
- **Não comparece** e **Finalizado**: apenas histórico (se exibido).

---

## Fora do escopo (MVP)
- Cancelar/remarcar pelo paciente (proibido).
- Visualização de prontuário/evolução/ocorrências extra (dados clínicos).
- Chat interno.
- Notificações push/FCM (pode entrar depois).
- Área de pagamentos/boletos.

---

## Modelagem de dados (proposta MVP)
> Meta: permitir queries simples e rules fortes **sem expor** documentos sensíveis do paciente.

### A) “Visão segura” do paciente (dados mínimos)
Criar uma coleção **somente para o portal**:
- `tenants/{tenantId}/patientsPortal/{patientId}`

Campos sugeridos (exemplos):
- `displayName`
- `preferredName` (opcional)
- `phoneE164` (opcional, se for exibido)
- `birthWeek` (opcional, se for usado apenas para UI)
- `createdAt`, `updatedAt`

**Motivo:** evita conceder read no doc real de `patients/{patientId}`, que tende a concentrar dados sensíveis.

### B) “Visão segura” dos agendamentos do paciente
Espelhar ocorrências **não-hold** em subcoleção do portal:
- `tenants/{tenantId}/patientsPortal/{patientId}/appointments/{occurrenceId}`

Campos mínimos:
- `occurrenceId`, `seriesId`
- `startAt`, `endAt` (timestamp)
- `status`
- `sessionIndex`, `plannedTotalSessions`
- `modality` (presencial/online)
- `locationLabel` (texto curto) e/ou `meetingUrl` (se aplicável)
- `professionalDisplayName` (ou `tenantDisplayName`)

**Regra:** não espelhar holds (`isHold=true`) no portal.

> Observação: alternativamente, dá para queryar direto em `appointmentOccurrences` por `patientId`.
> Prefiro o **espelho no portal** para reduzir complexidade de índices e deixar rules mais simples.

---

## Permissões e Rules (impacto)
### Regras de leitura do paciente
- Paciente **pode ler**:
  - `patientsPortal/{patientId}` **somente do seu próprio** `patientId`.
  - `patientsPortal/{patientId}/appointments/*` (somente os seus).
- Paciente **não pode ler**:
  - `patients/*` (doc “real”)
  - `sessionEvolutions/*`
  - `appointmentOccurrences/*` (se houver risco de expor campos extras)
  - `occurrenceLogs/*`

### Regras de escrita do paciente
- MVP: **sem escrita**, exceto:
  - opcional (mais seguro deixar para pós-MVP): “check-in/confirmar presença” como um evento simples e auditável
    - e ainda assim, sem alterar status do agendamento.

---

## Rotas e responsabilidades (Next.js)
### Rotas
- `/paciente` → dashboard (SSR) com dados mínimos do portal
- `/paciente/agenda` (opcional) → lista completa (futuro)
- `/paciente/atendimento/[occurrenceId]` → detalhe (SSR)

### Server guards
- Criar `requirePatientSession()` (análogo ao `requireProfessionalSession`), validando:
  - sessão válida
  - membership com `role === "patient"`
  - `tenantId` e `patientId` presentes

### Data loaders (server)
- `getPatientDashboardData({ tenantId, patientId })`:
  - lê `patientsPortal/{patientId}`
  - lê `patientsPortal/{patientId}/appointments` (range futuro)

---

## UI/UX (MVP) — padrão “Lembrete Psi” adaptado
- Manter o visual/organização do paciente inspirado no Lembrete Psi (reuso de UI), porém com **dados do AgendaPsi**.
- Topo do portal: título **“AgendaPsi - Seu Espaço de cuidado”** (sem repetir o nome do paciente no topo).
- Card **“Seu cadastro”** fica em posição de destaque (preferência: topo) e mostra **subset mínimo** (ex.: nome/telefone).
- Menu do paciente (MVP):
  - Biblioteca (somente publicados)
  - Contrato/Termo (visualizar + concordar)
  - Preferências: “Ativar lembretes”
  - Anotações
- Proibido CTA de cancelar/remarcar. Qualquer texto/ação deve reforçar presença/constância.

---

## Critérios de aceitação (MVP)
- [ ] `/paciente` exige sessão válida e role `patient`.
- [ ] Paciente vê apenas agendamentos do seu `patientId`.
- [ ] Não existe CTA de cancelar/remarcar em nenhuma tela do paciente.
- [ ] Tela de detalhe tem WhatsApp + Calendário + Local/Link (quando existirem).
- [ ] Dados clínicos (evolução/ocorrências extra) **não aparecem** no portal e não são acessíveis por rules.
- [ ] “Cancelado” mostra aviso e orienta contato, sem sugerir remarca no sistema.

---

## Dependências
- Ajustar auth/session para aceitar `role=patient` (sem abrir acesso ao Profissional).
- Implementar `requirePatientSession` + middleware para `/paciente`.
- Implementar espelhamento `patientsPortal/*` (criação/atualização):
  - ao criar/atualizar paciente (portal profile)
  - ao criar/alterar/excluir ocorrência (portal appointments)

---

## Riscos e atenção (LGPD / segurança)
- Minimização de dados: portal só com o necessário.
- Link/conta compartilhada: evitar dados sensíveis e manter `isActive` + revogação.
- URL de sessão online (meetingUrl) deve ser tratada com cuidado (não expor links internos).
- Auditoria mínima (sem dados sensíveis em logs).


---

## Implementação atual (dev)
### API (server-side)
- `POST /api/paciente/dev-token` (**DEV ONLY**)  
  Emite um custom token para o paciente teste do seed (sem depender de pair code)  
  Requer:
  - `ENABLE_PATIENT_DEV_TOKEN=true` (server)
  - `AGENDA_PSI_TENANT_ID` (opcional, default `tn_JnA5yU`)
  - `AGENDA_PSI_PATIENT_ID` (opcional, default do seed)

- `GET /api/paciente/agenda`  
  Retorna a agenda do paciente com **dados mínimos** (sem prontuário).  
  Requer `Authorization: Bearer <idToken>` e claims:
  - `role='patient'`
  - `tenantId`
  - `patientId`

### UI
- `/paciente`
  - deslogado: `PatientLogin`
  - logado: `AgendaPsiPatientFlow` (lista próximos agendamentos)

### Validação rápida (dev)
1. Definir em `.env.local`:
   - `ENABLE_PATIENT_DEV_TOKEN=true`
   - `NEXT_PUBLIC_ENABLE_PATIENT_DEV_DEMO=true`
2. Acessar `/paciente` → clicar **“Entrar como demo (dev)”**
3. Ver:
   - “Próxima sessão” e lista de próximos agendamentos
   - **sem** botões de cancelar/remarcar
---

## Acesso do paciente (MVP) — Código de acesso (one-time)

**Objetivo:** permitir acesso ao painel do paciente sem expor Firestore no client, mantendo isolamento por tenant.

### Fluxo
1. Profissional/Admin gera um **código de acesso** (6 dígitos) para um paciente do tenant.
2. Paciente entra em `/paciente`, informa o código (telefone é opcional) e faz login.
3. Backend troca o código por um **Firebase Custom Token** com claims:
   - `role: "patient"`
   - `tenantId`
   - `patientId`
4. Portal do paciente consome dados via **API** (ex.: `/api/paciente/agenda`).

### Endpoints
- `POST /api/profissional/pacientes/access-code`
  - Body: `{ patientId }`
  - Retorna: `{ code, expiresAt, ttlMin }`
- `POST /api/paciente/access-code`
  - Body: `{ code, phone? }`
  - Retorna: `{ token }` (custom token)

### Segurança (MVP)
- Código é **one-time** (marcado como `consumed`) e tem expiração (`expiresAt`, default 15 min).
- Rate limit + bloqueio de origem.
- Portal do paciente **não** lê Firestore direto; apenas API.


---

## Extensões MVP (AgendaPsi) — contrato + lembretes + seu cadastro
### Contrato / Termo (MVP)
- O paciente pode **ler** o termo e **aceitar** (one-click).
- Aceite é registrado no documento do paciente:
  - `tenants/{tenantId}/patients/{patientId}.portal.termsAcceptedVersion`
  - `tenants/{tenantId}/patients/{patientId}.portal.termsAcceptedAt`
- Versão e texto do termo podem ser configurados em:
  - `tenants/{tenantId}/settings/patientPortal`
    - `termsVersion` (number)
    - `termsText` (string)

**Regras de UX**
- Se `termsAcceptedVersion < termsVersion`, o contrato aparece como **Pendente** e mostra o botão **“Concordo com o termo”**.
- Não existe CTA de cancelar/remarcar em nenhum lugar do painel.

### Ativar lembretes (MVP — preferência)
- O paciente pode ligar/desligar uma preferência “Ativar lembretes”.
- Persistência:
  - `tenants/{tenantId}/patients/{patientId}.portal.remindersEnabled` (boolean)
- Observação: no MVP é apenas preferência; automações (FCM/WhatsApp) podem ser habilitadas depois.

### “Seu cadastro” (MVP — visual)
- O painel exibe o bloco “Seu cadastro” **no topo** (nome + telefone).
- No MVP é **somente leitura** (edição fica sob controle da clínica/profissional).

---

## Endpoints (AgendaPsi)
### GET `/api/paciente/agenda`
Retorna:
- `patient`: subset do paciente (nome + telefone; sem dados clínicos)
- `portal`: contrato + features do portal (p/ UI)

### POST `/api/paciente/portal`
Body:
- `{ action: "acceptContract" }` → registra aceite do termo
- `{ action: "setReminders", remindersEnabled: boolean }` → atualiza preferência

---

## Segurança (MVP)
- Painel do paciente continua **sem Firestore no client** para evitar exposição de coleções.
- Todas leituras/escritas do paciente são feitas via **API server-side (Admin SDK)** com:
  - `requireAuth` (Bearer idToken)
  - claims obrigatórias: `role=patient`, `tenantId`, `patientId`
- O paciente não acessa prontuário/evolução/ocorrências clínicas.




## Módulo: Biblioteca de artigos (Portal)
### Objetivo
Disponibilizar uma **biblioteca de conteúdos** (psicoeducação passiva) para apoiar constância e entendimento do processo.
É **somente leitura** (sem chat/CTA de cancelamento/remarcação).

### Fonte da verdade (AgendaPsi)
- `library_articles/{articleId}`

Campos (MVP):
- `title` (string)
- `category` (string, ex.: "Ansiedade", "Autoconhecimento")
- `summary` (string curta)
- `readingTime` (string opcional, ex.: "3 min")
- `content` (string) **ou** `body` (array de parágrafos)
- `isPublished` (boolean, default true)
- `createdAt`, `updatedAt` (serverTimestamp)

> No MVP a biblioteca pode iniciar com **artigos seed** (fallback) e evoluir para CRUD via Admin (pós-MVP).

### API (server-side)
- `GET /api/paciente/library?limit=60` → lista artigos publicados do tenant

### Regras/UX
- Busca por texto + filtro por categoria.
- Modal/overlay leve, com leitura confortável.
- Se não houver artigos publicados no tenant, usa seed local como fallback (dev/MVP).


## Módulo: Anotações do paciente (Portal)
### Objetivo
Permitir que o paciente registre **anotações pessoais** (ex.: pontos para lembrar, perguntas, reflexões), sem alterar agenda e sem CTA de cancelar/remarcar.

### Fonte da verdade (AgendaPsi)
- `tenants/{tenantId}/patients/{patientId}/patientNotes/{noteId}`

Campos (MVP):
- `text` (string, até 2000 chars)
- `createdAt`, `updatedAt` (serverTimestamp)
- `deletedAt` (timestamp|null) — exclusão lógica
- `createdBy` (uid do paciente)
- `source` = `"patientPortal"`

### API (server-side)
- `GET /api/paciente/notes?limit=30` → lista notas ativas (`deletedAt == null`)
- `POST /api/paciente/notes` `{ text }` → cria nota
- `DELETE /api/paciente/notes?noteId=...` → exclusão lógica

### Regras/UX
- **Sem Firestore no client**: o painel usa apenas API com `Authorization: Bearer <idToken>`.
- Texto curto, com aviso para evitar dados sensíveis desnecessários (LGPD).
- Exclusão é **lógica** (evita perda/ressarcimento e simplifica auditoria).


