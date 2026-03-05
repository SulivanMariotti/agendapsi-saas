# Dependências + variáveis de ambiente — AgendaPsi

Atualização: **2026-03-02**

## 1) Dependências principais (package.json)
- next: `16.1.6`
- react: `19.2.3`
- react-dom: `19.2.3`
- firebase: `^12.8.0`
- firebase-admin: `^13.6.1`
- lucide-react: `^0.563.0`

> Observação: evitar upgrades “no escuro”. Se for atualizar Next/Firebase, fazê-lo em um passo dedicado com checklist de regressão (Admin/Profissional/Paciente).

## 2) Variáveis obrigatórias (.env.local)
### Firebase + Admin SDK
- `SERVICE_ACCOUNT_JSON_PATH=...` (caminho do JSON da service account do **Firebase do AgendaPsi**)
- `NEXT_PUBLIC_FIREBASE_API_KEY=...`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID=...`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...`
- `NEXT_PUBLIC_FIREBASE_APP_ID=...`

### Admin (login por senha no /admin)
- `ADMIN_PASSWORD=...`
- `ADMIN_UID=...` (opcional em dev)

## 3) Variáveis do Portal do Paciente (dev / opcionais)
- `ENABLE_PATIENT_DEV_TOKEN=true` (somente dev; se existir fluxo de demo)
- `NEXT_PUBLIC_ENABLE_PATIENT_DEV_DEMO=true` (somente dev; exibe botão “demo”)
- `PATIENT_ACCESS_CODE_TTL_MIN=15` (se usar login por código one-time)

## 4) Gotchas de dev (Windows / Turbopack)
- Se aparecer erro “params undefined” em rotas dinâmicas, reiniciar dev server e limpar `.next`.
- Ao aplicar hotfix em runtime:
  - `Ctrl + C`
  - apagar `.next`
  - `npm run dev`
