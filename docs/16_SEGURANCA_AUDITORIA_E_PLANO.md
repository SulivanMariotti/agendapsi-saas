# Segurança — auditoria rápida e plano de correção (atualizado em 2026-02-18)

Este documento organiza os **riscos de segurança** encontrados no estado atual do repositório e define a **ordem de execução** das correções (do menor score para o maior), até ficar **pronto para produção**.

> Diretriz clínica: segurança aqui não é “burocracia” — é **cuidado**. Vazamento/erro de autorização quebra confiança e fragiliza vínculo.

---

## 1) Notas (0–10) por área

| Área | Nota | Situação | Observação objetiva |
|---|---:|---|---|
| Gestão de segredos (env/keys) | 1/10 | 🔴 Atenção | `.env.local` apareceu no zip enviado (mesmo que não seja commitado). Garantir **.gitignore**, não compartilhar em entregas e **rotacionar** se houver risco de exposição. |
| Autenticação Admin | 6/10 | 🟠 Melhorar | `role=admin` via token/claim está ok, mas **/api/auth sem rate limit** mantém risco de bruteforce. |
| Autenticação do Paciente | 2/10 | 🔴 Bloqueador | Existe emissão de token por **e-mail sem prova** (se souber o e-mail, entra). |
| Autorização/RBAC (APIs) | 2/10 | 🔴 Bloqueador | Fallback baseado em `users/{uid}.role` + rules atuais permitem **escalonamento** se o campo for editável. |
| Firestore Rules | 5/10 | 🟠 Melhorar | “deny by default” ok, mas precisa **travar campos críticos** (ex.: `role`, identidade, `patientId` imutável em updates). |
| Proteções de rotas (rate limit, erros, CSRF/origin) | 6/10 | 🟠 Melhorar | Algumas rotas estão ok, mas endpoints sensíveis precisam de hardening consistente e erros não podem vazar detalhes. |
| Privacidade (PII) e logs | 6/10 | 🟠 Melhorar | Logs/auditoria úteis; precisa **política de retenção** e minimizar PII acessível. |
| Headers de segurança (CSP/HSTS etc.) | 3/10 | 🟠 Melhorar | Falta camada de headers de hardening no Next. |
| Cron/segredos em URL | 6/10 | 🟠 Melhorar | Melhor evitar `?key=` em querystring quando possível; preferir header + rotação. |
| Painel do Paciente (superfície de dados) | 3/10 | 🔴 Bloqueador | Se identidade do paciente puder ser alterada, há risco de **ver agenda de outra pessoa**. |

---

## 2) Ordem de execução (do menor score para maior)

### 0) Segredos (checar e blindar compartilhamento)
- [ ] Confirmar `.gitignore` bloqueando `.env*` (e quaisquer chaves).
- [ ] **Nunca** incluir `.env.local` em zip de entrega.
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
- [x] Padronizar erros: não vazar `e.message` cru (retornar mensagem segura + log interno).
- [ ] Revisar origin checks de maneira consistente.

### 6) Headers de segurança (Next)
- [x] Adicionar headers: HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
- [x] Definir CSP compatível (sem quebrar Firebase/Next). Ajustar iterativamente.

### 7) Política de logs/PII
- [ ] Definir retenção e acesso (somente admin).
- [ ] Reduzir PII onde possível (ex.: armazenar telefone mascarado em logs públicos; manter completo só onde necessário).

### 8) Cron secret (melhor prática)
- [ ] Preferir secret em header, não querystring.
- [ ] Rotação periódica + logging de tentativas inválidas.

---

## 3) “Pronto para produção” (Definition of Done)

- [ ] **Nenhum** fluxo de login paciente sem verificação habilitado em produção.
- [ ] Rules impedem: (a) escalonamento de `role`; (b) edição de identidade; (c) troca de owner/patientId em updates.
- [ ] Endpoints admin com rate limit e mensagens de erro seguras.
- [ ] Headers de hardening ativos.
- [ ] Política de logs/retenção definida e aplicada.
