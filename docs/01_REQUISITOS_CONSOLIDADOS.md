# 01 — Requisitos consolidados (AgendaPsi)

Atualizado: **2026-03-02**

## Decisões e premissas (produto)
- **Fonte da verdade**: AgendaPsi (ações do **Profissional**). **CSV descartado** (sem upload/import).
- **Paciente**: sem CTA cancelar/remarcar; foco em compromisso/constância.
- **Separação total do Lembrete Psi**: reuso apenas de UI/código, jamais Firebase/coleções/rules/dados.

## Épicos (alto nível)
1. Fundação SaaS (multi-tenant, auth, isolamento por tenant)
2. Painéis: Admin / Profissional / Paciente
3. Agenda do Profissional (Dia/Semana/Mês + regras de horários)
4. Holds/Reservas + Agendamentos + Status + Recorrência + Reagendar + Excluir
5. **Pacientes (Profissional)**: cadastro completo + pré-cadastro rápido + completar depois
6. **Portal do Paciente**: agenda (somente leitura) + “Seu Cadastro” + Termo/Contrato + Preferências de lembretes
7. WhatsApp e templates
8. Registros clínicos:
   - **Evolução por sessão (texto livre)**
   - **Ocorrência (registro extra com código)**
9. Hardening (Rules, LGPD operacional, auditoria mínima)
10. Relatórios (Pós-MVP): relatório por **código de ocorrência**
11. Conteúdos do paciente (Pós-MVP): biblioteca de artigos + anotações do paciente

---

## Regras de negócio essenciais
- **Paciente**: proibido CTA de cancelar/remarcar; comunicação reforça presença/constância.
- **Agendamento**: multi-bloco, buffer, conflitos atômicos em recorrência.
- **Edição de recorrente**: “só esta ocorrência” vs “esta e futuras”.
- **Registros clínicos**:
  - Evolução (texto livre) por sessão (docId=occurrenceId).
  - Ocorrência “extra” estruturada (código+descrição) na ocorrência + espelho no paciente.
- **Segurança/LGPD**:
  - Menor privilégio por padrão.
  - Paciente não acessa dados clínicos e não navega o Firestore interno do tenant.
