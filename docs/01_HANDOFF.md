# Lembrete Psi — Handoff para novo chat (2026-02-19)

Este pack serve para iniciar um novo chat e continuar o desenvolvimento **de onde paramos**, sem perder decisões clínicas/técnicas.

---

## Contexto do projeto
- App: **Lembrete Psi**
- Stack: **Next.js (App Router) + Firebase (Firestore/FCM + Admin SDK + Web Push)**
- Diretriz clínica/UX (painel do paciente):
  - foco em **lembrar + psicoeducar + responsabilizar**
  - **sem botão/CTA de cancelar/remarcar**
  - WhatsApp (quando existir): **apenas confirmação de presença**

---

## Estado atual

### Operação (manual)
Rotina diária (Admin → Agenda):
1) Carregar Planilha (janela **hoje → +30 dias**)
2) Verificar
3) Sincronizar
4) Gerar Preview do Disparo (dryRun)
5) Enviar lembrete

> Cron **não** está habilitado (decisão: operação manual). Rotas `/api/cron/*` estão prontas e seguras para futuro (header-only + rotação de secret).

### Segurança (v1 concluída)
- Login paciente por e-mail **desativado por padrão**; vínculo por **telefone+código**.
- Admin apenas via **custom claims**; sem fallback em `users.role`.
- Regras Firestore endurecidas (usuário não edita identidade/role; audit/subscribers admin-only; notes travadas).
- Headers/HSTS/CSP em produção + rate limit + origin guard.
- Retenção: `expireAt` + TTL ativo em `history` e `audit_logs`.

### Biblioteca (Paciente + Admin)
- Paciente: menu **Biblioteca** com modal rolável, busca, “Para levar para a sessão” e mantra fixo.
- Admin: repositório de artigos (CRUD) com publicação; categorias (CRUD) + criação inline no editor.


### Presença/Faltas (Admin)
- Import CSV aceita `;`/`,`/TAB (autodetect) e remove BOM.
- Colunas obrigatórias: **ID** + (**DATA/HORA** ou **DATA**+**HORA**).
- Colunas opcionais: NOME/PROFISSIONAL/SERVIÇOS/LOCAL/STATUS/**TELEFONE** (gera warnings, não bloqueia).
- Follow-ups: envio fica **bloqueado** quando paciente não está vinculado (segurança contra envio para pessoa errada).

---

## Próximos passos recomendados
1) Painel de **constância (30 dias)** no Admin (Presença/Faltas): métricas + insights clínicos (sem moralismo).
2) Suporte a **segunda planilha/relatório** de presença/faltas (import e painel).
3) Documentação do modelo NoSQL + chave única do paciente.
