# 01 — Requisitos do MVP (AgendaPsi)

Atualizado: **2026-03-02**

## Objetivo do MVP
Entregar o fluxo completo do profissional e o **portal do paciente informativo**:
- configurar agenda (Admin)
- visualizar agenda (Dia/Semana/Mês)
- criar agendamento e hold com recorrência
- reagendar e excluir (escopo: só esta vs futuras)
- registrar evolução da sessão (texto livre) e ocorrências extra (código+descrição)
- **cadastrar pacientes (completo + pré-cadastro rápido) no painel do Profissional**
- **paciente ver sua agenda (somente leitura)**, sem cancelar/remarcar
- manter separação total do Lembrete Psi

---

## MVP — Itens incluídos
### Admin
- Schedule (intervalo, buffer, almoço, ranges por dia)
- Dashboard default e menus/submenus
- Catálogo de códigos de ocorrência (para “registro extra”)

### Profissional — Agenda
- Dia/Semana/Mês + navegação por granularidade
- Agendar/Hold (multi-bloco, buffer) + Próximos horários (3)
- Recorrência e plano (até 30 + manual)
- Converter hold → agendamento (+ extensão)
- Reagendar (só esta vs futuras) com week picker
- Excluir (só esta vs futuras)
- Detalhe em overlay + abas clínicas + “Salvar alterações” unificado
- WhatsApp no detalhe (mensagem reforçando presença/constância)

### Profissional — Pacientes
- Cadastro completo do paciente (campos obrigatórios do projeto)
- Pré-cadastro rápido a partir da agenda + completar depois
- Observações gerais do paciente visíveis no detalhe do agendamento

### Paciente — Portal (informativo, sem CTA de cancel/remarca)
- Ver próxima sessão + próximos agendamentos (somente leitura)
- “Seu cadastro” visível (subset de dados) — sem editar o que for clínico/sensível
- Termo/Contrato: visualizar + aceitar (auditável)

### Registros
- Evolução por sessão (texto livre) armazenada no paciente e referenciada pelo agendamento
- Ocorrência extra (código+descrição), armazenada na ocorrência e espelhada no paciente

---

## MVP — Fora do escopo (Pós-MVP)
- Biblioteca de artigos
- Anotações do paciente (definir política de visibilidade/consentimento)
- Envio automático de lembretes (FCM/email/WhatsApp programado) — no MVP apenas preferência, se habilitada
- Templates WhatsApp (Admin) + preenchimento automático no Profissional (se não entrar no MVP)
- Relatórios por código de ocorrência
- Hardening completo de Rules para produção (além do mínimo necessário)
