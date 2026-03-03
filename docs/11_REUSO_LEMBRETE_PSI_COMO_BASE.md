# Reuso do Lembrete Psi como base (restrições)

Atualizado: **2026-03-02**

## Regra crítica
O Lembrete Psi (agenda.msgflow.app.br) permanece separado.
O AgendaPsi (agendapsi.msgflow.app.br) é outro projeto, outro Firebase, outras Rules.

## Reuso permitido (somente como base de implementação)
- Layout do Admin, componentes, tabela/filtros, toasts.
- Padrões de rotas/API e validação.
- Padrões de UI para agenda (se aplicável).

## Reuso proibido
- Firebase Project do Lembrete
- Firestore/coleções/rules do Lembrete
- Deploy/URL do Lembrete
- Claims/políticas do Lembrete

## Observação sobre o menu “Lembretes” no Admin do AgendaPsi
- É apenas estrutura de navegação (placeholder).
- Não deve acessar dados do Firebase do Lembrete Psi.


## Painel do Paciente (reuso de UI do Lembrete Psi)
**Objetivo:** reaproveitar o painel do paciente do Lembrete Psi como base de UI/UX, **sem** reaproveitar Firebase/coleções/rules.

### O que foi reaproveitado (código/UI)
- Componentes do paciente (login + fluxo) em `src/components/Patient/*`
- Componentes/estilos auxiliares em `src/features/patient/*`
- Padrões de UI (TopAppBar, cards, empty states, loading)

### Ajuste aplicado no AgendaPsi (2026-03-02)
- O painel do paciente passa a viver em **`/paciente`**.
- A rota **`/`** passa a redirecionar para **`/login`** (entrada padrão do Profissional).

### O que ainda precisa ser reescrito (AgendaPsi)
- **Dados do paciente**: o painel não deve depender de coleções do Lembrete Psi.
  - Adaptar APIs/hooks do paciente para ler **`tenants/{tenantId}/appointmentOccurrences`** (e/ou coleção “portal” dedicada, se adotada).
- **Auth do paciente**: definir estratégia (pair code / token / claims) alinhada ao modelo do AgendaPsi e às Rules finais.
- Remover/ajustar telas que não façam parte do escopo do MVP do AgendaPsi (ex.: biblioteca/notas, se não forem adotadas).



### Hotfix (2026-03-02) — evitar `permission-denied` no `/paciente`
- O código herdado do Lembrete Psi fazia listeners client-side em coleções globais (`/config`, `/users`, etc.).
- No AgendaPsi, essas coleções **não existem** (e as Rules são por tenant), então o painel do paciente pode disparar `permission-denied`.
- Até implementarmos o **modelo seguro do portal do paciente** (ex.: `tenants/{tenantId}/patientsPortal/*`), o `/paciente` renderiza um **placeholder** após login e não faz leituras do Firestore no client.
