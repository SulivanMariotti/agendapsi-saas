# AgendaPsi — Arquivo para iniciar um novo chat (HANDOFF)

Data: **2026-03-02**  
Última atualização: **2026-03-02** (refino do detalhe do agendamento em overlay + WhatsApp + “Salvar alterações” unificado)

## 1) Objetivo do projeto
Construir o **AgendaPsi (SaaS)** em **Next.js (App Router) + Firebase (Firestore/Auth/Storage/FCM quando aplicável)**, em subdomínio separado: **agendapsi.msgflow.app.br**, com foco na rotina do profissional e constância do cuidado.

O sistema tem 3 painéis:
- **Admin** (desktop completo)
- **Profissional** (agenda otimizada para mobile e desktop)
- **Paciente** (**sem CTA** de cancelar/remarcar; foco em constância)

---

## 2) Separação total do Lembrete Psi (decisão crítica)
O **Lembrete Psi** permanece separado em **agenda.msgflow.app.br** com Firebase próprio.

O **AgendaPsi é um sistema novo e separado**, com:
- Firebase Project próprio
- Firestore/RULES próprios
- deploy/URL próprios (**agendapsi.msgflow.app.br**)

✅ Reuso permitido: **apenas** código/UI/lógica/padrões do Lembrete Psi.  
❌ Reuso proibido: deploy/URL, Firebase Project, coleções/rules, claims/políticas, dados.

---

## 3) Estado atual (onde paramos)

### 3.1 Fundamentos ✅
- Seed do Firestore funcionando (tenant `tn_JnA5yU`, paciente teste, série + ocorrências).
- Login do profissional funcionando com **sessão server-side**.
- Isolamento por tenant via índice `userTenantIndex/{uid}` (sem `collectionGroup`).

### 3.2 Admin ✅
- Menu em **Menus + Submenus**:
  - **Dashboard** (default)
  - **Lembretes** (placeholders; **não** integra com o Firebase do Lembrete Psi)
  - **AgendaPsi** → Agenda do Profissional + Códigos de Ocorrência
  - **Pacientes**
- Schedule configurável e persistido em: `tenants/{tenantId}/settings/schedule`
  - `slotIntervalMin` (30/45/60), ranges por dia, `bufferMin`, almoço opcional, duração padrão em blocos.
- Catálogo de **Códigos de Ocorrência** (Admin) em: `tenants/{tenantId}/occurrenceCodes/{codeId}`.
- Evitado listener client de coleções “legadas” que geravam `permission-denied` no Admin.

### 3.3 Profissional (/profissional) ✅

#### Visões (Agenda)
- **Dia**: grade compacta; cards com cor suave por status.
- **Semana**: grade semanal (coluna horas + 7 dias), blocos posicionados.
- **Mês**: grade mensal com itens compactos por dia (fundo na cor do status).

#### Detalhe do agendamento/hold (refino UX ✅)
- Detalhes abrem em **overlay (tela por cima)** com **ícone X** (fechar).  
  A agenda fica **limpa** quando nada está selecionado.
- **Topo do overlay (header)**: chips informativos na mesma linha do X (ex.: **Atendimento**, **Plano**, **Status** / ícone de **Cancelado**).
- **Status**: editor compacto (não ocupa largura desnecessária).
- **Ações** no rodapé do overlay: **Reagendar**, **Excluir (ícone)** e **Salvar alterações**.
- **Registros clínicos** no detalhe em **abas**: **Evolução** / **Ocorrências (extra)** (evita rolagem excessiva).
- **Salvar alterações (unificado)**: salva em 1 clique as mudanças feitas no detalhe:
  - status
  - evolução (texto livre)
  - ocorrência extra em rascunho (código + descrição)
- Após salvar ocorrência extra, o rascunho é limpo automaticamente (código volta para “Selecione…”) e o modal não fica “preso” em alterações pendentes.
- “Histórico recente (evolução)” foi removido do detalhe (menos ruído).

#### Interações (Agenda)
- Clique em agendamento/hold abre detalhes (overlay).
- Semana:
  - clique em horário livre → escolher **Agendar** ou **Reservar (Hold)**
- Mês:
  - clique em **área livre do dia** → modal “Ações do dia” (**Agendar / Reservar / Abrir no Dia / Abrir Semana**)
  - clique no **número do dia** → abre o Dia
- Botão **Próximos horários**: lista **3 próximos** horários livres; ao escolher, abre o fluxo de agendar.

#### Regras aplicadas ✅
- Multi-bloco (compromisso ocupa N slots consecutivos).
- Buffer respeitado (não “encosta” compromissos).
- Correção de dia da semana (timezone) para não deslocar sábado/domingo.
- Conflitos (MVP): criação/alteração recorrente é **atômica** (sem criação parcial).

#### Recorrência e “plano” de sessões ✅
- Fluxo de **Agendar** e **Reservar**:
  - quantidade 01..30 + “Mais…”
  - frequência: Diário / Semanal / Quinzenal / Mensal
- Cria `appointmentSeries` e materializa `appointmentOccurrences` com `sessionIndex` e `plannedTotalSessions`.

#### Reserva/Hold como negociação → converter em plano real ✅
- Criar hold curto (ex.: 2 sessões) e depois **“Agendar a partir desta reserva”**:
  - converte as sessões existentes sem conflito
  - pode estender para um plano maior materializando o restante
- Conflitos: operação atômica.

#### Reagendar (recorrente) ✅
- Ação Reagendar na ocorrência:
  - **Só esta ocorrência**
  - **Esta e futuras**
- Week picker (seg→dom) com legenda: **L** livre, **R** hold, **—** ocupado.

#### Excluir ocorrência (agenda) ✅
- Botão **Excluir** em detalhes de Agendamento/Hold:
  - **Só esta ocorrência**
  - **Esta e futuras**
- Exclusão libera a data/horário na agenda.
- Observação: prontuário/evolução e ocorrências “extra” são dados do paciente e **não** devem ser apagados por essa ação.

#### WhatsApp (Profissional) ✅ (parcial)
- Botão único de WhatsApp no detalhe, com **logo branco (transparente)** em botão verde.
- Template + prévia existem no detalhe (UX compacta).
- **Pendente**: gerenciar templates via Admin (persistência e catálogo), se desejado para produção.

### 3.4 Registros clínicos: Evolução vs Ocorrência (separação) ✅
- **Evolução / prontuário por sessão**:
  - texto livre
  - armazenado no paciente, referenciado pela sessão
- **Ocorrência (registro extra)**:
  - registro estruturado com **código + descrição**
  - para fatos fora do âmbito da sessão
  - armazenado em subcoleção da ocorrência e espelhado no paciente (evita índice composto)

---

## 4) Modelo de dados (essencial)

### Coleções principais (por tenant)
- `tenants/{tenantId}`
- `tenants/{tenantId}/users/{uid}` (membership)
- `userTenantIndex/{uid}` (índice global do login)
- `tenants/{tenantId}/patients/{patientId}`
- `tenants/{tenantId}/appointmentSeries/{seriesId}`
- `tenants/{tenantId}/appointmentOccurrences/{occurrenceId}` (**hold via `isHold`**)
- `tenants/{tenantId}/occurrenceCodes/{codeId}` (catálogo Admin)
- `tenants/{tenantId}/settings/schedule`

### Subcoleções clínicas (MVP)
- Evolução (texto livre por sessão, **docId=occurrenceId**):
  - `tenants/{tenantId}/patients/{patientId}/sessionEvolutions/{occurrenceId}`
- Ocorrências “extra” (sem exigir índice composto):
  - `tenants/{tenantId}/appointmentOccurrences/{occurrenceId}/occurrenceLogs/{logId}`
  - espelho para histórico do paciente:
    - `tenants/{tenantId}/patients/{patientId}/occurrenceLogs/{logId}`

---

## 5) Como rodar localmente
1. `npm install`
2. `.env.local` deve ter:
   - `SERVICE_ACCOUNT_JSON_PATH=C:\secrets\agendapsi-admin.json`
   - `NEXT_PUBLIC_FIREBASE_*` (web config do Firebase do AgendaPsi)
   - `ADMIN_PASSWORD=...`
   - `ADMIN_UID=...` (**opcional** em dev)
3. `npm run dev`
4. Acessar:
   - `http://localhost:3000/login` → login profissional → `/profissional`
   - `http://localhost:3000/admin` → admin

---

## 6) Checklist de validação rápida (atual)
### Auth
- [ ] `/admin` entra com senha (`POST /api/auth` retorna 200)
- [ ] `/login` redireciona para `/profissional`

### Schedule
- [ ] Admin salva schedule em `tenants/{tenantId}/settings/schedule`
- [ ] Profissional (Dia/Semana/Mês) respeita horário aberto + almoço + buffer

### Agenda
- [ ] Criar Hold/Agendar multi-bloco bloqueia slots seguintes
- [ ] Buffer impede criar item “encostado”
- [ ] “Próximos horários” lista 3 opções e abre fluxo
- [ ] Semana: clique em horário livre abre Agendar/Reservar
- [ ] Mês: clique em área livre do dia abre Ações do dia; número do dia abre o Dia
- [ ] Holds aparecem em cinza e não permitem mudança de status
- [ ] Excluir: “só esta” vs “esta e futuras” funciona para agendamento e hold

### Detalhe do agendamento (overlay)
- [ ] Abrir detalhe → overlay com **X**; chips informativos no header (Atendimento/Plano/Status)
- [ ] Status editor é compacto
- [ ] Rodapé concentra: **Reagendar / Excluir / Salvar alterações**
- [ ] Abas clínicas: **Evolução / Ocorrências (extra)**
- [ ] “Salvar alterações” salva (status + evolução + ocorrência extra)
- [ ] Após salvar ocorrência extra, campo **Código** volta para “Selecione…” e o modal deixa de marcar alterações pendentes
- [ ] “Histórico recente (evolução)” **não** aparece mais

### Recorrência / converter / reagendar
- [ ] Criar reserva com recorrência cria `1/2`, `2/2`
- [ ] “Agendar a partir desta reserva” converte e pode estender (sem conflito)
- [ ] Conflito em qualquer futura bloqueia (sem criação parcial)
- [ ] Reagendar “Só esta” move só a sessão selecionada
- [ ] Reagendar “Esta e futuras” move a partir da selecionada (sem afetar anteriores)
- [ ] Week picker: seg→dom; L livre; R hold; — ocupado; header fixo ao rolar

### Registros
- [ ] Evolução por sessão salva no paciente com docId=occurrenceId
- [ ] Ocorrência extra salva com código + descrição e aparece:
  - na ocorrência (subcoleção)
  - no histórico do paciente (espelho)

---

## 7) Checklist rápido de Git (evitar push no repositório errado)
1. `git remote -v`
   - Esperado: `origin https://github.com/SulivanMariotti/agendapsi-saas.git (fetch/push)`
2. `git branch --show-current` → esperado: `main`
3. `git status`
4. `git log -1`
5. `git status -sb` (deve mostrar `[origin/main]` quando sincronizado)

---

## 8) Próximos passos sugeridos (ordem recomendada)
1. Painel **Paciente** (sem CTA de cancelar/remarcar).
2. **WhatsApp templates (Admin)**: CRUD + persistência no Firestore + seleção no detalhe do Profissional.
3. Firestore Rules: tenant isolation + hardening de produção (incluindo subcoleções clínicas).
4. **[PÓS-MVP]** Relatório por código de ocorrência (agregações/export).

---

## 9) O que anexar no próximo chat
Obrigatório:
1. ZIP do projeto atual do AgendaPsi (sem `node_modules/` e sem `.next/`)
2. Este arquivo (`docs/00_HANDOFF_PARA_NOVO_CHAT.md`) atualizado

Opcional:
3. ZIP do lembrete-psi apenas como referência de UI/código (nunca como base de dados)
