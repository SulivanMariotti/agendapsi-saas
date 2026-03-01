# 01 — Requisitos consolidados (AgendaPsi)

Atualizado: 2026-02-28

## Épicos (alto nível)
1. Fundação SaaS (multi-tenant, auth, isolamento por tenant)
2. Painéis: Admin / Profissional / Paciente
3. Agenda do Profissional (Dia/Semana/Mês + regras de horários)
4. Holds/Reservas + Agendamentos + Status (com cores)
5. Cadastro de paciente (completo + pré-cadastro rápido)
6. WhatsApp e templates
7. Prontuário por sessão + códigos de ocorrência
8. Hardening (Rules, LGPD operacional, auditoria)

## O que já foi entregue (até 2026-02-28)
- Auth com sessão server-side; índice `userTenantIndex/{uid}`.
- Seed do Firestore (tenant, paciente teste, série e ocorrências).
- Admin:
  - Configuração de schedule do AgendaPsi dentro do `/admin`.
- Profissional:
  - Visão Dia (compacta, cor suave por status, ícone de status)
  - Visão Semana (grade tipo calendário; clique no vazio abre Agendar/Reservar)
  - Visão Mês (grade mensal)
  - “Próximos horários” lista 3 opções
  - Multi-bloco + buffer aplicados

## MVP (pendências principais)
- Códigos de ocorrência (`occurrenceCodes`)
- Evolução/prontuário por sessão + histórico
- Editar recorrência: “esta ocorrência” vs “esta e futuras”
- Regras Firestore (hardening) para produção
