# Painel do Profissional — UI (MVP)

Atualizado: **2026-03-02**

## Rotas
- `/login`
- `/profissional` (Dia por padrão)
- `/profissional?view=week&date=YYYY-MM-DD`
- `/profissional?view=month&date=YYYY-MM-DD`

---

## Padrões de UI (consistência)
- Botões de visão sempre na ordem: **Dia / Semana / Mês**.
- Clique em bloco **ocupado** → abre detalhes.
- Detalhes abrem em **overlay** (tela por cima) com ícone de **Fechar (X)** no header. A agenda fica limpa quando nada está selecionado.
- Se houver alterações pendentes no detalhe, fechar solicita confirmação para descartar.
- Dentro do detalhe, “Registros clínicos” ficam em abas: **Evolução** / **Ocorrências (extra)** (evita rolagem excessiva).
- Rodapé do overlay concentra ações: **Reagendar**, **Excluir** (ícone) e **Salvar alterações**.
- WhatsApp no detalhe: **Template** compacto + botão **verde** com **logo branco transparente** (asset em `/public/brands/whatsapp-white.png`).
- Topo do detalhe é compacto: no **header** (mesma linha do **X**) aparecem chips informativos (ex.: **Atendimento**, **Plano**, **Status** / ícone de **Cancelado**).
- Edição no detalhe é confirmada com **um único botão**: **Salvar alterações** no rodapé (status + evolução + ocorrência extra em rascunho).
- Após salvar **Ocorrência (extra)**, o rascunho é limpo automaticamente (código volta para “Selecione…”), evitando ficar preso em “alterações pendentes”.
- “Histórico recente (evolução)” não aparece no detalhe (menos ruído na rotina).
- Clique em horário/dia **livre** → abre fluxo de Agendar/Reservar.
- **Hold**:
  - cor cinza
  - status travado até converter
- Progresso do plano aparece como `x/total` quando existir.

---

## Funcionalidades atuais ✅

### Visão Dia
- Slots conforme schedule (intervalo + ranges por weekday + almoço).
- Multi-bloco + buffer.
- Detalhes (agendamento/hold) abrem em overlay com ícone **X**.
- Ações:
  - horário livre: Agendar / Reservar (hold)
  - item: detalhes + reagendar + excluir

### Visão Semana
- Clique em horário livre → modal com Agendar / Reservar (hold)
- Detalhes em overlay com Resumo do paciente (WhatsApp + observações)

### Visão Mês
- Itens compactos (fundo na cor do status).
- Clique em **área livre do dia** → “Ações do dia”:
  - Agendar
  - Reservar (Hold)
  - Abrir no Dia
  - Abrir Semana
- Clique no **número do dia** → abre Dia

### Reagendar (recorrente)
- “Só esta” vs “Esta e futuras”
- Week picker seg→dom

### Excluir
- “Só esta” vs “Esta e futuras”
- Libera horário na agenda

---

## Registros do paciente (MVP atual)
- **Evolução da sessão**: texto livre, salva no paciente com referência da sessão.
- **Ocorrência (extra)**: código + descrição, salva na ocorrência e espelha no paciente.