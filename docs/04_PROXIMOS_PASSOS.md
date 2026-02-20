# Próximos passos — checklist rápido (atualizado em 2026-02-20)

## A) Produção (essencial)
- Confirmar `config/global` com mensagens (msg1/msg2/msg3) e títulos (incluindo follow-ups presença/falta).
- Confirmar Firestore rules publicadas (principalmente `users`, `audit_logs`, `subscribers`, `library_*`, `patient_notes`).
- Confirmar **TTL ativo**: `history.expireAt`, `audit_logs.expireAt` e `_rate_limits.expireAt`.
- Validar Web Push:
  - desregistrar SW (`firebase-messaging-sw.js`) no navegador e recarregar.

## B) Prioridade clínica (próxima entrega)
- [ ] **Painel do paciente (mobile)**: reduzir altura/“peso” do topo (mantra/header) e melhorar leitura “1 olhar e pronto”, mantendo tom clínico e **sem CTA de cancelar/remarcar**.
- [ ] **Presença/Faltas**: validar ingestão da **2ª planilha real** (modo mapeado) conforme cabeçalhos reais.
- [ ] **Segurança**: migrar login Admin legado (`ADMIN_PASSWORD`) para login forte (preferido: Firebase Auth + MFA/TOTP obrigatório; alternativa: magic link) com migração progressiva e desligamento do legado em produção.

## C) Hardening contínuo (pós-v1)
- Expandir validação de payload (schema mais forte) e revisar endpoints Admin SDK (ownership + logs consistentes).
- CSP: planejar migração para reduzir/retirar `unsafe-inline` (nonce/hashes).
