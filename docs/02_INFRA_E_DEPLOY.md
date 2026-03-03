# Infra e Deploy — AgendaPsi

Atualizado: **2026-03-02**

## Domínios
- **AgendaPsi (SaaS)**: `agendapsi.msgflow.app.br`
- **Lembrete Psi (legado, separado)**: `agenda.msgflow.app.br`

> Regra crítica: **não compartilhar** Firebase Project, Firestore, Rules ou deploy entre os dois sistemas.

## Firebase (AgendaPsi)
Componentes previstos:
- Auth
- Firestore
- Storage (quando necessário)
- FCM (Pós-MVP / quando aplicável)

## Variáveis de ambiente (local)
Arquivo: `.env.local`
- `SERVICE_ACCOUNT_JSON_PATH=...` (Admin SDK)
- `NEXT_PUBLIC_FIREBASE_*` (web config do Firebase do AgendaPsi)
- `ADMIN_PASSWORD=...`
- `ADMIN_UID=...` (opcional em dev)

## Deploy
- Separar projeto e pipeline (Vercel ou equivalente).
- Garantir que `agendapsi.msgflow.app.br` aponta para o deploy do AgendaPsi.
- Garantir que `agenda.msgflow.app.br` continua apontando para o Lembrete Psi (sem alterações).
