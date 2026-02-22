# Próximos passos — checklist rápido (atualizado em 2026-02-21)

## A) Produção (essencial) ✅
- [x] Confirmar `config/global` com mensagens (msg1/msg2/msg3) e títulos (incluindo follow-ups presença/falta).
- [x] Confirmar Firestore rules publicadas (principalmente `users`, `audit_logs`, `subscribers`, `library_*`, `patient_notes`).
- [x] Confirmar **TTL ativo**: `history.expireAt`, `audit_logs.expireAt` e `_rate_limits.expireAt`.
- [x] Validar Web Push (desregistrar SW e recarregar).

## B) Prioridade clínica (próximas entregas)
- [x] **Painel do paciente (mobile)**: “1 olhar e pronto” (Top AppBar fixa + bottom nav premium + paleta cinza + tokens).
- [ ] **Presença/Faltas — fase 2 (clínico):** insights de vínculo/constância (sem moralismo) + cards padrão.
- [ ] **Admin Auth forte (deixar por último):** migrar login Admin legado (`ADMIN_PASSWORD`) → Firebase Auth + MFA/TOTP obrigatório (ou magic link), com migração progressiva e desligamento do legado em produção.

## C) Auditoria (batchId)
- [x] Gerar `batchId` por execução (Admin Send / Cron / Follow-ups) e persistir em `history` + `audit_logs`.
- [x] Histórico com filtro por `batchId` + resumo do lote.
- [ ] **F3 (amanhã):** Dashboard com card “Últimos lotes (batchId)” + link para Histórico já filtrado.

## D) Hardening contínuo (pós-v1)
- [x] Schema-lite “body vazio” em rotas sem payload + `showKeys` quiet em produção.
- [ ] Expandir schema-lite para **todas** as rotas com escrita (+ futuro schema forte/Zod).
- [ ] CSP: plano para reduzir/retirar `unsafe-inline` (nonce/hashes).

## E) Dados / Consistência (Firestore)
- [x] Documentar modelo NoSQL (sem joins), denormalização e **chave única**.
- [x] Ferramentas: normalização `phoneCanonical` + relatório de duplicatas (com toggle ativo/desativado) + reativação oficial.
- [ ] Deduplicação/merge assistido (resolver duplicatas com segurança, sem risco de envio para pessoa errada).

