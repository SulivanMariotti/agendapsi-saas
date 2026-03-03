# Backlog consolidado — AgendaPsi (SaaS)

Atualizado: **2026-03-02**

## Premissas e decisões (produto)
- **CSV descartado**: não haverá importação/upload de agenda por CSV. A **fonte da verdade** é sempre o que o **Profissional** cadastra e agenda dentro do AgendaPsi.
- **Paciente**: proibido CTA de **cancelar/remarcar**. Comunicação deve reforçar compromisso/constância.
- **Separação total do Lembrete Psi**: reuso apenas de UI/código/padrões — nunca Firebase/coleções/rules/dados.

## Como ler este backlog
- Etiquetas: **[MVP]** e **[PÓS-MVP]**
- Status: **Pronto / Em andamento / Pendente**
- Cada funcionalidade lista: **Regras de negócio**, **Critérios de aceitação**, **Dependências** e **Riscos/Atenção**.

---

## ÉPICO A — Fundação do SaaS (separação, auth, tenant)
### A1 — Separação total do Lembrete Psi **[MVP]** → **Pronto**
- Regras de negócio:
  - AgendaPsi tem Firebase Project e Rules próprios.
- Critérios de aceitação:
  - Deploy/URL e Firebase do AgendaPsi não se misturam com o Lembrete Psi.
- Dependências: nenhuma.
- Riscos/Atenção: **Segurança/LGPD**.

### A2 — Auth + sessão server-side (Profissional) **[MVP]** → **Pronto**
- Regras de negócio:
  - Sessão server-side para rotas protegidas.
- Critérios de aceitação:
  - `/login` autentica e redireciona para `/profissional`.
- Dependências: Firebase Auth.
- Riscos/Atenção: Segurança (cookies, CSRF, leaks).

### A3 — Isolamento por tenant via `userTenantIndex/{uid}` **[MVP]** → **Pronto**
- Regras de negócio:
  - Sem `collectionGroup` como base de autorização.
- Critérios de aceitação:
  - Todo acesso a dados do tenant depende do índice do usuário.
- Dependências: seed/índice.
- Riscos/Atenção: Segurança (least privilege).

### A4 — Hardening completo de Rules (produção) **[PÓS-MVP]** → **Pendente**
- Regras de negócio:
  - Princípio do menor privilégio, auditoria mínima, negar por padrão.
- Critérios de aceitação:
  - Paciente não lê coleções internas; Profissional/Admin apenas no tenant.
- Dependências: modelagem final do Portal do Paciente + subcoleções clínicas.
- Riscos/Atenção: **Segurança/LGPD**.

---

## ÉPICO B — Admin (desktop)
### B1 — Schedule (ranges, almoço, buffer, slot interval) **[MVP]** → **Pronto**
- Critérios de aceitação:
  - Persistir em `tenants/{tenantId}/settings/schedule` e refletir na agenda do profissional.

### B2 — Menus + Submenus (Dashboard default) **[MVP]** → **Pronto**

### B3 — Catálogo de Códigos de Ocorrência (registro extra) **[MVP]** → **Pronto**

### B4 — Templates WhatsApp (CRUD) **[MVP]** → **Pendente**
- Regras de negócio:
  - Templates por tenant; seleção no detalhe do Profissional.
- Critérios de aceitação:
  - Admin cria/edita/exclui; Profissional seleciona no agendamento/hold.
- Dependências: Firestore + Rules + UI admin.
- Riscos/Atenção: UX (templates úteis), Segurança (expor telefone).

### B5 — Gestão avançada (cadastros, permissões finas, auditoria) **[PÓS-MVP]** → **Pendente**

---

## ÉPICO C — Agenda do Profissional (Dia/Semana/Mês)
### C1 — Dia/Semana/Mês + navegação por granularidade **[MVP]** → **Pronto**
### C2 — Status manual + cores **[MVP]** → **Pronto**
### C3 — Holds/Reservas (`isHold=true`, status travado) **[MVP]** → **Pronto**
### C4 — Multi-bloco + buffer **[MVP]** → **Pronto**
### C5 — Próximos horários (3 sugestões) **[MVP]** → **Pronto**
### C6 — Recorrência + plano (materializa ocorrências) **[MVP]** → **Pronto**
### C7 — Converter hold → agendamento (+ extensão) **[MVP]** → **Pronto**
### C8 — Reagendar recorrente (só esta vs esta e futuras) + week picker **[MVP]** → **Pronto**
### C9 — Excluir (só esta vs esta e futuras) **[MVP]** → **Pronto**
### C10 — Detalhe em overlay + abas clínicas + “Salvar alterações” unificado **[MVP]** → **Pronto**

---

## ÉPICO D — Pacientes (fonte da verdade = Profissional)
### D0 — Decisão: sem CSV (fonte da verdade = AgendaPsi) **[MVP]** → **Pronto**
- Critérios de aceitação:
  - Não existe fluxo de upload/import CSV no Admin.
  - Agenda e painel do paciente refletem somente dados criados no AgendaPsi.

### D1 — Cadastro completo do paciente no Painel do Profissional **[MVP]** → **Pendente**
- Funcionalidades:
  - Criar/editar paciente com campos obrigatórios do projeto.
  - **Pré-cadastro rápido** ao clicar em slot vazio (mínimo necessário) + **completar depois**.
  - Tela/lista “Pacientes” no painel do Profissional (não depender do Admin).
  - Exibir **observações gerais** do paciente no detalhe do agendamento.
- Regras de negócio:
  - Dados do paciente pertencem ao tenant; somente Profissional/Admin podem editar.
  - Validação de entrada/saída (telefone, data, campos obrigatórios).
- Critérios de aceitação:
  - Profissional consegue criar paciente completo sem ir ao Admin.
  - Pré-cadastro cria paciente “mínimo” e marca pendências (ex.: `isDraft`/`missingFields`).
  - Ao abrir paciente, existe CTA “Completar cadastro” (Profissional, não Paciente).
- Dependências:
  - Modelo `patients` + Rules + UI.
- Riscos/Atenção:
  - **LGPD** (dados pessoais), UX (não travar fluxo de agenda).

### D2 — Painel do Paciente (Portal) — base informativa **[MVP]** → **Em andamento**
- Funcionalidades:
  - Login do paciente (mecanismo a definir: código de acesso / link mágico / etc.).
  - Ver **próxima sessão** e **agenda** (somente leitura).
  - Sem cancelamento/remarcação; mensagens de constância.
- Regras de negócio:
  - Paciente não acessa prontuário/evolução nem dados internos do tenant.
  - Dados do portal minimizados (ex.: `patientsPortal`/API server-side).
- Critérios de aceitação:
  - Paciente entra e vê agenda real; sem qualquer CTA de alterar compromisso.
- Dependências:
  - Auth/claims role=patient + API de leitura.
- Riscos/Atenção:
  - **Segurança/LGPD** (minimização e isolamento).

### D3 — “Seu cadastro” (módulo do Paciente) — reposicionado para o topo **[MVP]** → **Pendente**
- Funcionalidades:
  - Exibir bloco “Seu cadastro” no topo do painel do paciente (ao invés de barra inferior).
  - Exibir subset de dados (nome, telefone, preferências), com leitura/edição limitada.
- Regras de negócio:
  - Paciente pode editar apenas campos permitidos (ex.: preferências, observações pessoais se aprovado).
- Critérios de aceitação:
  - Bloco aparece no topo; edição respeita regras de permissão.
- Dependências:
  - Modelagem `patientsPortal` (ou API) + Rules.
- Riscos/Atenção:
  - UX (clareza do que é editável), LGPD.

### D4 — Termo/Contrato no Paciente (visualizar + aceitar) **[MVP]** → **Pendente**
- Funcionalidades:
  - Visualizar termo vigente do tenant.
  - Aceitar (registrar `acceptedAt`, versão/hash).
- Regras de negócio:
  - Aceite é auditável; sem “obrigar” a aceitar para ver agenda (decisão de produto), mas pode bloquear recursos extras.
- Critérios de aceitação:
  - Aceite persiste e fica visível para o Profissional/Admin.
- Dependências:
  - Storage/Firestore para termo + UI paciente.
- Riscos/Atenção:
  - **LGPD/Legal**, integridade (versão do termo).

### D5 — Preferências: “Ativar lembrete” **[MVP]** → **Pendente**
- Funcionalidades:
  - Toggle para o paciente ativar/desativar lembretes.
  - Persistir preferência (mesmo que envio automático seja pós-MVP).
- Regras de negócio:
  - Preferência não deve induzir cancelamento; textos reforçam constância.
- Critérios de aceitação:
  - Toggle salva e reflete imediatamente.
- Dependências:
  - Modelagem preferências + (Pós-MVP) job/notificação.
- Riscos/Atenção:
  - UX (prometer notificação sem entregar) — avaliar feature flag.

### D6 — Anotações do paciente **[PÓS-MVP]** → **Pendente**
- Funcionalidades:
  - Paciente registra notas próprias (ex.: “o que quero levar para a sessão”).
  - Política de visibilidade a definir (somente paciente vs compartilhado com profissional).
- Regras de negócio:
  - Notas não substituem prontuário; cuidado com dados sensíveis.
- Critérios de aceitação:
  - CRUD básico; histórico.
- Dependências:
  - Modelagem + Rules + UX de consentimento.
- Riscos/Atenção:
  - **LGPD/Ética/UX** (expectativa de resposta).

### D7 — Biblioteca de artigos **[PÓS-MVP]** → **Pendente**
- Funcionalidades:
  - Admin publica artigos por tenant; paciente consome.
- Regras de negócio:
  - Conteúdo deve reforçar constância/psicoeducação; evitar tom “marketing”.
- Critérios de aceitação:
  - Lista, detalhe, marcação de leitura.
- Dependências:
  - CMS simples (Firestore/Storage) + Rules.
- Riscos/Atenção:
  - Curadoria, copyright.

### D8 — Semana de aniversário (destaque na agenda do Profissional) **[PÓS-MVP]** → **Pendente**

---

## ÉPICO E — Registros clínicos (Evolução vs Ocorrência extra)
### E1 — Evolução por sessão (texto livre) **[MVP]** → **Pronto**
### E2 — Ocorrência “extra” (código + descrição) **[MVP]** → **Pronto**
### E3 — Histórico do paciente (apresentação) **[MVP]** → **Em andamento**
- Critérios de aceitação:
  - Profissional vê histórico completo por paciente sem ruído excessivo.
- Riscos/Atenção: UX.

### E4 — Relatório por código de ocorrência **[PÓS-MVP]** → **Pendente**

---

## ÉPICO F — WhatsApp
### F1 — Botão WhatsApp no detalhe do agendamento/hold **[MVP]** → **Pronto**
### F2 — Templates WhatsApp (Admin) + seleção no Profissional **[MVP]** → **Pendente**
- Ver também: B4.
