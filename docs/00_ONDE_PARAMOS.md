# Onde paramos — Lembrete Psi (2026-02-21)

## Objetivo do sistema (norte clínico)
O Lembrete Psi não é “agenda com disparo”. É ferramenta clínica para **sustentar vínculo e constância**.

- **Cuidado ativo**: lembrar e facilitar a presença (48h/24h/manhã).
- **Psicoeducação**: reforçar que faltar interrompe o processo.
- **Responsabilização**: o horário existe por contrato terapêutico.
- Painel do paciente: **sem botão/CTA de cancelar/remarcar**.

---

## Estado atual (validado)

### Operação (modo manual — recomendado)
Rotina diária (Admin → Agenda):

**Carregar Planilha → Verificar → Sincronizar → Preview → Enviar**  
Janela: **hoje → +30 dias** (cron ainda desativado).

### Segurança (v1)
- Rules/headers/CSP/originGuard/rate limit/logs TTL: **ok**
- Acesso do paciente: bloqueio apenas por flags explícitas (`accessDisabled` / `securityHold`), nunca por “status clínico”.

---

## Entregas concluídas hoje (2026-02-21)

### A) Produção (checks)
- `config/global` validado e salvo (msg1/msg2/msg3 + títulos + offsets + follow-ups).
- Firestore rules **publicadas** (users/audit_logs/subscribers/library_*/patient_notes).
- TTL **ativo** (`history.expireAt`, `audit_logs.expireAt`, `_rate_limits.expireAt`).
- Web Push: limpeza de Service Worker e recarga validadas.

### C) Presença/Faltas (dados reais)
- Import/validação da **2ª planilha real** (modo mapeado) e métricas ok (byDay/cobertura/attention/trends).
- Follow-ups (presença/falta): correção do endpoint para aceitar **`dryRun`**.
- Segurança do follow-up: bloqueios críticos continuam (unlinked/ambiguous/mismatch) + idempotência (anti-spam).

### D) Hardening contínuo (pós-v1)
- Schema-lite “body vazio” (allowedKeys: []) em rotas que não deveriam aceitar payload.
- `showKeys` menos verboso em produção (erros de payload sem “vazar” chaves).

### E) Dados / Consistência (Firestore)
- Padronização: `phoneCanonical` (normalização) + relatório de duplicatas com **toggle** (por padrão, igual lista: **oculta desativados**).
- **Reativação oficial** no Admin:
  - Toggle “Mostrar desativados” + botão **Reativar**
  - Restaura `users.status=active` e `subscribers.status=active` sem recadastrar.
- Fix crítico: em duplicidade por telefone, **ativo sempre vence inativo** (evita bloquear envio).
- Push token:
  - `status-batch` ajustado para detectar token corretamente.
  - Envio real (Admin + Cron) usa lookup robusto (compat com doc legado `55...`).

### UX/Layout (Admin + Paciente)
- Sidebar do Admin reduzida (mais área útil à direita).
- Cantos arredondados mais “quadrados” globalmente (≈ -60% radius).
- Ajustes finos de layout na lista de pacientes (sem adicionar/remover informação).

### F) Auditoria por lote (batchId) — **parcial (F3 ficou para amanhã)**
- `batchId` gerado por execução em **Admin Send / Cron / Follow-ups** e persistido em `history` + `audit_logs`.
- **Histórico**: filtro por `batchId` + resumo do lote (com hotfix do `rangeLogs`).

---

## Pontos importantes (para evitar regressão)
- **Desativar ≠ apagar**: o doc inativo fica no Firestore (por isso duplicatas “globais” apareciam).  
  Agora: relatório de duplicatas **oculta desativados por padrão** e existe **Reativar** no Admin.
- Se aparecer “Sem Token”, confira `subscribers/{phoneCanonical}.pushToken`. (UI e status-batch foram corrigidos hoje.)
- Se existir duplicidade de telefone, o sistema agora trata como: **se há ativo, não bloqueia por inativo**.

---

## Pendências (próxima sessão)
- **F3 (deixar para amanhã)**: Dashboard com card “Últimos lotes (batchId)” + link para Histórico já filtrado.
- Fase 2 do painel de constância (insights clínicos, sem moralismo).
- Deduplicação/merge “assistido” (resolver duplicatas com segurança, sem risco de enviar para pessoa errada).
- **Item B por último**: migrar `ADMIN_PASSWORD` → Firebase Auth + MFA/TOTP (ou magic link) com migração progressiva e desligamento do legado.

