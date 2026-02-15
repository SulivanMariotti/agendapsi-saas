# Lembrete Psi — Handoff para novo chat (2026-02-15)

Este pack serve para **iniciar um novo chat** e continuar o desenvolvimento **de onde paramos**.

---

## Contexto do projeto
- App: **Lembrete Psi**
- Stack: **Next.js (App Router) + Firebase (Firestore/FCM)**
- Diretriz clínica/UX (painel do paciente):
  - Foco: **lembrar, psicoeducar e responsabilizar**.
  - Evitar CTAs que facilitem cancelamento/remarcação (sem botão “cancelar”, sem WhatsApp como atalho para cancelar).

---

## Onde paramos (estado atual)
### Objetivo recente
- Corrigir fluxo de lembretes (48h/24h/12h) com:
  - **não duplicar push**,
  - **preencher placeholders** na mensagem,
  - garantir que **cancelamento via planilha diária** interrompa 24h/12h (sessão “sumiu do upload” → cancela).

### Último estado validado
- Push chegou **apenas 1x** (sem duplicar).
- Houve teste com planilha simples e placeholders preenchidos.
- Implementada limpeza de dados de teste via script (pasta `scripts/`).

---

## Regras de negócio consolidadas (agenda + import)
### Import diário em janela móvel (30 dias)
- Você exporta **hoje → hoje+30d** diariamente.
- O sistema deve:
  1) **criar/atualizar** sessões do upload;
  2) marcar como **cancelled/missing_in_upload** as sessões FUTURAS dentro da janela que existiam antes, mas **não vieram** no upload atual.
- Isso evita enviar lembretes 24h/12h para sessão que foi cancelada no sistema da clínica.

### Disparo de lembretes
- O sistema **não agenda “fila futura”** no momento do 48h.
- Cada disparo (48/24/12) **filtra por janela** e envia somente as sessões elegíveis daquele momento.

---

## Correções recentes importantes
### 1) Push duplicado (2x)
- Causa típica: payload + Service Worker mostrando duas vezes.
- Solução aplicada:
  - Ajuste no **Service Worker** para **não** chamar `showNotification()` quando `payload.notification` existe.
  - Backend envia `webpush.notification` com `tag` (`dedupeKey`) + `data` para auditoria/deep link.

### 2) Placeholders não preenchidos
- Suporte a placeholders PT/EN na interpolação:
  - `{nome}/{profissional}/{data}/{hora}` e `{name}/{professional}/{date}/{time}`
- `AdminScheduleTab` foi ajustado para mapear templates `msg1/msg2/msg3` no parse e enviar `messageBody` já pronto quando disponível.

### 3) Reconciliação “sumiu do upload”
- Ajuste na sincronização da agenda para cancelar sessões FUTURAS na janela do upload quando não vierem no CSV do dia.

---

## Arquivos alterados (consolidado desde o último pack)
- `src/app/api/admin/reminders/send/route.js`
- `firebase-messaging-sw.js`
- `src/components/Admin/AdminScheduleTab.js`
- `src/components/Admin/AdminHistoryTab.js` (campanhas/slots)
- `src/components/Admin/AdminPatientsTab.js` + `src/app/api/admin/patients/list/route.js` (paginação/filtros/busca/perf)
- `src/components/DesignSystem.js` (min-h-0 no Card)
- `scripts/purgeAttendanceLogs.cjs` (limpar sujeira de testes no Firestore)

---

## Próximo passo sugerido
- Consolidar idempotência por sessão+slot no Firestore (`appointments/{id}.reminders.slotX.sentAt`) para evitar qualquer duplicidade mesmo em retries (opcional se você não estiver vendo duplicidade).
- Criar endpoint/admin action “limpar dados de teste” (somente em dev) com confirmação forte (opcional).
