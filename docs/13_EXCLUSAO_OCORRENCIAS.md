# Exclusão de agendamentos e reservas (Profissional)

Atualizado: **2026-03-02**

## Objetivo
Permitir excluir um **agendamento** ou uma **reserva/hold** liberando o horário na agenda, com escolha de escopo:

- **Excluir somente esta ocorrência**
- **Excluir esta e todas as futuras** (quando recorrente)

---

## Regras de negócio
1. Sempre confirmar o escopo (somente esta vs futuras).
2. A exclusão afeta **apenas a agenda** (uso de data/horário).
3. **Não apagar** histórico do paciente:
   - evolução/prontuário por sessão
   - ocorrências “extra” (registro estruturado)

---

## Escopo técnico (MVP)
- Quando multi-bloco:
  - excluir remove o grupo todo (`groupId`) para liberar todos os slots.
- “Esta e futuras”:
  - remove ocorrências futuras da série (a partir do `sessionIndex` selecionado).
  - operação deve ser consistente (preferir batch/transaction no server).
- UI:
  - botão Excluir disponível no detalhe do agendamento/hold.

---

## Checklist de validação
- [ ] Excluir “só esta” remove apenas aquela sessão (incluindo blocos).
- [ ] Excluir “esta e futuras” remove todas as sessões futuras da série.
- [ ] Após excluir, horários ficam disponíveis para agendar/hold.
- [ ] Evolução e ocorrência extra do paciente permanecem consultáveis pelo paciente/profissional (quando implementado).
