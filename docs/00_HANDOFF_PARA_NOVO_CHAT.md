# AgendaPsi — Arquivo para iniciar um novo chat (HANDOFF)

Data: 2026-02-28

## 1) Objetivo do projeto
Construir o **AgendaPsi (SaaS)** em **Next.js (App Router) + Firebase (Firestore/Auth/Storage/FCM)**, em subdomínio separado: **agendapsi.msgflow.app.br**, com foco na rotina do profissional e constância do cuidado.

O sistema terá 3 painéis:
- **Admin** (desktop completo)
- **Profissional** (agenda otimizada para mobile e desktop)
- **Paciente** (sem CTA de cancelar/remarcar; foco em constância)

## 2) Separação total do Lembrete Psi (decisão crítica)
O **Lembrete Psi** continua rodando **como está** na clínica em **agenda.msgflow.app.br**, com seu Firebase/Firestore atual.

O **AgendaPsi é um sistema novo e separado**, com:
- Firebase Project próprio
- Firestore/RULES próprios
- deploy/URL próprios (**agendapsi.msgflow.app.br**)

### Reuso permitido (somente como base de implementação)
✅ Apenas **código/UI/lógica/padrões** do Lembrete Psi, por exemplo:
- template do Admin (layout, componentes, tabela/filtros, toasts)
- padrões de rotas/API e validação

### Reuso proibido
❌ Não compartilhar:
- deploy/URL
- Firebase Project
- Firestore/coleções/rules
- custom claims/políticas do Lembrete (AgendaPsi terá as suas)

## 3) Estado atual (onde paramos)
### 3.1 Fundamentos
- Seed do Firestore funcionando (tenant `tn_JnA5yU`, paciente teste, série + ocorrências).
- Login do profissional funcionando com sessão server-side.
- Isolamento por tenant via índice `userTenantIndex/{uid}` (sem `collectionGroup`).
- `/api/auth` (admin) corrigido: `ADMIN_UID` opcional em dev; usa `SERVICE_ACCOUNT_JSON_PATH`.

### 3.2 Admin (reaproveitando template do Lembrete)
- Configuração da agenda do profissional (schedule) **dentro do /admin**:
  - `slotIntervalMin` (30/45/60)
  - horários por dia da semana
  - bufferMin
  - almoço (opcional)
  - duração padrão (em blocos)
- Persistência em: `tenants/{tenantId}/settings/schedule`

### 3.3 Profissional (/profissional)
**Visões**
- **Dia** (padrão): grade compacta; blocos com cor suave por status; ícone de status no canto direito (sem texto).
- **Semana**: grade semanal estilo calendário (coluna horas + 7 dias), com blocos posicionados no horário.
- **Mês**: grade mensal com itens compactos por dia.

**Interações**
- Clique em agendamento/reserva abre detalhes (e permite mudar status).
- Semana: clique em horário livre abre escolha **Agendar** ou **Reservar (Hold)** e segue o fluxo.
- Botão **Próximos horários**: lista **3 próximos** horários livres; ao escolher, abre o fluxo de agendar.

**Regras já aplicadas**
- Multi-bloco (compromisso ocupa N slots consecutivos).
- Buffer (intervalo) respeitado para não “encostar” compromissos.
- Correção de dia da semana (timezone) para não deslocar sábado/domingo.

## 4) Modelo de dados (essencial)
Coleções principais (por tenant):
- `tenants/{tenantId}`
- `tenants/{tenantId}/users/{uid}` (membership)
- `userTenantIndex/{uid}` (índice global para resolver tenant no login)
- `tenants/{tenantId}/patients/{patientId}`
- `tenants/{tenantId}/appointmentSeries/{seriesId}`
- `tenants/{tenantId}/appointmentOccurrences/{occurrenceId}`
- `tenants/{tenantId}/occurrenceCodes/{codeId}` (a implementar)
- `tenants/{tenantId}/whatsappTemplates/{templateId}` (base pronta/previsto)
- `tenants/{tenantId}/settings/schedule` ✅

## 5) Como rodar localmente
1. `npm install`
2. `.env.local` deve ter:
   - `SERVICE_ACCOUNT_JSON_PATH=C:\secrets\agendapsi-admin.json`
   - `NEXT_PUBLIC_FIREBASE_*` (web config do Firebase do AgendaPsi)
   - `ADMIN_PASSWORD=...` (senha do Admin)
   - `ADMIN_UID=...` (**opcional** em dev)
3. `npm run dev`
4. Acessar:
   - `http://localhost:3000/login` → login profissional → `/profissional`
   - `http://localhost:3000/admin` → admin

## 6) Checklist de validação rápida
- Auth:
  - [ ] `/admin` entra com senha (`POST /api/auth` retorna 200)
  - [ ] `/login` redireciona para `/profissional`
- Schedule:
  - [ ] Admin salva schedule e ele aparece em `tenants/{tenantId}/settings/schedule`
  - [ ] Profissional (Dia/Semana/Mês) respeita horário aberto + almoço
- Agenda:
  - [ ] Criar Hold/Agendar multi-bloco bloqueia slots seguintes
  - [ ] Buffer impede criar item “encostado”
  - [ ] “Próximos horários” lista 3 opções e abre fluxo ao escolher
  - [ ] Semana: clique no horário livre abre Agendar/Reservar
  - [ ] Semana/Mês: clique em bloco ocupado abre detalhes

## 7) Próximos passos sugeridos (ordem recomendada)
1. **Mês**: clicar em área livre do dia para abrir Agendar/Reservar (igual Semana).
2. Implementar **painel de resumo do paciente** no agendamento (card lateral/summary panel).
3. **Códigos de ocorrência** + **Evolução/Prontuário por sessão** + histórico do paciente.
4. Editar recorrência: “só esta ocorrência” vs “esta e futuras”.
5. Firestore Rules: tenant isolation + hardening de produção.

## 8) O que anexar no próximo chat
Obrigatório:
1. ZIP do **projeto atual do AgendaPsi** (sem `node_modules/` e sem `.next/`)
2. Este arquivo (`docs/00_HANDOFF_PARA_NOVO_CHAT.md`) atualizado
Opcional:
3. `lembrete-psi.zip` apenas como referência de UI/código (nunca como base de dados)
