# Onde paramos — Lembrete Psi (2026-02-20)

## Objetivo do sistema (norte clínico)
O Lembrete Psi não é “agenda com disparo”. É ferramenta clínica para **sustentar vínculo e constância**.

- **Cuidado ativo**: lembrar e facilitar a presença (48h/24h/mananhã).
- **Psicoeducação**: reforçar que faltar interrompe o processo.
- **Responsabilização**: o horário existe por contrato terapêutico.
- Painel do paciente: **sem botão/CTA de cancelar/remarcar**.

---

## Estado atual (validado)

### Operação (modo manual — recomendado)
Rotina diária (Admin → Agenda):

**Carregar Planilha → Verificar → Sincronizar → Gerar Preview do Disparo → Enviar lembrete**

- Janela de upload: **hoje → +30 dias**.
- Cron **não habilitado** (decisão atual). Rotas `/api/cron/*` permanecem endurecidas para futuro.

### Segurança v1 (concluída) + pós-v1 aplicado
- Paciente por **telefone + código** (single-use por dispositivo).
- Login inseguro do paciente por e-mail: **desativado por padrão**.
- Admin: **custom claims** (`admin:true`) + guards server-side.
- Firestore rules endurecidas + headers/CSP em produção + origin guard + rate limit.
- Logs com `expireAt` + **TTL ativo** em `history` e `audit_logs`.

**Pós-v1 recente**
- `requirePatient()` aplicado nas rotas do paciente (role estrita).
- `POST /api/attendance/confirm` deriva telefone do perfil (ignora `phone` do client).
- `_push_old/*` desativado (410 dev / 404 prod).
- Helper de validação **schema-lite** (`src/lib/server/payloadSchema.js`) em rotas críticas.
- **Acesso do paciente**: bloqueio só por flag explícita (`accessDisabled/securityHold/...`), não por “status clínico”.
- Endpoint Admin para suspender/liberar acesso com auditoria: `POST /api/admin/patient/access`.

> Pendência de segurança para nota ≥ 9: substituir `ADMIN_PASSWORD` por login Admin forte (MFA/TOTP ou magic link) com migração progressiva.

### Presença/Faltas (constância terapêutica)
- Import CSV robusto (BOM + `;`/`,`/TAB) + **DATA/HORA** em coluna única.
- Coluna **TELEFONE** opcional (fallback) para vínculo operacional.
- Painel de constância (janela 30 dias) calculado por **`isoDate`** (data real da sessão).
- Follow-ups com segurança: bloqueia envio em `unlinked_patient`, `ambiguous_phone`, `phone_mismatch`.

**Melhorias aplicadas**
- `GET /api/admin/attendance/summary` retorna:
  - `byDay`, `daysWithData/daysWithoutData`, `attention`, `computedAt`, `range`
  - filtros (`pro/service/location/patientId/phone`) + `segments` + `trend`
- UI Admin de constância:
  - filtros (chips + limpar), trend/segments, ordenação por prioridade, filtro rápido por telefone

### Biblioteca (psicoeducação)
- Paciente: modal com rolagem, busca, mantra fixo e “Para levar para a sessão”.
- Admin: CRUD de artigos + categorias (criação inline no editor). Paciente vê só `published`.

### Painel do paciente (mobile-first — somente paciente)
**Admin segue desktop-first.** O painel do paciente recebeu uma rodada completa de “1 olhar e pronto”, sem CTA de cancelar/remarcar.

**Topo e navegação**
- **Top AppBar fixa** (branding “Lembrete Psi” + logo branco): fica **fixa** no topo, respeita **safe-area** (iOS) e mantém o **Menu** sempre acessível.
- **Bottom nav premium** (fixa + safe-area): **Sessão / Diário / Leituras / Contrato**, com item ativo em **pílula** (claro e nativo).
- **Contrato**:
  - título não some no mobile (modal com altura limitada + scroll interno)
  - acesso também via bottom nav

**Leitura e hierarquia (menos “cara de botão”)**
- Removidos `border/ring` de cards informativos (viraram **superfícies** com sombra leve).
- Borda fica apenas onde faz sentido: **inputs** e **separadores**.

**Paleta (consistência)**
- Fundo geral do paciente em **escala de cinza** (sem rosado).
- Primário do paciente migrado para **`bg-violet-950/95`**.
- Estados preservados: **ok (emerald)** e **atenção (amber)**.
- Tokens centralizados em `src/features/patient/lib/uiTokens.js`.
- Botões `primary` do paciente usam **tema** (override) sem afetar o Admin.

---

### Admin (paleta) — alinhamento com o paciente (somente cores)
Objetivo: o Admin manter **desktop-first**, mas com a **mesma paleta em escala de cinza** do paciente (sem rosado).

- Admin pode herdar a mesma paleta do paciente usando **`skin-patient`** no wrapper do Admin:
  - arquivo: `src/app/admin/layout.js`
  - troca: `skin-admin` → `skin-patient`
- Padronização do roxo (para eliminar resíduos):
  - `src/app/globals.css`: `--color-violet-600: var(--color-violet-800)`
  - substituir usos diretos de `#7c3aed` por `#5b21b6` (violet-800)
- Tokens de acento (`--accent-*`) documentados para completar escala até `1000`.

**Conteúdo**
- Próxima sessão em modo “1-olhar”: resumo curto + detalhes colapsados no mobile.
- Agenda colapsável por semana/mês.
- Diário com busca mais clara.
- Biblioteca com busca/categorias sticky.

---

## Próximo passo (sequência recomendada)
1) **Segurança (Admin)**: migrar `ADMIN_PASSWORD` → login Admin forte (preferido: Firebase Auth + MFA/TOTP obrigatório; alternativa: magic link), com migração progressiva e desligamento do legado em produção.
2) **Presença/Faltas**: validar ingestão da **2ª planilha real** (modo mapeado) e consolidar métricas clínicas (sem moralismo).
3) **Dados/Consistência**: documentar modelo NoSQL Firestore (denormalização + chave única do paciente).
