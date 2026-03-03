# UI/UX — Mapa de telas (AgendaPsi)

Atualizado: **2026-03-02**

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

## 2) Profissional (/profissional)
### Navegação
- Botões de visão: **Dia / Semana / Mês**
- Avançar/retroceder por granularidade (próximo/anterior dia, semana, mês)

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
