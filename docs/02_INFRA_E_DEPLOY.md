# 02 — Infra e Deploy (o que foi feito e como repetir)

**Data:** 2026-02-28  
**Objetivo:** documentar setup de GitHub + Vercel + Cloudflare + Firebase do AgendaPsi SaaS.

---

## 1) Repositórios (GitHub)
### 1.1 Template (origem)
- `https://github.com/SulivanMariotti/lembrete-psi.git`

### 1.2 Novo produto (destino)
- `https://github.com/SulivanMariotti/agendapsi-saas.git`

### 1.3 Passos executados (Windows)
1) Criar repo vazio no GitHub: `agendapsi-saas` (private, sem README/.gitignore/license).
2) Clonar template e renomear pasta:
   - `git clone https://github.com/SulivanMariotti/lembrete-psi.git agendapsi-saas`
3) Entrar na pasta:
   - `cd agendapsi-saas`
4) Trocar remote origin:
   - `git remote set-url origin https://github.com/SulivanMariotti/agendapsi-saas.git`
5) Verificar:
   - `git remote -v`
6) Push:
   - `git push -u origin main`
7) Verificar status:
   - `git status` → up to date com `origin/main`.

---

## 2) Vercel (deploy do app)
### 2.1 Projeto
- Deploy: `https://agendapsi-saas.vercel.app/`

### 2.2 Variáveis de ambiente (Vercel)
Criadas (Production + Preview + Development):
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` (se existir)

Após cadastrar as env vars → **Redeploy** em Deployments.

### 2.3 Domínio custom
- Domínio: `agendapsi.msgflow.app.br`
- Status final: **Valid Configuration**

---

## 3) Cloudflare (DNS)
### 3.1 Registro criado
- Tipo: `CNAME`
- Name: `agendapsi`
- Target: `d0965d8a5fd2e013.vercel-dns-017.com`
- Proxy: **DNS only** (proxy desligado)

Observação: na Vercel apareceu “Proxy Detected”; foi necessário desligar proxy (nuvem cinza).

---

## 4) Firebase (projeto separado)
### 4.1 Projeto
- Nome: AgendaPsi SaaS
- Project ID: `agendapsi-saas`

### 4.2 Firestore
- Modo: Standard
- Região: `southamerica-east1 (São Paulo)`
- Modo de regras inicial: criado em produção (regras serão definidas depois)

### 4.3 Authentication
- Método: Email/Senha habilitado
- Domínios autorizados: incluir `agendapsi.msgflow.app.br`

### 4.4 Web App
- App web registrado (para obter `firebaseConfig`).
- `firebaseConfig` foi distribuído via env vars no Vercel (não registrar chaves aqui).

---

## 5) Próximos passos de infra (recomendado)
- Definir **Firestore Rules** por tenant/role.
- (Hardening) App Check.
- (Escala) Jobs para materialização de ocorrências (Cloud Tasks/Scheduler) — a planejar quando entrar na implementação.


---

## 6) Variáveis de ambiente (DEV)
Arquivo: `.env.local`

Obrigatórias:
- `SERVICE_ACCOUNT_JSON_PATH=C:\secrets\agendapsi-admin.json`
- `NEXT_PUBLIC_FIREBASE_*` (web config do Firebase do AgendaPsi)
- `ADMIN_PASSWORD=...`

Opcionais (DEV):
- `ADMIN_UID=...` (em dev pode ficar vazio; o `/api/auth` usa fallback)

Observação:
- Em produção, recomenda-se definir `ADMIN_UID` para fixar o usuário admin.
