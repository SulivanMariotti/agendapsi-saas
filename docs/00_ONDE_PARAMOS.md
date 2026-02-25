# Onde paramos — Lembrete Psi (2026-02-25)

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

## Entregas concluídas (até 2026-02-22)

### A) Produção (checks)
- `config/global` validado e salvo (msg1/msg2/msg3 + títulos + offsets + follow-ups).
- Firestore rules **publicadas** (users/audit_logs/subscribers/library_*/patient_notes).
- TTL **ativo** (`history.expireAt`, `audit_logs.expireAt`, `_rate_limits.expireAt`).
- Web Push: limpeza de Service Worker e recarga validadas.

### C) Presença/Faltas (dados reais)
- Import/validação da **2ª planilha real** (modo mapeado) e métricas ok (byDay/cobertura/attention/trends).
- Follow-ups (presença/falta): endpoint aceita **`dryRun`**.
- Segurança do follow-up: bloqueios críticos continuam (unlinked/ambiguous/mismatch) + idempotência (anti-spam).

### D) Hardening contínuo (pós-v1)
- Schema-lite “body vazio” (allowedKeys: []) em rotas que não deveriam aceitar payload.
- `showKeys` menos verboso em produção (erros de payload sem “vazar” chaves).

### E) Dados / Consistência (Firestore)
- Padronização: `phoneCanonical` (normalização) + relatório de duplicatas com **toggle** (por padrão: **oculta desativados**).
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

### F) Auditoria por lote (batchId) ✅
- `batchId` gerado por execução em **Admin Send / Cron / Follow-ups** e persistido em `history` + `audit_logs`.
- **Histórico**: filtro por `batchId` + resumo do lote (hotfix do `rangeLogs`).
- **F3 concluído**: Dashboard do Admin ganhou card **“Últimos lotes (batchId)”** com link que abre o Histórico já filtrado.

### Agenda (janela rolante) — coerência com mudanças de dia/hora ✅
Para refletir alterações de agenda (dia/hora/quantidade) no painel do paciente sem “sessões fantasma”:

- Painel do paciente mostra **apenas a janela clínica** (**próximos 30 dias**; o servidor usa tolerância de ~32 dias).
- Sync do Admin faz **reconciliação na janela**: sessões previamente criadas (source `admin_sync`) que **não estão no upload atual** dentro da janela são marcadas como **`cancelled`** (não apaga histórico).
- Ferramenta de “Higienização (testes)” (cancelar futuras fora da janela) existe para limpar dados de testes, mas está **travada por feature flag**.

### Meta “Agenda atualizada em …” ✅
- `config/global.appointmentsLastSyncAt` vira o carimbo oficial.
- O paciente vê “Agenda atualizada em …” com base nesse campo.
- O carimbo é atualizado **sempre após Sincronizar**, sem depender exclusivamente do sucesso do “Verificar”.

### Estado vazio clínico (sem sessões na janela) ✅
- Se não houver sessões nos próximos 30 dias, o card Agenda mostra um texto curto de **psicoeducação/compromisso** (sem CTA de cancelar/remarcar).

---

## Pontos importantes (para evitar regressão)
- **Desativar ≠ apagar**: o doc inativo fica no Firestore (por isso duplicatas “globais” apareciam).  
  Agora: relatório de duplicatas **oculta desativados por padrão** e existe **Reativar** no Admin.
- Se aparecer “Sem Token”, confira `subscribers/{phoneCanonical}.pushToken`.
- Upload de agenda deve representar a **agenda completa da janela** (não um recorte), pois a reconciliação cancela itens que sumiram do upload dentro da janela.

---
---

## Últimas entregas (2026-02-24)

### iPhone / iOS (Push)
- No iPhone, **Push Web só fica “Disponível” quando o site está instalado na Tela de Início (PWA)** (Safari → Compartilhar → **Adicionar à Tela de Início**).
- Navegadores dentro de apps (WhatsApp/Instagram/Facebook) podem bloquear Service Worker/Push → orientar o paciente a abrir no Safari e instalar.
- Card de notificações do paciente ganhou diagnóstico mais seguro (evita crash em iOS por `Notification` não existir).

### Importar Agenda (Admin) — clareza operacional
- “Autorizados / Não autorizados” foi renomeado mentalmente para **Na base / Fora da base** (subscriber encontrado vs não encontrado).
- Badge de push separado: **Push OK / Sem Push** (token presente vs ausente).
- Tela ganhou **Legenda rápida** (1 olhar e pronto) para reduzir confusão.

### CSV ↔ subscribers (fix do “não autorizado” falso)
- Matching foi corrigido para casar `subscribers` por **`phoneCanonical` e/ou `docId`**, evitando marcar paciente como “não autorizado” mesmo com token.

### Lembretes (API) — copy clínica default
- Endpoint de envio passou a ter **templates default** (48h/24h/manhã) alinhados ao norte clínico (vínculo/constância, sem CTA de cancelar/remarcar).
- Títulos default foram neutralizados para **“💜 Lembrete Psi — …”** (sem “Permittá” hardcoded).

---

## Checklist rápido — Push no iPhone (PWA)
1. Abrir no **Safari** (evitar navegador dentro do WhatsApp/Instagram).
2. Compartilhar → **Adicionar à Tela de Início**.
3. Abrir pelo **ícone** (PWA).
4. Ajustes do iPhone → Notificações → **Lembrete Psi** → Permitir notificações.
5. No Admin, confirmar **Na base + Push OK** antes de disparar.


---


## Últimas entregas (2026-02-25)

### Presença/Faltas — rastreabilidade por lote (batchId)
- Import (`/api/admin/attendance/import`) passou a gerar/retornar `batchId` (tanto `dryRun` quanto commit).
- Follow-ups (`/api/admin/attendance/send-followups`) persistem `batchId` e deixam rastro em **Histórico**.
- UI Admin: após importar/disparar, botões **“Abrir lote no Histórico”** levam direto ao filtro por `batchId`.

### Hotfixes (Admin)
- Build error: correção de JSX inválido em `AdminAttendanceImportCard.js`.
- Histórico: correção do erro `Cannot access 'rangeLogs' before initialization` (TDZ de `const`).

### Observação importante
- Hardening “anti-envio errado + higiene de PII” do módulo Presença/Faltas (confirmação explícita para envio real e sanitização de payloads) deve ser **revalidado no código** no próximo chat (garantir que envio real exige confirmação/flag e que logs não carregam linhas cruas/telefones completos).

## Pendências (próxima sessão)
- Fase 2 do painel de constância (insights clínicos, sem moralismo).
- Deduplicação/merge “assistido” (resolver duplicatas com segurança, sem risco de enviar para pessoa errada).
- **Item B por último**: migrar `ADMIN_PASSWORD` → Firebase Auth + MFA/TOTP (ou magic link) com migração progressiva e desligamento do legado.
