# 05 — UI/UX: mapa de telas e navegação (MVP)

---

## 1) Painel Admin (desktop)
### 1.1 Navegação sugerida (menu lateral)
- **Agenda**
- **Pacientes**
- **Prontuários**
- **Reservas**
- **Códigos de ocorrência**
- **Templates WhatsApp**
- **Configuração da agenda**
- **Perfil (CRP)**
- **Plano/Trial**

### 1.2 Telas-chave
- Agenda (Dia/Semana/Mês) com criação/edição avançada
- Paciente (cadastro completo)
- Prontuário do paciente (linha do tempo por sessão)
- Catálogos (códigos/templates)
- Configuração de agenda (horários/duração/buffer/almoço)

---

## 2) Painel Profissional (mobile + desktop)
### 2.1 Foco
- Operação rápida: ver agenda do dia, marcar status, registrar evolução, WhatsApp.

### 2.2 Telas-chave
- Agenda (Dia como padrão; Semana/Mês disponíveis)
- Detalhe da ocorrência (status, código, observação, evolução)
- Criar agendamento (selecionar paciente existente ou pré-cadastro)
- Criar reserva (nome + celular, replicar até 15 dias)
- Próximo horário livre (navega e destaca o slot)

### 2.3 Elementos obrigatórios no slot (base na referência)
- Coluna/área à esquerda com ações rápidas
- Hora e duração
- Nome/resumo do paciente
- Cor por status
- Marca “semana do aniversário” quando aplicável
- Botão WhatsApp (com menu de templates)

---

## 3) Painel do Paciente (mobile)
- Lista de próximas sessões (somente leitura).
- Conteúdos (diário/leituras/contrato) no padrão do Lembrete, sem CTA de cancelar/remarcar.
- **Lembretes/Notificações** (push) reaproveitando a base do Lembrete Psi, agora disparados a partir dos agendamentos (ocorrências).

---

## 4) Componentes e padrões
- Modal “horário vago”:
  - (A) Selecionar paciente existente
  - (B) Pré-cadastro (Nome + CPF) e agendar
  - (C) Criar reserva (nome + celular)
- Modal “editar recorrente”:
  - (A) Somente esta ocorrência
  - (B) Esta e futuras a partir desta
- Menu WhatsApp:
  - lista de templates (assuntos diversos) → abrir WhatsApp já com texto

---

## 5) Itens em aberto (UI)
- Definir mapa de cores por status (padrão clínico/minimalista).
- Definir forma de marcação de aniversário (ícone, tag ou destaque discreto).


---

## 6) Profissional — Visões (query param)
Rota base:
- `/profissional`

Parâmetros:
- `?view=day` (padrão)
- `?view=week`
- `?view=month`
- `&date=YYYY-MM-DD` (âncora de navegação)

Comportamento:
- Clique em bloco ocupado → abre detalhes/edição.
- Semana: clique em horário livre → abre escolha Agendar/Reservar.
- Mês: clique em dia → abre Visão Dia; clique em item → abre detalhes.
