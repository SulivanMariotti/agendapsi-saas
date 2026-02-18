# 30_DEPLOY_ENV_CHECKLIST

Checklist de deploy e ambientes (Next.js App Router + Firebase) para evitar regressões que quebram lembretes.

> Se o deploy quebra o push/import/envio, a constância sofre.
> Use este checklist antes de publicar.

---

## 1) Variáveis de ambiente (Next.js)

Verifique no ambiente (Vercel/Render/etc.):

Public (client):
- [ ] `NEXT_PUBLIC_FIREBASE_API_KEY`
- [ ] `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- [ ] `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- [ ] `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- [ ] `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- [ ] `NEXT_PUBLIC_FIREBASE_APP_ID`

Server/Admin (somente server-side):
- [ ] `FIREBASE_ADMIN_SERVICE_ACCOUNT` **ou** `FIREBASE_ADMIN_SERVICE_ACCOUNT_B64`
- [ ] `CRON_SECRETS` (se usar `/api/cron/*`; recomendado)
- [ ] `CRON_SECRET` (compat; opcional)
- [ ] `ALLOW_CRON_QUERY_KEY=false` (produção: manter false; só true como transição)
- [ ] `AUTH_GATE_PASSWORD` (se o gate/admin auth estiver habilitado)

Retencao (recomendado em producao):
- [ ] `HISTORY_RETENTION_DAYS` (padrao 180)
- [ ] `AUDIT_RETENTION_DAYS` (padrao 365)

> Nunca expor secrets em `NEXT_PUBLIC_*`.

---

## 2) Domínio e HTTPS (push exige)

- [ ] Site em HTTPS
- [ ] Domínio final configurado (sem misturar vários domínios de teste)
- [ ] Service Worker disponível em caminho correto
- [ ] Sem bloqueios de CSP que impeçam SW/push

---

## 3) Firebase Console

- [ ] Firestore Rules publicadas (ver doc 25)
- [ ] Authentication configurado conforme modo atual
- [ ] Cloud Messaging/Web Push configurado (VAPID se aplicável)
- [ ] TTL (opcional): habilitado em `expireAt` para `history` e `audit_logs` (doc 75)

---

## 4) Smoke tests pós-deploy (mínimo)

Paciente teste (ativo):
- [ ] abre painel
- [ ] vê próxima sessão
- [ ] ativa notificações
- [ ] token grava em `subscribers/{phoneCanonical}`

Admin:
- [ ] upload/import agenda funciona
- [ ] dryRun retorna contagens e amostras
- [ ] envio real funciona e loga em `history`

Paciente inativo:
- [ ] envios bloqueados server-side e logados

---

## 5) Logs e observabilidade

- [ ] `history` recebendo logs de envio/dryRun/bloqueio (PII mascarada)
- [ ] `audit_logs` recebendo logs de acoes administrativas
- [ ] console do deploy sem erros recorrentes
- [ ] troubleshooting disponível (doc 18)

---

## 6) Rollback

- [ ] Existe um commit/tag estável para voltar
- [ ] Mudanças de rules e env vars documentadas em `history`/`audit_logs`

---

## 7) Regra clínica final

Se o deploy for “incerto”, ele vira lembrete incerto.
E lembrete incerto vira falta provável.
