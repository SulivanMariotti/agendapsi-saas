# Modelo NoSQL (Firestore) + chave única do paciente

## Objetivo
Padronizar coleções/documentos **sem joins**, com denormalização intencional e uma **chave única** do paciente para evitar inconsistências (principalmente em import/agenda/push).

## Chave única (recomendação prática)
- **phoneCanonical**: somente dígitos (DDD + número), sem `+55`.
- Use `phoneCanonical` como elo operacional para:
  - `subscribers/{phoneCanonical}` (pushToken + status + preferências)
  - vínculo de import de agenda e presença/faltas
- Para entidades com UID (Firebase Auth), manter:
  - `users/{uid}` contendo também `phoneCanonical`
- Se necessário, compor identificador estável:
  - `patientKey = tenantId + ":" + phoneCanonical` (quando virar SaaS multi-tenant)

## Coleções principais (resumo)
- `users/{uid}`
  - `status`: `active|inactive`
  - `phoneCanonical`, `displayName`, flags (`accessDisabled`, `securityHold`)
  - (opcional) `deletedAt`, `inactiveReason`
- `subscribers/{phoneCanonical}`
  - `status`: `active|inactive`
  - `pushToken` (ou tokens)
  - `lastSeenAt`, `platform`, `locale`
- `appointments/{appointmentId}`
  - `patientPhoneCanonical`, `scheduledAt`, `source`
  - `reminders.slot1/slot2/slot3` com `sentAt`, `batchId`
- `attendance_logs/{logId}`
  - `isoDate`, `patientPhoneCanonical`, `status` (present/absent)
  - `followup.sentAt`, `followup.batchId`

## Regras operacionais
- **Não apagar paciente para “reativar”**. Use soft-delete e a **reativação oficial** no Admin.
- Em duplicidade de telefone, regra de segurança: **se existe ativo, ativo vence**.
- Qualquer automação de merge/dedup deve ser **assistida** (evitar envio para pessoa errada).
