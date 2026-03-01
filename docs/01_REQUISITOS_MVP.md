# 01 — Requisitos do MVP (executável)

Atualizado: 2026-02-28

> Observação: este documento lista MVP + regras críticas do produto. Itens implementados devem ser marcados como ✅.

---

## 0) Regras de produto (críticas)
- Paciente **sem CTA** de cancelar/remarcar.
- Agenda do profissional é o centro do sistema (constância, rotina e clareza).
- Status manuais (Agendado, Confirmado, Finalizado, Não comparece, Cancelado, Reagendado) com **cores**.
- Edição de recorrência deve perguntar: “só esta ocorrência” vs “esta e futuras”.

---

## 1) Painel Admin (desktop)
### 1.1 Configurações da agenda (schedule) ✅
- Intervalo da grade: 30/45/60
- Horários por dia da semana
- Buffer (intervalo entre atendimentos)
- Almoço (opcional)
- Duração padrão em blocos

Persistência:
- `tenants/{tenantId}/settings/schedule`

---

## 2) Painel Profissional (mobile + desktop)
### 2.1 Visões Dia/Semana/Mês ✅
- Dia: lista compacta
- Semana: grade tipo calendário (horas + dias)
- Mês: grade mensal

### 2.2 Interações ✅/⏳
- Clique em ocupado abre detalhes e permite mudar status ✅
- Semana: clique em horário livre abre **Agendar** ou **Reservar (Hold)** ✅
- Mês: clique em dia abre Visão Dia ✅
- Mês: clique em área livre para Agendar/Reservar ⏳ (pendente)

### 2.3 Próximos horários disponíveis ✅
- Botão que lista **3 próximos** horários livres (até 30 dias)
- Ao escolher, abre o fluxo de agendar

### 2.4 Holds/Reservas ✅
- Criar hold com nome + celular
- Multi-bloco (ocupa N slots consecutivos)
- Buffer respeitado

### 2.5 Agendamento ✅
- Pré-cadastro mínimo (nome + CPF + celular) para agendar

---

## 3) Pacientes (cadastro)
### 3.1 Cadastro completo ⏳
Campos obrigatórios conforme definição do projeto (nome registro, nome social, email, data nasc, sexo biológico, gênero, celular, tel fixo, CPF, RG, estado civil, CEP/endereço etc.)

### 3.2 Pré-cadastro rápido ✅
Mínimo necessário para não travar o agendamento.

---

## 4) Prontuário por sessão (sensível) ⏳
- Observações da ocorrência
- Código de ocorrência (lista pré-cadastrada)
- Evolução/prontuário por sessão
- Histórico completo por paciente
- Progresso do plano (ex.: 4/30)

---

## 5) Segurança (MVP → produção) ⏳
- Tenant isolation (Rules) com menor privilégio
- Evitar logs com conteúdo clínico
- Trilhas mínimas (auditoria operacional)
