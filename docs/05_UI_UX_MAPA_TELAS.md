# UI/UX — Mapa de telas (AgendaPsi)

Atualizado: **2026-03-04**

## 1) Admin (/admin)
### Sidebar (Menus + Submenus)
- **Dashboard** (default)
- **Lembretes** (placeholders)
  - Agenda
  - Presença/Faltas
  - Histórico
  - Auditoria
  - Biblioteca
  - Configurações
- **AgendaPsi**
  - Agenda do Profissional (Schedule)
  - Códigos de Ocorrência (catálogo)
- **Pacientes** (placeholder / evolução futura)

> Importante: “Lembretes” aqui é apenas estrutura de navegação; não integra com o Firebase do Lembrete Psi.

---


## 1.5 Admin do tenant (/admin-tenant)
- **Quem acessa:** `owner/admin` do tenant.
- **Escopo:** configurações do tenant (Agenda do Profissional, Códigos de Ocorrência, Portal do Paciente, Templates WhatsApp).

---

## 2) Profissional (/profissional)
### Header (Agenda do Profissional) — Variante A (Clean Premium)
- **Fixo (sticky)** nas visões **Dia / Semana / Mês**.
- Estrutura em **2 camadas**:
  - **Camada 1 (sempre visível):**
    - **Período em destaque** (clicável) → abre “Ir para data” (date picker).
    - Navegação central: **Anterior / Hoje / Próximo**.
    - Ações à direita:
      - **+ Novo** (menu: Agendar / Hold)
      - **Próximo atendimento** (Dia/Semana)
      - **Ir para agora** (Dia/Semana) — aparece **somente** quando a tela está longe do horário atual (~>2h).
      - **Buscar** (ícone) e **Sair**.
  - **Camada 2 (colapsável no scroll):**
    - Toggle **Dia / Semana / Mês**.
    - **Busca de paciente nesta visão** (2+ letras → dropdown).
    - Badges: **Confirmados / Agendados / Holds**:
      - **clicáveis** (filtro rápido); itens fora do filtro ficam **apagados** (não somem).
      - chip **“Filtro ativo ×”** para limpar.

**Regras de comportamento**
- Busca:
  - **Dia:** selecionar paciente abre o detalhe do agendamento.
  - **Semana/Mês:** selecionar paciente navega para o dia correspondente (pode abrir o detalhe, se desejado, em refinamento futuro).
- Visão Dia:
  - Não repetir data/“Horários do dia” abaixo do header (header já contém o contexto).
- Consistência:
  - Mesma largura visual (container `max-w-7xl`) em Dia/Semana/Mês.

### Navegação
- Botões de visão: **Dia / Semana / Mês**
- Avançar/retroceder por granularidade (próximo/anterior dia, semana, mês)

### Cabeçalho (sticky)
- O cabeçalho da Agenda do Profissional fica **fixo (sticky)** quando houver rolagem, nas visões **Dia / Semana / Mês**.
- Padrão visual: fundo branco com leve transparência/blur + borda inferior/sombra sutil para separar do conteúdo.
- Deve respeitar `safe-area` em mobile (topo), evitando sobrepor notch.

### Visão Dia
- Grade por slots
- Ações: agendar/hold, detalhes, excluir, reagendar

### Visão Semana
- Grade semanal com blocos posicionados
- Clique em horário livre → Agendar ou Reservar (Hold)
- Clique em item → detalhes

### Visão Mês
- Grade mensal com itens compactos por dia
- Clique em **área livre do dia** → modal “Ações do dia”
- Clique no **número do dia** → abre Dia

### Detalhe do agendamento/hold
- Card principal (status / ações)
- Card lateral “Resumo do paciente”
- Registros:
  - Evolução por sessão (texto livre)
  - Ocorrência extra (código + descrição) + histórico recente

---

## 3) Paciente (a implementar)
- Visualizar agendamentos e informações essenciais.
- Proibido CTA cancelar/remarcar.


### Agenda do Profissional — Header (Variante A / Premium)
- Sticky (Camada 1 sempre visível)
- Camada 2 colapsa no scroll (reabre ao focar busca)
- **Seletor de data:** clique no período para abrir input de data e navegar mantendo a visão (day/week/month).

- Agenda (Profissional): Header Variante A (Clean Premium)
  - Camada 1 sticky: período (clicável), navegação, +Novo, busca (ícone), sair.
  - Camada 2 colapsável: toggle Dia/Semana/Mês, busca (input), badges coloridos (Confirmados/Agendados/Holds).
  - Dia: conteúdo não repete data/título abaixo do header.

## Agenda do Profissional — UX

- Linha **Agora** (Dia/Semana): indicador horizontal do horário atual.
- Ação **Ir para agora** no header (Dia/Semana): aparece apenas quando você estiver longe do horário atual (ex.: > 2h) e rola a tela até o indicador.

## Agenda do Profissional — Header (Variante A)

- Botão **Próximo atendimento** (Dia/Semana): rola para o próximo agendamento/hold a partir do horário atual e abre o detalhe.
