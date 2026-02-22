# Arquivos alterados — lista rápida

Substituir **100%** do arquivo quando houver alteração.

## Admin — Pacientes
- `src/components/Admin/AdminPatientsTab.js`
- `src/app/api/admin/patients/list/route.js`

## Admin — Histórico
- `src/components/Admin/AdminHistoryTab.js`

## Agenda / Import
- `src/components/Admin/AdminScheduleTab.js`

## Disparo de lembretes (FCM)
- `src/app/api/admin/reminders/send/route.js`
- `firebase-messaging-sw.js`

## Design System
- `src/components/DesignSystem.js`

## Scripts (limpeza)
- `scripts/purgeAttendanceLogs.cjs`

## 2026-02-21 — principais arquivos tocados (este chat)

### Admin
- `src/components/Admin/AdminPatientsTab.js` (layout + higienização + duplicatas + reativar)
- `src/components/Admin/AdminScheduleTab.js` (badge token/preview)
- `src/components/Admin/AdminHistoryTab.js` (filtro por batchId + resumo + hotfix rangeLogs)
- `src/components/Admin/AdminPanelView.js` (sidebar menor)

### API (Admin/Cron)
- `src/app/api/admin/attendance/send-followups/route.js` (aceita `dryRun`)
- `src/app/api/admin/push/status-batch/route.js` (detecção robusta de token)
- `src/app/api/admin/reminders/send/route.js` (batchId + lookup token robusto + ativo vence inativo)
- `src/app/api/cron/reminders/route.js` (batchId + lookup token robusto)
- `src/app/api/admin/patient/reactivate/route.js` (reativação oficial)
- `src/app/api/admin/users/normalize-phones/route.js` (normalização phoneCanonical)
- `src/app/api/admin/users/phone-duplicates/route.js` (relatório duplicatas + toggle)
- `src/app/api/patient/ping/route.js` (schema-lite body vazio)
- `src/app/api/patient/notes/[id]/route.js` (schema-lite body vazio)

### Lib/Server
- `src/lib/server/batchId.js` (novo)
- `src/lib/server/subscriberLookup.js` (novo)
- `src/lib/server/payloadSchema.js` (showKeys quiet em produção)

### UI/Estilo
- `src/app/globals.css` (radius global mais “quadrado”)
- `src/features/patient/styles/patientMobile.module.css` (mapeamento completo de rounded-*)
