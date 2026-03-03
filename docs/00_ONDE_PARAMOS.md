# Onde paramos — AgendaPsi (SaaS)

Atualização: **2026-03-02** (refino do detalhe do agendamento em overlay + WhatsApp + salvar unificado)

## 1) Estado atual (resumo executivo)

### Fundamentos ✅
- Seed Firestore ok (tenant demo, paciente teste, série + ocorrências).
- Login Profissional com sessão server-side.
- Tenant isolation via `userTenantIndex/{uid}` (sem `collectionGroup`).

### Admin ✅
- Sidebar com **Menus + Submenus** (Dashboard default).
- Schedule em `tenants/{tenantId}/settings/schedule`.
- Catálogo de **Códigos de Ocorrência** (para ocorrências “extra”).
- Fix para evitar listeners client que geravam `permission-denied` no Admin.

### Profissional ✅ (Dia/Semana/Mês)
- Agenda Dia / Semana / Mês com multi-bloco + buffer.
- Semana: horário livre → Agendar/Reservar.
- Mês: clique em área livre do dia → Ações do dia; número do dia abre o Dia.
- Holds em cinza com status travado.
- Recorrência + materialização de ocorrências + converter hold → agendamento (pode estender plano).
- Reagendar: “só esta” vs “esta e futuras” + week picker seg→dom.
- Excluir: “só esta” vs “esta e futuras”.

### Detalhe do agendamento (UX ✅)
- Detalhes abrem em **overlay** (tela por cima) com **X** no header.
- Header compacto com chips informativos (Atendimento / Plano / Status / Cancelado).
- Abas de “Registros clínicos”: **Evolução** / **Ocorrências (extra)**.
- Rodapé com ações: **Reagendar**, **Excluir** (ícone) e **Salvar alterações**.
- “Salvar alterações” é unificado (status + evolução + ocorrência extra).
- Após salvar ocorrência extra, o rascunho é limpo (código volta para “Selecione…”).
- “Histórico recente (evolução)” removido.

### Registros clínicos ✅ (separação)
- **Evolução por sessão**: texto livre, armazenado no paciente, referenciado pela sessão.
- **Ocorrência (extra)**: registro estruturado com código + descrição, armazenado na ocorrência e espelhado no paciente (sem índice composto).

---

## 2) Pendências principais (prioridade)
1. Painel do **Paciente** (sem CTA cancelar/remarcar).
2. **Templates de WhatsApp no Admin** (CRUD + persistência) + uso no Profissional.
3. Hardening de **Firestore Rules** (produção): tenant isolation + subcoleções clínicas.
4. **[PÓS-MVP]** Relatório por código de ocorrência (agregações/export).
