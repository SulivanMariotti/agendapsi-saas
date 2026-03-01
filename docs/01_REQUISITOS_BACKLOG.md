# Backlog consolidado — AgendaPsi (SaaS)

Atualizado: **2026-02-28**

## Como ler este backlog
- Cada item tem etiqueta: **[MVP]** ou **[PÓS-MVP]**.
- Status: **Pronto / Em andamento / Pendente**.
- Quando houver risco relevante: **LGPD / Segurança / UX / Performance**.

---

## ÉPICO A — Fundação do SaaS (separação, auth, tenant)

### A1) Separação total do Lembrete Psi (decisão crítica)
- **Tipo:** regra de produto/arquitetura
- **Etiqueta:** [MVP]
- **Status:** **Pronto (decisão documentada)**
- **Regras de negócio**
  - AgendaPsi (agendapsi.msgflow.app.br) é **novo sistema**.
  - Reuso permitido: **somente código/UI/lógica/padrões**.
  - Reuso proibido: Firebase Project/Firestore/Rules/deploy/URL do Lembrete Psi.
- **Critérios de aceitação**
  - Projeto Firebase do AgendaPsi é independente.
  - Rules e coleções do AgendaPsi são próprias.
- **Riscos/atenção:** Segurança (evitar “atalhos” que misturem dados).

### A2) Multi-tenant + isolamento por tenant
- **Etiqueta:** [MVP]
- **Status:** **Em andamento (base pronta)**
- **Dependências:** A3 (auth/sessão) + Rules (ÉPICO H)
- **Regras de negócio**
  - Dados sempre em `tenants/{tenantId}/...`.
  - Resolução canônica via `userTenantIndex/{uid}` (sem `collectionGroup`).
- **Critérios de aceitação**
  - Usuário autenticado só acessa tenant do seu índice.
  - Toda query/rota usa `tenantId` resolvido no servidor.
- **Riscos/atenção:** Segurança.

### A3) Autenticação + sessão server-side
- **Etiqueta:** [MVP]
- **Status:** **Em andamento (funcionando)**
- **Regras de negócio**
  - Cookie httpOnly de sessão.
  - Rotas protegidas por role.
- **Critérios de aceitação**
  - `/login` → autentica → redireciona.
  - `/profissional` inacessível sem sessão válida.
- **Riscos/atenção:** Segurança.

---

## ÉPICO B — Painéis (Admin / Profissional / Paciente)

### B1) Painel Profissional (mobile + desktop)
- **Etiqueta:** [MVP]
- **Status:** **Em andamento (visão Dia pronta)**
- **Dependências:** C1 (settings schedule) para Semana/Mês com regras reais
- **Funcionalidades**
  - Visões: Dia / Semana / Mês.
  - Navegação por granularidade (próximo/anterior dia/semana/mês).
- **Critérios de aceitação**
  - Trocar visão altera comportamento dos botões de navegação.
- **Riscos/atenção:** UX ("1 olhar e pronto"), Performance em Semana/Mês.

### B2) Painel Admin (desktop completo)
- **Etiqueta:** [MVP]
- **Status:** **Pendente**
- **Dependências:** A2/A3, H1 (rules), C1 (settings)
- **Regras de negócio**
  - Reuso do template do Admin do Lembrete Psi (somente código/UI/padrões) dentro do AgendaPsi.
- **Funcionalidades (módulos)**
  - Tenants
  - Usuários/membership
  - Pacientes (cadastro completo)
  - Agenda (séries/ocorrências/holds)
  - Catálogos (códigos de ocorrência, templates WhatsApp)
  - Settings de agenda
- **Critérios de aceitação**
  - Admin consegue operar o essencial sem acessar Firestore manualmente.
- **Riscos/atenção:** Segurança (operações críticas), LGPD (dados sensíveis).

### B3) Painel Paciente (sem CTA de cancelar/remarcar)
- **Etiqueta:** [PÓS-MVP]
- **Status:** **Pendente**
- **Regras de negócio**
  - Sem CTA de cancelar/remarcar.
  - Comunicação compatível com constância do cuidado.
- **Critérios de aceitação**
  - Não existe botão/atalho de cancelamento/remarcação.
- **Riscos/atenção:** UX + Ética do produto.

---

## ÉPICO C — Configuração de agenda e regras de grade

### C1) Settings de agenda (`tenants/{tenantId}/settings/schedule`)
- **Etiqueta:** [MVP]
- **Status:** **Pendente**
- **Funcionalidades**
  - Horários por dia da semana.
  - `slotInterval`: 30/45/60.
  - `sessionDurationMin` (duração padrão).
  - `bufferMin`.
  - `lunchBreak` (opcional).
- **Regras de negócio**
  - A grade é o “relógio” do sistema.
  - Agendamento/hold pode ocupar **múltiplos blocos consecutivos**.
- **Critérios de aceitação**
  - Alterar `slotInterval` re-renderiza grade corretamente.
  - Criar item de 2+ blocos só é permitido se os próximos blocos estiverem livres.
- **Riscos/atenção:** UX (clareza), Performance (renderização).

### C2) Bloqueio de continuação (multi-bloco)
- **Etiqueta:** [MVP]
- **Status:** **Pronto (no Dia)**
- **Critérios de aceitação**
  - Criar hold/agendamento de 2 blocos bloqueia o(s) próximo(s) slot(s).

### C3) Encontrar próximo horário disponível
- **Etiqueta:** [MVP]
- **Status:** **Pendente**
- **Dependências:** C1 (settings), D1 (ocorrências), C2 (multi-bloco)
- **Regras de negócio**
  - Respeitar: horários, almoço, buffer, holds e agendamentos.
- **Critérios de aceitação**
  - Retorna o primeiro slot realmente viável para a duração desejada.
- **Riscos/atenção:** Performance (busca eficiente), UX (resultado confiável).

---

## ÉPICO D — Agendamentos, séries, ocorrências e edição

### D1) Série + ocorrências
- **Etiqueta:** [MVP]
- **Status:** **Pronto/Em andamento (seed existe)**
- **Critérios de aceitação**
  - Série materializa ocorrências.

### D2) Status manual + cores
- **Etiqueta:** [MVP]
- **Status:** **Em andamento (base pronta)**
- **Status suportados**
  - Agendado, Confirmado, Finalizado, Não comparece, Cancelado, Reagendado
- **Critérios de aceitação**
  - Alterar status aplica ao grupo inteiro (multi-bloco).

### D3) Editar recorrência: “só esta ocorrência” vs “esta e futuras”
- **Etiqueta:** [MVP]
- **Status:** **Pendente**
- **Regras de negócio**
  - Fluxo obrigatório ao editar ocorrência de série.
- **Critérios de aceitação**
  - Modal aparece sempre que a ocorrência pertence a uma série.

### D4) Reservas/Holds com replicação limitada
- **Etiqueta:** [MVP]
- **Status:** **Em andamento (hold existe; replicação 15 dias a validar)**
- **Regra de negócio**
  - Replicação/recorrência de holds limitada a **15 dias**.

---

## ÉPICO E — Prontuário por sessão e histórico do paciente

### E1) Códigos de ocorrência (`occurrenceCodes`)
- **Etiqueta:** [MVP]
- **Status:** **Pendente**
- **Critérios de aceitação**
  - Profissional seleciona código (código + descrição) em cada ocorrência.
- **Riscos/atenção:** LGPD (uso no prontuário).

### E2) Observações e evolução/prontuário por sessão
- **Etiqueta:** [MVP]
- **Status:** **Pendente**
- **Critérios de aceitação**
  - Ocorrência salva observação e evolução.
  - Profissional acessa histórico completo do paciente.
- **Riscos/atenção:** LGPD + Segurança.

### E3) Progresso do plano “4/30”
- **Etiqueta:** [MVP]
- **Status:** **Pendente**
- **Dependências:** D1 (ocorrências), regra de contagem por status
- **Critérios de aceitação**
  - Exibe realizadas / total planejado.

---

## ÉPICO F — Cadastro do paciente (completo + pré-cadastro)

### F1) Cadastro completo (campos obrigatórios)
- **Etiqueta:** [MVP]
- **Status:** **Pendente**
- **Regra de negócio**
  - Observações gerais do paciente aparecem na visão do agendamento.
- **Riscos/atenção:** LGPD.

### F2) Pré-cadastro rápido ao clicar em horário vazio
- **Etiqueta:** [MVP]
- **Status:** **Em andamento (base pronta)**
- **Regra de negócio**
  - Criar paciente com mínimo (ex.: nome + CPF) e completar depois.

---

## ÉPICO G — WhatsApp do Profissional

### G1) Botão WhatsApp em agendamentos e holds + templates
- **Etiqueta:** [MVP]
- **Status:** **Em andamento (base pronta)**
- **Critérios de aceitação**
  - Abre WhatsApp com mensagem pre-preenchida.
- **Riscos/atenção:** UX (mensagens corretas), LGPD (evitar texto sensível por padrão).

---

## ÉPICO H — Segurança, Rules e hardening

### H1) Firestore Rules (tenant isolation + mínimo privilégio)
- **Etiqueta:** [MVP]
- **Status:** **Pendente (precisa hardening final)**
- **Critérios de aceitação**
  - Não existe leitura/escrita cross-tenant.
  - Writes validam role mínima.
- **Riscos/atenção:** Segurança + LGPD.

### H2) Operações críticas server-side
- **Etiqueta:** [MVP]
- **Status:** **Pendente**
- **Escopo**
  - Materialização de ocorrências futuras.
  - Unicidade de CPF por tenant.
  - Gating por plano (trial/active/past_due/expired).
- **Riscos/atenção:** Segurança + consistência.
