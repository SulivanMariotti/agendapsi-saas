# Segurança e Firestore Rules — AgendaPsi (SaaS)

Atualizado: **2026-03-02**

## 1) Objetivo
Garantir:
- **isolamento por tenant** (zero acesso cross-tenant)
- **mínimo privilégio** por role
- proteção de dados sensíveis (LGPD), especialmente evolução e registros clínicos

---

## 2) Princípios
- Menor privilégio sempre.
- Evitar logs com dados sensíveis (LGPD).
- Validar entrada/saída em toda rota.
- Admin e operações críticas preferencialmente via **server routes** (Admin SDK).

---

## 3) Perfis e permissões (resumo)
### Admin
- Acessa painel Admin, configurações e catálogos.
- Pode ler/editar pacientes, agenda e registros.

### Profissional
- Gerencia agenda (agendamentos/holds), status, reagendar/excluir.
- Registra evolução por sessão e ocorrências extra.
- Lê histórico do paciente necessário ao cuidado.

### Paciente
- Lê apenas seus próprios dados mínimos e agendamentos.
- **Proibido CTA** cancelar/remarcar.

---

## 4) Dados sensíveis e escopo
### 4.1 Evolução / prontuário
- Armazenado em `patients/{patientId}/sessionEvolutions/{occurrenceId}`.
- Acesso: **apenas Admin/Profissional do tenant**.
- Paciente: **sem acesso** no MVP (ou acesso extremamente restrito se definido depois).

### 4.2 Ocorrência extra
- Armazenada em:
  - `appointmentOccurrences/{occurrenceId}/occurrenceLogs/{logId}`
  - espelho em `patients/{patientId}/occurrenceLogs/{logId}`
- Acesso: **apenas Admin/Profissional**.

---

## 5) Diretrizes de Rules (placeholder até hardening final)
> Hardening final ainda pendente; enquanto isso, adotar as diretrizes:

- `userTenantIndex/{uid}`:
  - leitura apenas do próprio usuário autenticado **ou** leitura bloqueada no client e resolvida via server.
- `tenants/{tenantId}/**`:
  - permitir somente se o usuário pertence ao tenant (`tenants/{tenantId}/users/{uid}` existe) e `isActive=true`
  - restringir por role:
    - Admin/Owner: CRUD completo
    - Profissional: CRUD em agenda/pacientes/registros (conforme escopo)
    - Paciente: leitura mínima e apenas do próprio paciente (quando implementado)

- Subcoleções clínicas:
  - `sessionEvolutions/**` e `occurrenceLogs/**` devem ser **sempre** bloqueadas para pacientes no MVP.

---

## 6) Observação sobre o Admin
Evitar que o Admin UI conecte listeners client em coleções que:
- não existem no AgendaPsi
- ou não possuem permissão no Rules (ex.: módulos “Lembretes” ainda placeholders)

Padrão recomendado:
- Admin consome dados via rotas `/api/admin/...` usando Admin SDK.


---

## Portal do Paciente (MVP) — diretrizes de segurança

- O portal `/paciente` deve operar por **APIs server-side** (Admin SDK) e **não** via listeners Firestore no client.
- O usuário com `role="patient"` deve ter **privilégios mínimos**:
  - idealmente **nenhuma leitura direta** de `tenants/*` via client SDK, exceto se existir uma coleção “portal segura” explicitamente projetada para isso.
- Dados clínicos (evolução, ocorrência extra, prontuário) **não devem** ser expostos ao paciente no MVP.
- Biblioteca no paciente deve filtrar **somente published** (fonte Admin).
- Anotações do paciente (`patientNotes`) são dados sensíveis: limitar tamanho, evitar logs e aplicar exclusão lógica.

Checklist para endurecimento (produção):
- Regras Firestore: garantir que `role="patient"` não consiga ler `appointmentOccurrences`, `appointmentSeries`, `sessionEvolutions`, `occurrenceLogs`.
- Validar APIs: sempre verificar `tenantId` + `patientId` dos claims; nunca aceitar do client.
