# 04 — Roles, Permissões e Regras (MVP)

---

## 1) Roles
- **owner** (profissional dono do tenant) — no MVP é o próprio psicólogo.
- **professional** (futuro) — se um dia houver mais de 1 profissional por tenant.
- **patient** — acesso somente ao painel do paciente (mobile).

---

## 2) Painéis e permissões
### 2.1 Admin (desktop)
- CRUD de pacientes (cadastro completo).
- CRUD de séries e ocorrências (inclui rematerialização futura).
- CRUD de reservas/holds.
- CRUD de catálogos (códigos de ocorrência e templates WhatsApp).
- Configuração de agenda (horários/duração/buffer/almoço).
- Visão de SaaS (trial/planStatus) e bloqueios.

### 2.2 Profissional (mobile/desktop)
- Visualizar agenda Dia/Semana/Mês.
- Criar agendamento a partir de slot vago (inclui pré-cadastro rápido).
- Criar reserva/hold (nome + celular) e replicar até 15 dias.
- Atualizar status da ocorrência.
- Registrar evolução/prontuário e observações/código.
- WhatsApp (atalho) com templates.

### 2.3 Paciente (mobile)
- Somente leitura de agenda confirmada/próximas sessões.
- Sem cancelar/remarcar.
- Interações (se ativadas): “Eu vou”, “Cheguei” (definir depois).

---

## 3) SaaS gating (trial e pagamento)
Estados:
- `trial | active | past_due | expired`

Regras:
- Se `past_due` ou `expired`:
  - bloquear rotas de **escrita** (criar/editar séries/ocorrências/reservas/pacientes/alterar configs)
  - leitura: permitido (decidir política final para paciente e profissional)

---

## 4) Regras clínicas/UX
- No painel do paciente:
  - não mostrar atalhos que facilitem cancelamento/remarcação
- WhatsApp:
  - é atalho **para o profissional** (não para o paciente).

---

## 5) Segurança (mínimo)
- Firestore Rules devem garantir:
  - usuário autenticado
  - pertence ao tenant
  - role permite a operação
  - `tenantId`/path sempre respeitado
- Operações sensíveis (no futuro):
  - geração de ocorrências
  - enforcement de unicidade de CPF
  - gating do plano
  → preferir backend server-side (Admin SDK) + logs.

---

## 6) Observações de implementação
- Firebase config (NEXT_PUBLIC) não é segredo; segurança real vem de Rules + Auth.
- Não usar CPF como ID do doc (evitar enumeração); usar ID aleatório + verificação de unicidade.


---

## 3) Regras específicas: Schedule (Agenda do profissional)
- **Somente `owner/admin`** pode alterar `tenants/{tenantId}/settings/schedule`.
- O Profissional consome a configuração e não altera (no MVP).

Validação:
- Tentar gravar schedule sem role admin deve retornar 403.
