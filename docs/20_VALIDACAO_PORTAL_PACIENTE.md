# Validação — Portal do Paciente (Step 18)

Data: 2026-03-02  
Escopo: validar o **Painel do Paciente** (portal) com a fonte da verdade no **AgendaPsi (Profissional/Admin)**, sem CSV e sem listeners Firestore no client.

> Objetivo desta validação: garantir que o portal está **funcional**, **linkado ao Admin** e **seguro** (acesso mínimo), antes de endurecer Rules e preparar produção.

---

## 1) Pré-requisitos

- Projeto rodando local: `npm run dev`
- Tenant de teste e seed funcionando (ex.: `tn_JnA5yU`)
- Pelo menos **1 paciente** e **1 ocorrência futura** vinculada (via agenda do Profissional)
- Portal do paciente já com:
  - Login por **código de acesso** (6 dígitos)
  - Sessão do paciente isolada do profissional (Firebase app secundário)
  - Biblioteca, Contrato, Lembretes, Anotações

Sugestão de ambiente:
- Manter 2 abas abertas:
  - Aba A: `/profissional`
  - Aba B: `/paciente`

---

## 2) Matriz de testes (rápida)

### T01 — Regressão: profissional intacto
1. Acessar `/login` e entrar como Profissional
2. Abrir `/profissional` e navegar Dia/Semana/Mês
3. Abrir um agendamento no overlay

**Esperado**
- Sem erros no console
- Visão Mês abre sem `monthLabel is not defined`
- Overlay abre e fecha normalmente

---

### T02 — Gerar código de acesso do paciente
1. No overlay de um agendamento com paciente, localizar “Código de acesso do paciente”
2. Clicar **Gerar**
3. Copiar o código

**Esperado**
- Código com 6 dígitos exibido
- Exibe expiração (TTL)
- Sem erro no console / network

---

### T03 — Login do paciente (sem derrubar sessão do profissional)
1. Na aba B, abrir `/paciente`
2. Informar o código gerado (T02) e entrar

**Esperado**
- Login bem sucedido
- Sessão do profissional continua ativa na aba A
- Sem mensagem “Acesso restrito ao paciente.”

---

### T04 — Agenda do paciente (fonte = AgendaPsi do Profissional)
1. No portal do paciente, verificar:
   - “Próxima sessão”
   - “Próximos agendamentos”
2. Confirmar datas/horários batem com a agenda do Profissional

**Esperado**
- Lista reflete as ocorrências futuras do AgendaPsi
- **Não há CTA** de cancelar/remarcar
- Nenhum dado clínico aparece (evolução/ocorrências extra)

---

### T05 — “Seu cadastro” (fonte = cadastro completo no Profissional)
1. No portal do paciente, localizar “Seu cadastro”
2. Conferir campos mínimos (nome/telefone, etc.)
3. No Profissional, editar dados do paciente (`/profissional/pacientes/{patientId}`) e salvar
4. Recarregar o portal do paciente

**Esperado**
- Portal reflete os dados atualizados (subset permitido)
- Sem duplicidade de nome no topo (apenas título + card)
- Telefone exibido vem do **cadastro completo** do paciente (campo `patients.mobile` / equivalente)

---

### T06 — Biblioteca: paciente vê o que o Admin publica
1. No Admin: criar/editar artigo e marcar como **Publicado**
2. No portal do paciente: abrir **Biblioteca**

**Esperado**
- Artigos publicados aparecem
- Artigos em rascunho não aparecem
- Categorias/destaques/ordem seguem a configuração do Admin (quando existente)

**Observação (sessão isolada)**
- Se o profissional estiver logado no mesmo navegador, o portal precisa usar o **Auth do paciente** (`patientApp`). Se a biblioteca falhar, verificar se o request está enviando `Authorization: Bearer <idToken do paciente>`.

---

### T07 — Contrato/Termo + aceite
1. No portal do paciente: abrir **Contrato**
2. Se pendente, clicar “Concordo com o termo”
3. Reabrir contrato

**Esperado**
- Status muda para aceito
- Aceite persiste após F5

**Checagem Firestore (opcional)**
- Em `tenants/{tenantId}/patients/{patientId}` verificar campos de aceite (ex.: `portal.contractAcceptedAt`, `portal.contractVersion` ou equivalente)

---

### T08 — Lembretes: toggle + persistência + “link ao Admin”
1. No portal do paciente: abrir Preferências / Lembretes
2. Alternar ON/OFF
3. Recarregar (F5)

**Esperado**
- Estado persiste
- Sem erro

**Checagem “link ao Admin” (opcional)**
- Verificar que o toggle também atualiza a estrutura que o Admin já usa (ex.: `subscribers/*`), se aplicável ao seu painel Admin.

> Observação: se o Admin do seu projeto estiver usando **outra coleção/estrutura** para lembretes, este é o ponto onde identificamos e ajustamos o mapeamento do endpoint do portal.

---

### T09 — Anotações do paciente
1. Portal: abrir **Anotações**
2. Criar uma nota e salvar
3. Recarregar (F5)
4. Remover a nota

**Esperado**
- Criação e listagem funcionam
- Persistência após reload
- Remoção é lógica (não precisa apagar o doc fisicamente)

**Checagem Firestore (opcional)**
- `tenants/{tenantId}/patients/{patientId}/patientNotes/*` (campo `deletedAt` quando removida)

