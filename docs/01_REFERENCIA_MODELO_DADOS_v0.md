# AgendaPsi — Modelo de Dados (v0)

## Princípios
- Firestore NoSQL com denormalização consciente (sem joins).
- IDs consistentes (evitar duplicidade).
- createdAt/updatedAt com serverTimestamp quando aplicável.
- Separação de painéis por regras de permissão (não por “mistura” de coleções).

## Entidades (alto nível)
1) Profissional (psicólogo)
2) Paciente
3) AgendaConfig (horários de funcionamento, duração, buffer, almoço)
4) Appointment (Agendamento)
5) Occurrence (Ocorrência de um agendamento recorrente)
6) Hold/Reservation (reserva/segurar horário antes de vincular paciente)
7) OccurrenceCodes (lista pré-cadastrada de códigos + descrição)
8) Audit/Logs (mínimo e sem dados sensíveis)

## Regras de modelagem (MVP)
- Agendamento e Paciente são entidades separadas.
- Recorrência deve permitir editar:
  - só esta ocorrência
  - esta e futuras
- Cada ocorrência guarda:
  - status manual
  - notas/observações + occurrenceCode
  - evolução/prontuário da sessão
- Progresso do plano: exibir realizadas/total planejado (ex: 4/30)

## Pendências para detalhar
- Chave/ID canônica de paciente (ex.: patientId + doc/CPF normalizado).
- Denormalizações necessárias para performance na visão Mês/Semana.
- Estratégia de “find next available slot”.