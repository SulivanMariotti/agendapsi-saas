# Hardening final — Firestore Rules + Portal do Paciente (MVP)

Data: 2026-03-03

## Objetivo

- Consolidar **Firestore Rules** em modelo **multi-tenant** (`tenants/{tenantId}/...`) com **menor privilégio**.
- Garantir que o **Portal do Paciente** permaneça **server-side only** (Admin SDK), e que um token `role="patient"` **não tenha superfície** via Rules.
- Respeitar flags do tenant em `tenants/{tenantId}/settings/patientPortal`:
  - `libraryEnabled`
  - `notesEnabled`
  - `remindersEnabled` (**módulo**)

## Decisões

### 1) Paciente não acessa Firestore no client

- Rules não concedem permissões para `role="patient"`.
- O portal consome dados via `/api/paciente/*` com validação de token + origem + rate limit.

### 2) Separação “módulo de lembretes” vs “preferência do paciente”

- `settings/patientPortal.remindersEnabled`: **habilita/desabilita o módulo** (tenant).
- `patients/{patientId}.portal.remindersEnabled`: **preferência do paciente** (opt-in/out).
- APIs retornam:
  - `portal.features.remindersModuleEnabled`
  - `portal.features.remindersEnabled` (preferência efetiva)

### 3) Notes respeitam flag por tenant

- `/api/paciente/notes` retorna `{"disabled": true}` quando `notesEnabled=false` no tenant.

## Checklist de validação

- [ ] Deploy do `firestore.rules` sem erros.
- [ ] Profissional (tenant member) continua lendo/escrevendo agenda, pacientes, séries/ocorrências.
- [ ] Portal do paciente:
  - [ ] Se `notesEnabled=false`, anotações ficam indisponíveis (API responde disabled).
  - [ ] Se `remindersEnabled=false`, toggle some do header e API força `remindersEnabled=false`.
  - [ ] Biblioteca respeita `libraryEnabled=false` (já retornava disabled).
