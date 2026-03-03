# AgendaPsi — Segurança e Permissões (v0) — atualizado

Atualizado: **2026-03-02**

> Este arquivo existe como “export” rápido para iniciar novos chats.  
> Fonte oficial: `docs/03_SEGURANCA_E_RULES.md` e `docs/04_ROLES_E_REGRAS.md`.

## Princípios
- Menor privilégio sempre.
- Regras claras por painel: Admin / Profissional / Paciente.
- Evitar logs com dados sensíveis (LGPD).
- Validar entrada/saída em toda rota/endpoint.

## Perfis
### Admin
- Acesso ao painel admin e configurações.
- Gerencia schedule e catálogos (ex.: códigos de ocorrência).
- Pode ler/editar pacientes e agenda.

### Profissional
- Gerencia agenda, reservas, agendamentos, status, reagendar/excluir.
- Registra:
  - evolução por sessão (texto livre)
  - ocorrências extra (código + descrição)

### Paciente
- Visualiza apenas seus agendamentos e informações mínimas relevantes.
- Proibido CTA de cancelar/remarcar.
- Comunicação deve reforçar presença/constância.

## Regras críticas
- Hold:
  - status travado até converter
  - UI em cinza
- Registros clínicos:
  - evolução por sessão e ocorrências extra: apenas Admin/Profissional
- Admin:
  - evitar listeners client em módulos placeholder para não gerar permission-denied
  - preferir endpoints server-side (Admin SDK)

## Pendências
- Hardening completo de Firestore Rules para produção.
