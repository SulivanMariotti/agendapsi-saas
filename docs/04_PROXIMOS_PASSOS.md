# Próximos passos — checklist rápido (atualizado em 2026-02-25)

## A) Produção (essencial) ✅
- [x] `config/global` com mensagens e títulos (48h/24h/manhã + follow-ups).
- [x] Firestore rules publicadas (incluindo TTL).
- [x] Hardening v1 (headers/CSP/originGuard/rate-limit/logs TTL).
- [x] Web Push validado (inclui troubleshooting iOS/PWA).

## B) Presença/Faltas (Admin-only — prioridade clínica agora)
- [x] Modelo de dados documentado (`attendance_logs`) + regras admin-only.
- [x] Import + Summary + Follow-ups com **`batchId`** e links para **Histórico**.
- [ ] **Hardening anti-envio + higiene de PII**: confirmar/implementar:
  - envio real exigir confirmação/flag explícita;
  - bloquear ranges inválidos (futuro/janela grande);
  - logs sem linha crua/telefone completo.
- [ ] **Painel de constância (7/30/90)**: insights clínicos (sem moralismo), cards e segmentações.
- [ ] Notificações de constância:
  - **presença**: reforço positivo;
  - **falta**: orientação e convite à regularidade;
  - sem CTA de cancelar/remarcar; sem WhatsApp como atalho de ausência.
- [ ] Manter invisível no paciente por enquanto (feature flag / rota não exposta).

## C) Correções/qualidade (Admin)
- [x] Hotfix Histórico: `Cannot access 'rangeLogs' before initialization`.
- [x] Hotfix build: JSX inválido em `AdminAttendanceImportCard`.

## D) Segurança (pós-v1 / roadmap)
- [ ] Revisão de “gaps” de schema validation nos endpoints críticos (catálogo + validação leve por rota).
- [ ] Higiene de logs (PII) e padronização de mensagens de erro.
- [ ] **Admin Auth forte** (deixar por último): migrar `ADMIN_PASSWORD` → Firebase Auth + MFA/TOTP (ou magic link), com migração progressiva e desligamento do legado em produção.

## E) Produto (futuro, só depois de tudo OK)
- [ ] OTP/magic link do paciente antes de PWA/App (Capacitor).
- [ ] Multi-tenant SaaS (tenantId por clínica, isolamento, billing, onboarding).
