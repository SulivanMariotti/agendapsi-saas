# Manual de Uso — Painel Admin (Agenda + Presença/Faltas)

> Norte clínico: **constância é cuidado**.  
> O Lembrete Psi existe para sustentar vínculo terapêutico por meio de lembretes e psicoeducação — **sem atalhos de cancelamento/remarcação**.

---

## 1) Agenda — Finalidade

A Agenda existe para reduzir faltas por esquecimento/caos do dia a dia e proteger o “horário sagrado” do cuidado.

- O sistema assume a carga mental de lembrar.
- A sessão **existe** independentemente de confirmação.
- O painel do paciente **não** deve facilitar cancelar/remarcar.

---

## 2) Agenda — Fluxo diário (modo manual)

Caminho: **Admin → Agenda → Carregar Planilha → Verificar → Sincronizar → Gerar Preview do Disparo → Enviar lembrete**

1. **Carregar Planilha**
   - Cole/importe o CSV da agenda (ex.: janela de 30 dias à frente).
2. **Verificar**
   - Valida formato, datas, duplicidades e consistência.
3. **Sincronizar**
   - Grava a agenda como “fonte única da verdade”.
4. **Gerar Preview do Disparo**
   - Calcula quem receberá lembretes e aponta bloqueios.
   - **Regra de ouro:** se houver **CHECK** (push não confirmado), faça preview antes do envio.
5. **Enviar lembrete**
   - Execute o envio somente após preview coerente (sem CHECK).

---

## 3) Presença/Faltas — Finalidade

O painel de Presença/Faltas existe para transformar constância em **fator de evolução**:

- Dar visibilidade à continuidade (presença/falta).
- Disparar follow-ups psicoeducativos:
  - **Presença:** reforço positivo e autonomia.
  - **Falta:** firmeza com cuidado (“faltar interrompe o processo”).

---

## 4) Presença/Faltas — Importação (CSV)

1. **Colar/Carregar CSV**
2. **Validar (Dry-run)**
   - Mostra o que será gravado sem gravar.
   - Se o CSV mudar, valide novamente (preview invalida).
3. **Confirmar (Commit)**
   - Grava em `attendance_logs`.

---

## 5) Follow-ups — Idempotência

O envio de follow-ups é protegido contra duplicidade:

- Se `attendance_logs/{id}.followup.sentAt` existir, **não reenviar**.

---

## 6) Diagnóstico rápido (bloqueios)

- **SEM_PUSH**: paciente sem assinatura válida de push
  - orientar abrir painel do paciente e permitir notificações; verificar VAPID/env.
- **INATIVO**: cadastro desativado (não enviar)
- **SEM_TELEFONE**: telefone ausente/inválido (corrigir cadastro com telefone canônico)
- **CHECK**: push não consultado para a seleção (rodar Preview)
- **JÁ_ENVIADO / already_sent**: proteção contra duplicidade (normal)
- **permission-denied**: leitura sensível no client (use server-side/Admin SDK)

---

## 7) Boas práticas (clínicas + operação)

- Evite tom punitivo. Use linguagem de vínculo e responsabilidade.
- Sem CTA de cancelamento/remarcação no painel do paciente.
- WhatsApp (quando existir) apenas para **confirmação**, nunca como “atalho de desistência”.
- Em dia corrido: use o **Preview** + CSV de diagnóstico para agir com objetividade.

