# Admin — Estrutura de Menus (AgendaPsi)

Atualizado: **2026-03-03**

## Objetivo
Organizar o painel **/admin** em **menus + submenus**, separando:
- módulos “Lembretes” (placeholders)
- módulos “AgendaPsi” (SaaS atual)

> Importante: “Lembretes” aqui não é integração com o Lembrete Psi (agenda.msgflow.app.br). É apenas navegação/placeholder.

---

## Estrutura (sidebar)

### Menu: Dashboard
- Tab id: `dashboard`
- Comportamento: tela padrão ao abrir o Admin.

### Menu: Lembretes (submenus) — placeholders
- Agenda → `schedule`
- Presença/Faltas → `attendance`
- Histórico → `history`
- Auditoria → `audit`
- Biblioteca → `library`
- Configurações → `config`

### Menu: AgendaPsi (submenus)
- Agenda do Profissional (Schedule) → `agendapsi_schedule`
- Códigos de Ocorrência → `agendapsi_occurrence_codes`
- Portal do Paciente (Contrato + Flags) → `agendapsi_patient_portal`
- Templates WhatsApp → `agendapsi_whatsapp_templates`

### Menu: SaaS (Super Admin)
- Tenants → `saas_tenants`

### Menu: Pacientes
- Tab id: `users` (placeholder/expansão futura)

---

## Nota de segurança
Evitar listeners client do Firestore em módulos placeholder para não gerar `permission-denied`. Preferir consumo via rotas server-side.
