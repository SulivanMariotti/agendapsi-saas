# Roles e regras (produto) — AgendaPsi

Atualizado: **2026-03-02**

## 1) Painéis
1. **Admin** (desktop completo)
2. **Profissional** (mobile + desktop, otimizado para rotina)
3. **Paciente** (sem CTA de cancelar/remarcar)

---

## 2) Roles (autorização)
### Admin / Owner
- Configura schedule.
- Configura catálogos (ex.: códigos de ocorrência).
- Pode gerir usuários do tenant.

### Profissional
- Opera agenda:
  - criar agendamentos e holds
  - alterar status (exceto hold)
  - reagendar e excluir (com escolha: só esta vs futuras)
- Opera registros clínicos:
  - evolução por sessão (texto livre)
  - ocorrências extra (código + descrição)

### Paciente (MVP)
- Somente leitura dos próprios agendamentos (quando implementado).
- Sem ações de cancelar/remarcar.

---

## 3) Regras críticas
- **Hold** (`isHold=true`):
  - status travado
  - UI em cinza
- **Recorrência**:
  - sempre perguntar “só esta” vs “esta e futuras”
  - operações atômicas (sem aplicar parcialmente)
- **Excluir agendamento/hold**:
  - libera horário
  - não apaga histórico clínico do paciente
- **WhatsApp**:
  - mensagens devem reforçar presença/constância (sem CTA de cancelamento)
