# AgendaPsi — Painéis, Rotas e Permissões (decisão oficial)

Data: 2026-03-04

Este documento define **onde cada painel vive**, **quem acessa**, e **qual é a responsabilidade de cada um**.

> Decisão: adotamos a **Opção A** para separar claramente Admin do tenant do Painel do Profissional.

---

## 1) Painéis (4) — visão do produto

### 1.1 Super Admin (SaaS)
- **Objetivo:** controlar o SaaS (tenants, suspensão, owner link/invite, auditoria global).
- **Quem acessa:** somente usuários com claim global `role="admin"`.

### 1.2 Admin do tenant (Owner/Admin)
- **Objetivo:** configurar o tenant (agenda do profissional, códigos de ocorrência, portal do paciente, templates WhatsApp).
- **Quem acessa:** membership no tenant com `role in ["owner","admin"]`.
- **Observação:** é um painel administrativo do tenant, **não** é a agenda do dia a dia.

### 1.3 Profissional
- **Objetivo:** rotina clínica (agenda dia/semana/mês, agendamentos, status, evolução, prontuário).
- **Quem acessa:** membership no tenant com `role="professional"` (e também owner/admin, quando aplicável).

### 1.4 Paciente (portal)
- **Objetivo:** informativo (agenda do paciente, cadastro, termo, lembretes, biblioteca, anotações).
- **Quem acessa:** paciente autenticado no **Firebase app secundário** (`patientApp`).
- **Regra crítica:** **sem CTA de cancelar/remarcar**.

---

## 2) Rotas oficiais

### 2.1 Super Admin (SaaS)
- **Base:** `/admin`
- Exemplos:
  - `/admin` (painel)
  - `/admin` → menu “SaaS → Tenants”

### 2.2 Admin do tenant (Owner/Admin)
- **Base:** `/admin-tenant`
- Exemplo:
  - `/admin-tenant` (Portal do Paciente + Templates WhatsApp)

> Compatibilidade: a rota antiga `/profissional/configuracoes/tenant` foi mantida apenas como **redirect** para `/admin-tenant`.


### 2.2.1 Atalhos no Profissional
- Esse botão leva para `/admin-tenant` (e pode usar `?tab=...` para abrir uma aba específica, ex.: `?tab=schedule`).
- Objetivo: reduzir confusão e evitar “rotas perdidas”.

### 2.3 Profissional
- **Base:** `/profissional`

### 2.4 Paciente
- **Base:** `/paciente`

---

## 3) Autenticação e isolamento

### 3.1 Super Admin (SaaS)
- Autenticação e UI do painel Super Admin permanecem **separadas** do painel Profissional.
- Controle de permissão via claim global `role="admin"`.

### 3.2 Admin do tenant e Profissional (mesma sessão)
- Ambos usam a **sessão server-side** do profissional (cookie `__session`).
- A diferença é o **gate por role**:
  - `/admin-tenant`: somente `owner/admin`
  - `/profissional`: `professional` (e também `owner/admin`)

### 3.3 Paciente (isolado)
- `patientApp` (Firebase app secundário)
- Sem Firestore no client: tudo via APIs server-side.

---

## 4) Motivação da Opção A (por que esta decisão)

- Evita confusão UX (“configurações administrativas” misturadas com “rotina da agenda”).
- Mantém o modelo mental claro:
  - **Admin do tenant configura**,
  - **Profissional executa rotina**,
  - **Paciente consulta**,
  - **Super Admin gerencia o SaaS**.
- Segurança: reduz superfícies de erro e mantém guards explícitos por rota.

---

## 5) Checklist de validação (rápido)

- [ ] Owner/Admin acessa `/admin-tenant` e vê Portal/WhatsApp.
- [ ] Profissional comum recebe bloqueio em `/admin-tenant`.
- [ ] `/profissional/configuracoes/tenant` redireciona para `/admin-tenant`.
- [ ] Middleware exige `__session` em `/admin-tenant` e `/profissional`.
- [ ] Paciente permanece sem Firestore no client.

