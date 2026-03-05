# AgendaPsi — Cadastro Completo do Paciente (Especificação)

Data: **2026-03-04**  
Painel principal: **Profissional** (com leitura subset no Portal do Paciente)

## Objetivo
Implementar **cadastro completo** do paciente com campos obrigatórios do projeto, sem perder o fluxo de **pré‑cadastro rápido** ao agendar.

## Escopo
- Profissional: criar/editar ficha completa do paciente
- Agenda: pré‑cadastro rápido ao clicar em horário vazio e completar depois
- Paciente: ver apenas subset (informativo); sem edição completa no portal

## Modelo de dados proposto (Firestore)
Coleção: `tenants/{tenantId}/patients/{patientId}`

### Campos de controle
- `createdAt`, `updatedAt` (serverTimestamp)
- `createdByUid`
- `profileStatus`: `"incomplete" | "complete"`
- `archivedAt` (opcional; se for “inativar”)

### Identificação (base)
- `fullName` (obrigatório)
- `preferredName` (opcional)
- `cpf` (opcional no MVP; pode virar obrigatório por tenant futuramente)
- `birthDate` (opcional, mas recomendado — usado para semana de aniversário)
- `gender` (opcional; enumerado)

### Contato
- `phoneE164` (recomendado; usado no WhatsApp)
- `email` (opcional)
- `address` (objeto opcional: `zip`, `street`, `number`, `district`, `city`, `state`, `country`)

### Responsável (se menor / quando aplicável)
- `legalGuardian`: { `name`, `cpf`, `phoneE164`, `relation` } (opcional)

### Observações gerais (não prontuário)
- `generalNotes` (texto curto; **não** colocar evolução/prontuário aqui)

### Portal (já existente)
- `portal.*` (preferências/aceite; permanece)

> Conteúdo clínico/sigiloso permanece fora: evolução por sessão e notas do paciente continuam em subcoleções.

## Regras de negócio
1) **Pré‑cadastro rápido**
- Mínimo: `fullName` + `phoneE164` (ou apenas `fullName` se você permitir)
- `profileStatus="incomplete"`
- Deve permitir agendar mesmo incompleto

2) **Completar cadastro**
- Ao salvar ficha completa: validar campos, normalizar CPF/telefone
- Setar `profileStatus="complete"`

3) **Exibição no agendamento**
- Mostrar `generalNotes` no overlay/detalhe
- Mostrar alerta leve se `profileStatus="incomplete"`

4) **Validação**
- CPF: validar dígitos quando preenchido
- Telefone: armazenar em E.164 quando possível
- Datas: ISO + validação (não futura para nascimento)

## Permissões e segurança
- Apenas membros do tenant (owner/admin/professional) podem criar/editar
- Portal do paciente: somente leitura subset via API (sem Firestore no client)
- Auditoria: registrar `PATIENT_CREATE`, `PATIENT_UPDATE` (sem registrar conteúdo sensível em logs)

## Critérios de aceitação (MVP)
- Criar paciente pelo pré‑cadastro na agenda e completar depois
- Persistência e leitura correta em todas as telas
- `generalNotes` aparece no agendamento
- Regras de acesso respeitadas (não-membro não acessa)

## Pós‑MVP sugerido
- Campos configuráveis por tenant (obrigatórios/opcionais)
- Atribuição de paciente a profissionais (multi‑profissional)
- Upload de documentos com LGPD e retenção

## Status de implementação

### MVP — Patch 1/3 (Backend) ✅
Aplicado em **2026-03-04**.

Inclui:
- Pré‑cadastro: **CPF opcional** (valida apenas se informado), mínimo **Nome + Celular**.
- `patients`: grava `profileStatus="incomplete"` + `profileCompleted=false` (compatibilidade).
- Índices best‑effort:
  - `patientPhoneIndex/{phoneCanonical} -> patientId`
  - `patientCpfIndex/{cpf} -> patientId` (somente quando CPF informado)
- API do Profissional (server-side):
  - `GET /api/professional/patient/profile?patientId=...`
  - `PUT /api/professional/patient/profile?patientId=...` (salva ficha e marca como completo)

### MVP — Patch 2/3 (UI Profissional) ✅
Aplicado em **2026-03-04**.

Inclui:
- Profissional (Dia/Semana): botão **“Editar cadastro”** no overlay do agendamento.
- Modal de ficha do paciente:
  - carrega via `GET /api/professional/patient/profile`
  - salva via `PUT /api/professional/patient/profile` e marca cadastro como completo
- Badge **“Cadastro incompleto”** quando `profileStatus="incomplete"` ou `profileCompleted=false`.
- Exibição de `generalNotes` no overlay do agendamento (fallback para `notes`).

Pendente (próximo patch):
- Atualizar backlog (marcar J1/J2/J3 como implementados no MVP) + revisão final de QA.

## QA mínimo (MVP)

### Fluxo Profissional — Pré-cadastro
- [ ] Em Dia e Semana, o botão de agendar não exige CPF (CPF opcional).
- [ ] Mínimo: Nome + Celular/WhatsApp.
- [ ] Paciente novo nasce com `profileStatus="incomplete"` e `profileCompleted=false`.

### Fluxo Profissional — Ficha completa
- [ ] Overlay do agendamento: botão **Editar cadastro** abre a ficha.
- [ ] `GET /api/professional/patient/profile` retorna o paciente correto do tenant.
- [ ] `PUT /api/professional/patient/profile` valida e salva; após salvar marca `profileStatus="complete"` e `profileCompleted=true`.
- [ ] CPF inválido (quando preenchido) retorna erro claro e não salva.

### Overlay do agendamento
- [ ] Exibe `generalNotes` (fallback `notes`).
- [ ] Badge **Cadastro incompleto** aparece quando `profileStatus="incomplete"` ou `profileCompleted=false`.

### Segurança
- [ ] Sem sessão do profissional: `GET/PUT /api/professional/patient/profile` retorna 401/403.
- [ ] Tenant suspenso (quando aplicável): comportamento consistente com bloqueio geral do sistema.

## Backlog atualizado

- `docs/01_REQUISITOS_BACKLOG.md` atualizado em 2026-03-04: J1/J2/J3 marcados como ✅ Implementado (MVP).