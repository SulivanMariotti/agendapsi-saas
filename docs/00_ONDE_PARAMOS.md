# Onde paramos — Lembrete Psi (2026-02-19)

## Estado atual (validado)

### Operação (modo manual — recomendado)
Rotina diária (Admin → Agenda):

**Carregar Planilha → Verificar → Sincronizar → Gerar Preview do Disparo → Enviar lembrete**

- Janela de upload: **hoje → +30 dias** (rodar também em fim de semana/feriado).
- **Não há Cron Jobs configurados** na Vercel (decisão atual: **modo manual**).
- Se cron for ligado no futuro, as rotas `/api/cron/*` já estão **endurecidas** (header-only + rotação de secret).

### Diretriz clínica/UX (painel do paciente)
- O painel do paciente existe para **lembrar + psicoeducar + responsabilizar**.
- **Sem botão/CTA** de **cancelar/remarcar**.
- Quando existir WhatsApp/contato: **apenas confirmação de presença** (reforço de compromisso), nunca como atalho de cancelamento.

---

## Entregas desta rodada (2026-02-18)

### 1) Segurança v1 (pronto para produção)
**Bloqueadores críticos resolvidos** (sem mudar o modo de operação manual):

- Login do paciente por **e-mail sem verificação**: **desativado por padrão**.
- Paciente: acesso por **vínculo de aparelho (telefone + código)** (single-use por dispositivo).
- Admin: acesso apenas com **custom claims** (sem fallback perigoso via `users.role`).
- Firestore rules:
  - `users/{uid}`: paciente só atualiza **lastSeen/contractAccepted*** (sem editar identidade/role).
  - `audit_logs` e `subscribers`: **admin-only**.
  - `patient_notes`: trava de `patientId` no update.
- **Trocar paciente (DEV)** removido do painel do paciente.
- Hardening de produção:
  - Headers (HSTS, nosniff, referrer-policy, permissions-policy, etc.).
  - **CSP ENFORCE em produção** (Report-Only em dev).
  - Rate limit + erros seguros em rotas sensíveis.
  - Origin/CSRF guard padronizado nas rotas POST.
- Logs e retenção:
  - PII mascarada em `history/audit_logs`.
  - Campo `expireAt` gravado para expiração automática.
  - **TTL Firestore configurado** para `history.expireAt` e `audit_logs.expireAt` (pode levar até ~24h para excluir após expirar).

### 2) Paciente — Biblioteca (psicoeducação + vínculo)
- Novo menu **Biblioteca** no painel do paciente (desktop + mobile).
- Modal com:
  - **mantra fixo**: “Leitura não substitui sessão. A mudança acontece na continuidade.”
  - **rolagem interna** + fechar por **X**, botão **Fechar** e tecla **ESC**.
  - busca por título/conteúdo e seções por categoria.
  - seção **“Para levar para a sessão”** (prompts de reflexão/anotação).

### 3) Admin — Repositório de artigos (CRUD) + Categorias
- Admin pode **criar/editar/publicar/despublicar/excluir** artigos.
- Categorias:
  - Tela dedicada de **Categorias** (CRUD + ativar/desativar/ordenar).
  - No editor do artigo, dá para **selecionar categoria** e **criar nova inline**.
- Paciente vê **apenas artigos publicados** (carregados via API server-side).

---

### 4) Hardening pós-v1 (Segurança — Passos 1–5)
Refinamentos de segurança aplicados para evitar brechas de autorização e abuso em ambiente serverless:

- **RBAC do paciente estrito**: novo helper `requirePatient()` (nega se `role` ausente/incorreta) + fallback seguro via `users/{uid}.role`.
- **Presença (integridade)**: `POST /api/attendance/confirm` **ignora `phone` do client** e deriva do perfil (`users/{uid}.phoneCanonical`/`phone`).
- **Metadados operacionais**: `GET /api/appointments/last-sync` agora é **admin-only**.
- **Redução de superfície**: endpoints legados `_push_old/*` desativados (**410** em dev / **404** em produção).
- **Rate limit global (serverless-safe)**: rotas críticas usam limiter com backing no Firestore (coleção `_rate_limits`) + recomendação de **TTL** em `_rate_limits.expireAt`.

## Próximo foco (sequência recomendada)
1) **Presença/Faltas** — melhorar painel de constância (30 dias) com insights clínicos (sem moralismo).
2) Processar **segunda planilha/relatório** (presença/faltas) para painel de constância e follow-ups futuros.
3) Documentar modelo NoSQL (denormalização + chave única do paciente) para evitar inconsistências.


---

## Atualização rápida — 2026-02-19 (Presença/Faltas)

### 5) Presença/Faltas — robustez do import e follow-ups
- **Import CSV mais tolerante** (sem exigir colunas opcionais):
  - separador **autodetectado** (`;` / `,` / TAB) e suporte a CSV com **BOM**
  - coluna **TELEFONE** opcional (fallback)
  - suporte a **DATA/HORA** em coluna única (além de DATA + HORA)
  - `NOME/PROFISSIONAL/SERVIÇOS/LOCAL` passam a ser **opcionais** (gera warning, mas não bloqueia)
- **Painel de constância**: período passa a considerar a **data real da sessão** (`isoDate`), não a data do import (`createdAt`).
- **Follow-ups mais seguros**: bloqueia envio quando:
  - paciente **não está vinculado** (`unlinked_patient`)
  - telefone é **ambíguo** sem vínculo (`ambiguous_phone`)
  - há conflito entre telefone do log e do perfil (`phone_mismatch`)

> Diretriz clínica preservada: sem CTA de cancelar/remarcar; reforço de vínculo e constância.

---

## Atualização adicional — 2026-02-19 (Paciente + Hardening)

### 6) Painel do paciente — reduzir fricção (server-side)
Para evitar `permission-denied` e reduzir fricção que vira abandono/falta, foram adicionadas rotas server-side:
- `POST /api/patient/ping` → atualiza `lastSeen` (server-side)
- `POST /api/patient/contract/accept` → aceita contrato (idempotente)
- `GET/POST /api/patient/notes` e `DELETE /api/patient/notes/[id]` → notas/diário para levar para a sessão

> Diretriz clínica preservada: nada disso cria caminho para cancelar/remarcar; serve para **sustentar presença** e preparar a sessão.

### 7) Hardening — validação de payload (schema-lite) e rate limit
- Helper `src/lib/server/payloadSchema.js` (schema-lite) para:
  - parse seguro (`readJsonBody` com limite de tamanho)
  - bloqueio de chaves inesperadas (allowedKeys)
  - erros 400 previsíveis (evita bugs silenciosos)
- Rate limit (`src/lib/server/rateLimit.js`) com normalização básica de IP (CF / XFF / X-Real-IP, remove porta e `::ffff:`).

### 8) Admin — Follow-ups (UX)
- Card de follow-ups exibe contadores dos novos bloqueios (`unlinked/ambiguous/mismatch`) com rótulos legíveis.
- Card inclui orientação clínica/segurança: bloqueio = **barreira de proteção** contra envio errado.
