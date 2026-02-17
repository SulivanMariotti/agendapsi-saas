# 27A — Checklist diário (1 página) — Operação manual

**Propósito clínico:** este checklist existe para proteger a **constância**. Quando o lembrete falha, a sessão “some” da semana e o vínculo sofre. A regularidade é parte do cuidado.

> Regra de UX clínica (painel do paciente): **não** oferecer atalhos/botões de cancelar/remarcar. O sistema serve para lembrar e sustentar presença.

---

## A) Preparação (1–2 min)
- [ ] Você está logada no **Admin**.
- [ ] Você tem a **planilha do dia** (agenda) disponível.
- [ ] Se hoje é sábado/domingo/feriado: **rode do mesmo jeito** (janelas 48h/24h/12h dependem de rotina diária).

> Por que isso importa: o envio trabalha por **janelas** (48h/24h/12h) com tolerância. Se o processo “pula” dias, aumentam as chances de sessões ficarem sem o lembrete certo.

---

## B) Agenda (Admin → Agenda) — 5–10 min
1. [ ] **Admin → Agenda → Carregar Planilha**
2. [ ] Selecione a planilha **do período móvel** (hoje → +30 dias)
3. [ ] Clique **Verificar**
   - [ ] Conferir se o parsing fez sentido (datas/horários)
   - [ ] Conferir linhas problemáticas (e corrigir a origem quando necessário)
4. [ ] Clique **Sincronizar**
   - [ ] Verifique contadores (criadas/atualizadas)
   - [ ] Atenção para “futuros removidos do upload” (é esperado quando a agenda mudou; mantém histórico)

**Se deu erro aqui:** não siga para envio “no escuro”. Registre no log e corrija a causa.

---

## C) Lembretes (48h/24h/12h) — 3–5 min
> Se o bloco **Falha-segura** aparecer em “Operação do Dia”, **leia e corrija antes** de seguir. Ele indica risco real de enviar no escuro.

1. [ ] Clique **Gerar Preview do Disparo** (dryRun)
2. [ ] Confira os contadores principais:
   - [ ] **Enviáveis** (sendable)
   - [ ] **Bloqueados** por motivo: `no_token`, `inactive`, `already_sent`
3. [ ] Confira uma amostra de mensagens:
   - [ ] Placeholders preenchidos: `{nome}`, `{data}`, `{hora}`, `{profissional}`

### Decisão rápida
- Se **muitos `no_token`**:
  - isso é risco clínico (mais chance de falta por não receber lembrete).
  - ação técnica: revisar se o paciente ativou notificações / se existe `pushToken`.

---

## D) Envio — 1 min
1. [ ] Clique **Enviar lembrete**
2. [ ] Confirme no retorno (toast/resultado) que houve **sucesso** e quantos foram enviados.

---

## E) Pós-envio (2 min)
- [ ] Abra o painel do **paciente de teste** e confirme:
  - [ ] sessão aparece na agenda (server-side)
  - [ ] cards/mantra carregam
- [ ] Admin → Agenda → **Operação do Dia**:
  - [ ] **Salvar registro**
  - [ ] (opcional) **Marcar dia concluído** (somente com CHECK=0)
- [ ] (se precisar) **Histórico (últimos 14 dias)**: abra e compare com dias anteriores (falhas recorrentes, picos de no_token, etc.)
- [ ] Se você preferir registro fora do sistema: use `docs/27B_DAILY_LOG_TEMPLATE.md`

---

## F) Diagnóstico rápido (quando algo sai do esperado)

| Sintoma | Causa provável | Ação imediata |
|---|---|---|
| Muitos `no_token` | paciente não ativou push / token ausente | checar `subscribers/{phoneCanonical}.pushToken` e orientar ativação |
| Muitos `inactive` | paciente desativado | validar `users/{uid}.status` |
| Quase tudo `already_sent` | reenvio na mesma janela | ok (idempotência funcionando) |
| `permission-denied` no paciente | código tentando ler `appointments` no client | confirmar uso do `GET /api/patient/appointments` + deploy atualizado |
| Falha-segura: credenciais/SDK | env ausente ou Admin SDK não inicializa | Vercel → Settings → Environment Variables → corrigir e re-deploy |

