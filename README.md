# AgendaPsi (SaaS)

Atualizado: **2026-03-02**

Agenda clínica focada na rotina do profissional, organização e constância.

## Stack
- Next.js (App Router)
- Firebase (Auth/Firestore/Storage/FCM quando aplicável)

## Domínio
- `agendapsi.msgflow.app.br` (AgendaPsi)
- `agenda.msgflow.app.br` (Lembrete Psi — projeto separado)

## Rodar local
1. `npm install`
2. Criar `.env.local` com:
   - `SERVICE_ACCOUNT_JSON_PATH=...`
   - `NEXT_PUBLIC_FIREBASE_*`
   - `ADMIN_PASSWORD=...`
   - `ADMIN_UID=...` (opcional em dev)
3. `npm run dev`

## Rotas
- Profissional: `/login` → `/profissional`
- Admin: `/admin`

## Documentação
- Handoff: `docs/00_HANDOFF_PARA_NOVO_CHAT.md`
- Onde paramos: `docs/00_ONDE_PARAMOS.md`
- Modelo de dados: `docs/02_MODELO_DADOS.md` + `docs/03_MODELO_FIRESTORE.md`
- Segurança: `docs/03_SEGURANCA_E_RULES.md`
- Agenda MVP: `docs/10_AGENDA_OCORRENCIAS_E_HOLDS_MVP.md`
- Registros:
  - Evolução: `docs/14_PRONTUARIO_E_EVOLUCAO_POR_SESSAO.md`
  - Ocorrências extra: `docs/16_OCORRENCIAS_REGISTRO_EXTRA.md`
