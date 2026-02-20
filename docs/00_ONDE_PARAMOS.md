# Onde paramos — Lembrete Psi (2026-02-20)

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
- `GET /api/admin/attendance/summary` agora retorna:
  - `byDay`, `daysWithData/daysWithoutData`, `attention`, `computedAt`, `range`
  - filtros (`pro/service/location/patientId/phone`) + `segments` + `trend`
- UI Admin de constância:
  - filtros (chips + limpar), trend/segments, ordenação por prioridade, filtro rápido por telefone

### Biblioteca (psicoeducação)
- Paciente: modal com rolagem, busca, mantra fixo e “Para levar para a sessão”.
- Admin: CRUD de artigos + categorias (criação inline no editor). Paciente vê só `published`.

### Painel do paciente (mobile-first: somente paciente)
Admin segue desktop. O **painel do paciente** recebeu melhorias de usabilidade mobile:
- Viewport + base de spacing/typography.
- Menu em **drawer** (off-canvas) com overlay/ESC/trava scroll.
- **Bottom nav**: Agenda / Diário / Biblioteca.
- Remoção do **FAB “+”** (redundante).
- Agenda em **cards colapsáveis** por semana/mês (mobile).
- Diário: busca mais visível + foco automático.
- Próxima sessão: card mais compacto + confirmação de presença em bloco de alto contraste.
- Notificações (lembretes): card compacto + status pill + “por que isso importa?”.
- Biblioteca: busca/categorias sticky no mobile.

---

## Próximo passo (já definido)
**Mobile (Paciente):** reduzir altura/“peso” do topo (mantra/barra superior) e melhorar leitura “1 olhar e pronto” (sem perder tom clínico).
