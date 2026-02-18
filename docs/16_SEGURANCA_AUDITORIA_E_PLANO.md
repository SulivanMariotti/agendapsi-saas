# Segurança — auditoria rápida e plano de correção (atualizado em 2026-02-18)

Este documento organiza os **riscos de segurança** encontrados no estado atual do repositório e define a **ordem de execução** das correções (do menor score para o maior), até ficar **pronto para produção**.

> Diretriz clínica: segurança aqui não é “burocracia” — é **cuidado**. Vazamento/erro de autorização quebra confiança e fragiliza vínculo.

---

## 1) Notas (0–10) por área

| Área | Nota | Situação | Observação objetiva |
|---|---:|---|---|
| Gestão de segredos (env/keys) | 1/10 | 🔴 Atenção | `.env.local` apareceu no zip enviado (mesmo que não seja commitado). Garantir **.gitignore**, não compartilhar em entregas e **rotacionar** se houver risco de exposição. |
| Autenticação Admin | 6/10 | 🟠 Melhorar | `role=admin` via token/claim está ok, mas endpoints sensíveis precisam de rate limit + checagens consistentes. |
| Autenticação do Paciente | 2/10 | ✅ Resolvido | Login por e-mail sem prova foi desativado por padrão; fluxo principal é **pair-code**. |
| Autorização/RBAC (APIs) | 2/10 | ✅ Resolvido | Removido fallback inseguro baseado em `users/{uid}.role` no `requireAdmin`. |
| Firestore Rules | 6/10 | 🟠 Melhorar | “deny by default” ok; manter revisão contínua de imutabilidade (owner/patientId) em coleções futuras. |
| Proteções de rotas (rate limit, erros, CSRF/origin) | 8/10 | ✅ Resolvido | Rate limit + erros padronizados + origin checks consistentes via `originGuard` em rotas sensíveis. |
| Privacidade (PII) e logs | 7/10 | ✅ Resolvido | `history` mascara telefone/e-mail e tokens; `history`/`audit_logs` com `expireAt` + opção TTL/cron. |
| Headers de segurança (CSP/HSTS etc.) | 7/10 | ✅ Resolvido | Headers aplicados; **CSP ENFORCE em produção** (Report-Only apenas em dev). |
| Cron/segredos em URL | 8/10 | ✅ Resolvido | Produção prioriza header (Authorization/x-cron-secret), com rotação via `CRON_SECRETS` e logs seguros; `?key=` só como transição (flag). |
| Painel do Paciente (superfície de dados) | 7/10 | ✅ Resolvido | Identidade do paciente está blindada; agenda vem por API server-side, reduzindo risco de troca de identidade no cliente. |

---

## 2) Ordem de execução (do menor score para maior)

### 0) Segredos (checar e blindar compartilhamento)
- [x] Confirmar `.gitignore` bloqueando `.env*` (e quaisquer chaves).
- [x] **Nunca** incluir `.env.local` em zip de entrega (script `npm run security:check`).
- [ ] Se qualquer segredo já foi exposto fora do ambiente local, **rotacionar** imediatamente.

### 1) Desativar login paciente por e-mail (sem verificação) — BLOQUEADOR
- [x] Bloquear/ocultar fluxo `patientLoginByEmail` em **produção** (feature flag/env).
- [x] Manter apenas fluxo seguro (ex.: **pair-code** já existente, ou OTP/magic link).

### 2) Corrigir RBAC / evitar escalonamento — BLOQUEADOR
- [x] Remover/neutralizar fallback inseguro baseado em `users/{uid}.role` no `requireAdmin`.
- [x] Travar `users/{uid}.role` para escrita **apenas por admin** (rules + API server-side).
- [x] Travar campos críticos de identidade (ver item 3).

### 3) Blindar identidade do paciente — BLOQUEADOR
- [x] Impedir update de `users/{uid}` em campos que definem identidade (ex.: `phoneCanonical`, `email`).
- [x] Garantir que endpoints do paciente resolvam dados somente do **próprio** `uid/patientId` (sem depender de campo editável pelo cliente).

### 4) Firestore Rules: imutabilidade de chaves em updates
- [x] `patient_notes`: impedir alteração de `patientId` no update.
- [ ] Validar padrões semelhantes em coleções onde um “ownerId/patientId” não pode mudar.

### 5) Hardening de rotas (rate limit + erros)
- [x] Rate limit em `/api/auth` e endpoints sensíveis (inclui fluxos de login).
- [x] Padronizar erros: não vazar detalhes internos (retornar mensagem segura + log interno).
- [ ] Revisar origin checks de maneira consistente.

### 6) Headers de segurança (Next)
- [x] Adicionar headers: HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
- [x] Definir CSP compatível (sem quebrar Firebase/Next).
- [x] Ativar **ENFORCE em produção** (Report-Only apenas em dev).

### 7) Política de logs/PII
- [x] Definir retenção e acesso (somente admin).
- [x] Reduzir PII em `history` e `audit_logs`.
- [x] Adicionar `expireAt` para suportar **Firestore TTL** ou limpeza por cron.
  - Doc: `docs/75_RETENCAO_LOGS_TTL_E_CRON.md`
  - [x] TTL habilitado no Firestore: policies `history.expireAt` e `audit_logs.expireAt`

### 8) Cron secret (melhor prática)
- [x] Preferir secret em header (Authorization/x-cron-secret), não querystring.
- [x] Rotação periódica (suporte a múltiplos segredos via `CRON_SECRETS`) + logging seguro de tentativas inválidas.
- [x] Query `?key=` desativado por padrão em produção (só com `ALLOW_CRON_QUERY_KEY=true` como transição).

---

## 3) “Pronto para produção” (Definition of Done)

- [x] **Nenhum** fluxo de login paciente sem verificação habilitado em produção.
- [x] Rules impedem: (a) escalonamento de `role`; (b) edição de identidade; (c) troca de owner/patientId em updates.
- [x] Endpoints admin com rate limit e mensagens de erro seguras.
- [x] Headers de hardening ativos.
- [x] Política de logs/retenção definida e aplicada.

Pontos finais (antes de escalar usuarios):
- [x] CSP **ENFORCE** em produção (Report-Only apenas em dev)
- [x] Checklist de segredos (evitar `.env.local` em entregas) e rotacao, se preciso

---

## Controles operacionais (segredos)
- `.env*` é **local** e nunca entra em repositório/zip.
- Template: `.env.example`.
- Check manual antes de release/compartilhamento: `npm run security:check`.
