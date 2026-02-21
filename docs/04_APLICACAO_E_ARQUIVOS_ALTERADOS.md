# Aplicação das alterações (Handoff 2026-02-15)

## Arquivos alterados (final)
- `src/app/api/admin/reminders/send/route.js` *(usar a versão do ZIP “hardening”)*
- `src/services/dataService.js`
- `src/components/Admin/AdminScheduleTab.js`

## Substituição
1) Faça backup dos arquivos atuais  
2) Substitua pelos arquivos acima (mesmos caminhos)  
3) Rode `npm run dev` e/ou `npm run build`

## Observação importante
Se você aplicou o ZIP “idempotência/placeholder” e depois o ZIP “hardening”:
- o `route.js` do hardening **substitui** o `route.js` anterior (ele inclui tudo + auditoria).
- os outros dois arquivos continuam os do ZIP anterior.

---

# Aplicação das alterações (Handoff 2026-02-18 — Segurança pós-v1)

## Arquivos alterados (Passos 1–5)
**Passo 1 (RBAC paciente estrito)**
- `src/lib/server/requirePatient.js`
- `src/app/api/patient/appointments/route.js`
- `src/app/api/patient/library/list/route.js`
- `src/app/api/patient/push/register/route.js`
- `src/app/api/patient/push/status/route.js`
- `src/app/api/patient/resolve-phone/route.js`
- `src/app/api/appointments/last-sync/route.js`
- `src/app/api/attendance/confirm/route.js`
- `src/app/api/attendance/confirmed/route.js`

**Passo 2 (integridade presença)**
- `src/app/api/attendance/confirm/route.js`

**Passo 3 (last-sync admin-only)**
- `src/app/api/appointments/last-sync/route.js`

**Passo 4 (desativar `_push_old`)**
- `src/app/api/_push_old/enabled/route.js`
- `src/app/api/_push_old/status/route.js`

**Passo 5 (rate limit global — Firestore)**
- `src/lib/server/rateLimit.js`
- `src/app/api/auth/route.js`
- `src/app/api/patient/pair/route.js`
- `src/app/api/patient-auth/route.js`
- `src/app/api/attendance/confirm/route.js`
- `src/app/api/patient/push/register/route.js`
- `src/app/api/patient/push/status/route.js`

## Substituição
1) Faça backup dos arquivos atuais  
2) Substitua pelos arquivos acima (mesmos caminhos)  
3) Rode `npm run dev` e/ou `npm run build`

## TTL recomendado (Firestore)
- Manter TTL já existente:
  - `history.expireAt`
  - `audit_logs.expireAt`
- Adicionar TTL para rate limit global:
  - `_rate_limits.expireAt`

---

# Aplicação das alterações (Handoff 2026-02-20 — Paciente UI)

## Arquivos alterados (Paciente)
- `src/components/Patient/PatientFlow.js`
- `src/components/Patient/PatientLogin.js`
- `src/features/patient/components/PatientTopAppBar.js` *(novo)*
- `src/features/patient/components/PatientHeader.js`
- `src/features/patient/components/PatientTopMantraBar.js`
- `src/features/patient/components/PatientMantraCard.js`
- `src/features/patient/components/NextSessionCard.js`
- `src/features/patient/components/PatientSessionsCard.js`
- `src/features/patient/components/NotificationStatusCard.js`
- `src/features/patient/components/PatientAgendaCard.js`
- `src/features/patient/components/AppointmentMiniRow.js`
- `src/features/patient/components/PatientNotesCard.js`
- `src/features/patient/components/PatientLibraryModal.js`
- `src/features/patient/components/ContractStatusCard.js`
- `src/features/patient/components/PatientContactCard.js`
- `src/features/patient/components/EmptyState.js`
- `src/features/patient/components/InlineError.js`
- `src/features/patient/lib/uiTokens.js`
- `src/features/patient/lib/appointments.js`

## Tema (Paciente-only)
- `src/components/uiTheme.js` *(novo)*
- `src/components/DesignSystem.js`
- `src/app/page.js`

## Skin / Paleta (Paciente-only)
- `src/app/globals.css`

## Assets
- `public/brand/lembretepsi-logo-white.png` *(novo)*

## Substituição
1) Faça backup dos arquivos atuais
2) Substitua pelos arquivos acima (mesmos caminhos)
3) Rode `npm run dev` e valide no celular/emulador
