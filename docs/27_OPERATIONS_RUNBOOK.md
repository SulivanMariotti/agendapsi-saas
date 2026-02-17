# 27_OPERATIONS_RUNBOOK

Runbook operacional do **Lembrete Psi** para manter o sistema funcionando sem “surpresas” que virem falhas de constância.

> Clínica: falha operacional vira falha de cuidado ativo.

---

## Quick links (impressão / registro)
- **Checklist diário (1 página):** `docs/27A_DAILY_CHECKLIST_ONEPAGER.md`
- **Template de registro diário:** `docs/27B_DAILY_LOG_TEMPLATE.md`

## 1) Rotina diária (modo manual — recomendado)

### 1.1 Agenda (janela móvel)
- [ ] Admin → **Agenda** → **Carregar Planilha** (hoje → +30 dias)
- [ ] **Verificar** (conferir parsing e linhas problemáticas)
- [ ] **Sincronizar** (criar/atualizar; e cancelar futuros que “sumiram” do upload)

### 1.2 Lembretes
- [ ] **Gerar Preview do Disparo** (dryRun)
  - conferir contadores (enviáveis vs bloqueados)
  - olhar amostra (placeholders preenchidos)
- [ ] **Enviar lembrete**
- [ ] **Operação do Dia → Salvar registro** (auditoria)
  - opcional: **Marcar dia concluído** (somente com CHECK=0 e envio finalizado)
  - ver **Histórico (últimos 14 dias)** no card para comparar e diagnosticar rapidamente

### 1.3 Falha-segura (Admin)
No card **Operação do Dia**, o bloco **Falha-segura** aparece quando o sistema detecta risco real de erro humano ou falha de infraestrutura.

O que ele cobre:
- Env/credenciais ausentes (ex.: `FIREBASE_ADMIN_SERVICE_ACCOUNT_B64`)
- Admin SDK indisponível
- VAPID ausente (paciente não consegue ativar push no navegador)
- CHECK de push pendente (evita “achar que enviou”)
- Seleção com 0 prontos (tudo bloqueado)

Conduta operacional:
1. Leia o item (ele já traz o **como resolver**).
2. Clique **Reverificar** após ajustar.
3. Só avance para envio quando não houver falha crítica (level=error).

> Regra clínica: se houver muitos bloqueados por `no_token`, é sinal de risco de falta por não receber lembrete.

---

## 2) Rotina semanal

### 2.1 Presença/Faltas (constância)
- [ ] Importar planilha de presença/faltas (quando aplicável)
- [ ] Conferir painel de métricas (30/60/90 dias)
- [ ] Rodar **follow-ups** com `dryRun` antes
- [ ] Enviar follow-ups reais
  - já existe idempotência por `attendance_logs/{id}.followup.sentAt` (anti-spam)

---

## 3) Se o paciente não recebe lembrete

Checklist (ordem):
1. `users/{uid}.status` é `active`?
2. `users/{uid}.phoneCanonical` existe e está correto?
3. `subscribers/{phoneCanonical}.pushToken` existe?
4. Browser do paciente: notificação está `granted`?
5. Preview/dryRun no Admin mostra `blockedNoToken` / `inactive`?

Ação clínica (texto sugerido para contato humano):
- “Percebi que seus lembretes podem não estar chegando. Vamos ajustar isso para proteger sua constância — seu horário é um espaço de cuidado.”

---

## 4) Se aparecer `permission-denied` no paciente

- Agenda do paciente é **server-side** (`GET /api/patient/appointments`).
- Se aparecer `permission-denied`, normalmente é código antigo tentando ler `appointments` no client.
- Verifique se:
  - hook `usePatientAppointments` está atualizado
  - build/deploy está com a versão mais recente

---

## 5) Cron (opcional) — não confundir

- O endpoint `/api/cron/reminders` **não roda sozinho**.
- Só existe automação se você configurar Cron Jobs na Vercel.
- Se sua operação é manual, mantenha **zero Cron Jobs**.

---

## 6) Critérios de “ok para operar”

- Preview (dryRun) coerente e sem erros
- Sem falhas críticas em **Falha-segura**
- Paciente de teste ativo consegue:
  - abrir painel
  - ver próxima sessão (via API)
  - ativar notificações (quando permitido)
- Bloqueios aparecem com motivo (no_token, inactive, already_sent)
- Registro do dia salvo (reduz risco humano e facilita diagnóstico amanhã)

