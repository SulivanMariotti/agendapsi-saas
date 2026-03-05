# Admin — Configurações do Portal do Paciente (por tenant)

Atualizado: **2026-03-03**

## Objetivo
Permitir que o **Admin** configure, por **tenant**, o Portal do Paciente:

- Texto do **Termo/Contrato**
- **Versão** do termo (para exigir novo aceite)
- Flags para ativar/desativar módulos no portal:
  - Biblioteca
  - Anotações do paciente
  - Lembretes (opt-in/out)

> Regra de produto: o portal do paciente **não possui CTA** de cancelar/remarcar.

---

## Fonte da verdade (Firestore)
Documento:

`tenants/{tenantId}/settings/patientPortal`

Campos:

- `termsVersion` (number) — aumentar força novo aceite
- `termsText` (string) — texto exibido no portal
- `libraryEnabled` (boolean)
- `notesEnabled` (boolean)
- `remindersEnabled` (boolean)
- `createdAt`, `updatedAt` (timestamps)

Defaults (quando o doc não existe) são aplicados em `src/lib/server/patientPortalConfig.js`.

---

## UI no Admin
Local: `/admin`

Menu: **AgendaPsi → Portal do Paciente**

Tab id: `agendapsi_patient_portal`

Funcionalidades:
- Informar `tenantId`
- Recarregar configuração
- Editar termo + versão
- Marcar/desmarcar módulos
- Salvar (persistindo no Firestore)

---

## Endpoints (Admin)
- `GET /api/admin/agendapsi/patient-portal?tenantId=...`
- `PUT /api/admin/agendapsi/patient-portal`

Proteções:
- `requireAdmin`
- `rateLimit`
- validação de payload (`readJsonObjectBody`)

---

## Impacto no portal do paciente
O portal lê as flags e o termo via `GET /api/paciente/agenda` (server-side):

- `portal.contract.version/text/needsAcceptance`
- `portal.features.libraryEnabled/notesEnabled/remindersEnabled`

Quando `termsVersion` é maior que `portal.termsAcceptedVersion`, o paciente volta a ver o termo como **pendente**.

