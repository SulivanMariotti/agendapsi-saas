# Cadastro completo do paciente (Painel do Profissional) — MVP

Atualizado: **2026-03-02**

## Objetivo
O **AgendaPsi** tem como **fonte da verdade** o painel do **Profissional**:
- o profissional cadastra/edita pacientes
- o profissional agenda e mantém as sessões
- o painel do paciente é **somente leitura** (sem cancelar/remarcar)

Este documento define o **cadastro completo do paciente** no Painel do Profissional (MVP).

---

## Escopo MVP
### Onde fica
- A partir do detalhe do agendamento (overlay), botão **Cadastro** abre:
  - `/profissional/pacientes/{patientId}?returnTo=...`

### Campos (MVP)
**Obrigatórios para marcar `profileCompleted=true`:**
- `fullName`
- `cpf` (11 dígitos)
- `mobile` (10/11 dígitos)
- `birthDate` (YYYY-MM-DD)  
  - e `birthMonthDay` é derivado (MM-DD) para destaque de “semana de aniversário”

**Opcionais no MVP:**
- `email`
- `gender`
- `occupation`
- `notes` (observações gerais visíveis no detalhe do agendamento)
- `address` (CEP/rua/número/complemento/bairro/cidade/UF)
- `emergency` (nome/celular/relação)

---

## Regras de negócio
- **Fonte da verdade**: dados do paciente vivem em `tenants/{tenantId}/patients/{patientId}`.
- **Atualização** feita por API server-side (Admin SDK):
  - `PATCH /api/professional/patient/update`
- A API calcula `profileCompleted` após merge com o documento atual.
- O painel do paciente **não** tem acesso a esses campos completos por padrão (LGPD).  
  Ele usa “portal seguro” (Pós/MVP) para expor apenas subset.

---

## Critérios de aceitação (MVP)
- [ ] No detalhe do agendamento, existe botão **Cadastro** quando `patientId` existe.
- [ ] Ao abrir `/profissional/pacientes/{patientId}`, o formulário carrega com os dados atuais.
- [ ] Ao salvar:
  - [ ] validações mínimas de CPF/celular funcionam
  - [ ] `updatedAt` é atualizado
  - [ ] `birthMonthDay` é atualizado quando `birthDate` muda
  - [ ] `profileCompleted` muda para `true` quando campos obrigatórios estiverem preenchidos
- [ ] Voltar retorna ao `returnTo` (agenda no mesmo dia/visão)

---

## Pós-MVP (planejado)
- Lista de pacientes no painel do profissional (`/profissional/pacientes`)
- Histórico e resumo no cadastro:
  - progresso do plano 4/30
  - sessões recentes
- Campos adicionais “do projeto” se forem necessários (com validação e LGPD)
