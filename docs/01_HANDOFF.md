# Lembrete Psi — Handoff para novo chat (2026-02-19)

Este pack serve para iniciar um novo chat e continuar o desenvolvimento **de onde paramos**, sem perder decisões clínicas/técnicas.

---

## Contexto do projeto
- App: **Lembrete Psi**
- Stack: **Next.js (App Router) + Firebase (Firestore/FCM + Admin SDK + Web Push)**
- Diretriz clínica/UX (painel do paciente):
  - foco em **lembrar + psicoeducar + responsabilizar**
  - **sem botão/CTA de cancelar/remarcar**
  - quando existir WhatsApp/contato: **apenas confirmação de presença** (reforço de compromisso)

---

## Estado atual (validado)

### Operação (manual)
Rotina diária (Admin → Agenda):
1) Carregar Planilha (janela **hoje → +30 dias**)
2) Verificar
3) Sincronizar
4) Gerar Preview do Disparo (dryRun)
5) Enviar lembrete

> Cron **não** está habilitado (decisão atual). Rotas `/api/cron/*` estão prontas e seguras para futuro (header-only + rotação de secret).

### Segurança
- **v1 concluída**: paciente por **telefone+código**, admin via **custom claims**, rules endurecidas, headers/CSP, origin guard, rate limit.
- Retenção: `expireAt` + **TTL ativo** em `history` e `audit_logs`.
- Pós-v1 (aplicado): `requirePatient`, `attendance/confirm` deriva telefone do perfil, `/api/appointments/last-sync` admin-only, `_push_old` desativado.
- Schema-lite disponível: `src/lib/server/payloadSchema.js` (usado em rotas críticas).

### Biblioteca (Paciente + Admin)
- Paciente: menu **Biblioteca** com modal rolável, busca, “Para levar para a sessão” e mantra fixo (leitura não substitui sessão).
- Admin: repositório de artigos (CRUD) com status (rascunho/publicado).
- Categorias: CRUD + ativar/desativar + criação inline no editor.

### Paciente (server-side para reduzir fricção)
- Agenda: `GET /api/patient/appointments` (Admin SDK; evita `permission-denied`).
- Contrato: `POST /api/patient/contract/accept`.
- Ping/lastSeen: `POST /api/patient/ping`.
- Notas (para levar para a sessão):
  - `GET/POST /api/patient/notes`
  - `DELETE /api/patient/notes/[id]`

### Presença/Faltas (Admin)
- Import CSV robusto:
  - separador autodetect no cabeçalho (`;`/`,`/TAB) + suporte a BOM
  - obrigatório: **ID** + (**DATA/HORA** ou **DATA+HORA**)
  - opcional: NOME/PROFISSIONAL/SERVIÇOS/LOCAL/STATUS/**TELEFONE** (gera warnings, não bloqueia)
- Métricas (30 dias): período calculado por **`isoDate`** (data real da sessão).
- Follow-ups: idempotência + bloqueios de segurança (`unlinked_patient`, `ambiguous_phone`, `phone_mismatch`).
- UI de Follow-ups no Admin exibe contadores e rótulos legíveis.

---

## Próximos passos recomendados (sequência)
1) **Painel de constância (30 dias)** no Admin (Presença/Faltas): insights clínicos (sem moralismo) + filtros úteis (profissional/paciente/período).
2) Validar ingestão com **relatório real** (2ª planilha) no modo mapeado e ajustar sinônimos de cabeçalho se necessário.
3) **Segurança (pós-v1)**: expandir validação de payload (schema mais forte por endpoint) e revisar endpoints Admin SDK (ownership + logs).
4) Documentar modelo NoSQL (denormalização + chave única do paciente) para reduzir inconsistências.
