# Próximos passos — checklist rápido (atualizado em 2026-02-20)

## A) Produção (essencial)
- Confirmar `config/global` com mensagens (msg1/msg2/msg3) e títulos (incluindo follow-ups presença/falta).
- Confirmar Firestore rules publicadas (principalmente `users`, `audit_logs`, `subscribers`, `library_*`, `patient_notes`).
- Confirmar **TTL ativo**: `history.expireAt`, `audit_logs.expireAt` e `_rate_limits.expireAt`.
- Validar Web Push:
  - desregistrar SW (`firebase-messaging-sw.js`) no navegador e recarregar.

## B) Prioridade clínica (próximas entregas)
- [x] **Painel do paciente (mobile)**: “1 olhar e pronto”
  - Top AppBar fixa + bottom nav premium (Sessão/Diário/Leituras/Contrato)
  - menos contornos (cards sem border/ring)
  - paleta cinza + primário `bg-violet-950/95` + tokens/tema
- [ ] **Segurança (Admin)**: migrar login Admin legado (`ADMIN_PASSWORD`) para login forte (preferido: Firebase Auth + MFA/TOTP obrigatório; alternativa: magic link) com migração progressiva e desligamento do legado em produção.
- [ ] **Presença/Faltas**: validar ingestão da **2ª planilha real** (modo mapeado) conforme cabeçalhos reais e consolidar métricas/insights clínicos (sem moralismo).

## C) Hardening contínuo (pós-v1)
- Expandir validação de payload (schema mais forte) e revisar endpoints Admin SDK (ownership + logs consistentes).
- CSP: planejar migração para reduzir/retirar `unsafe-inline` (nonce/hashes).

## D) Dados / Consistência (Firestore)
- Documentar modelo NoSQL (sem joins), estratégia de denormalização e chave única do paciente (ex.: `patientId` + `phoneCanonical`).
