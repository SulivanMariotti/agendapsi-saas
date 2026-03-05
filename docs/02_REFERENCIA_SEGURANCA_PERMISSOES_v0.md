# AgendaPsi — Segurança e Permissões (v0)

## Princípios
- Menor privilégio sempre.
- Regras claras por painel: Admin / Profissional / Paciente.
- Evitar logs com dados sensíveis (LGPD).
- Validar entrada/saída em toda rota/endpoint.

## Perfis
1) Admin
- Acesso total ao painel admin e configurações globais.
- Gerencia profissionais, códigos de ocorrência, templates WhatsApp, parametrizações.

2) Profissional
- Gerencia agenda, reservas, agendamentos, status e prontuário.
- Visualiza e edita dados do paciente necessários ao cuidado e rotina.

3) Paciente
- Visualiza apenas seus agendamentos e informações relevantes.
- Proibido CTA de cancelar/remarcar.
- Comunicação: apenas reforço de presença/constância.

## Regras críticas
- Reserva/Hold:
  - Não permite mudança de status até virar agendamento.
  - Exibição em tom cinza (50%) para diferenciar.
- Proteção contra abuso:
  - Endpoints com rate limit quando aplicável.
- Dados clínicos:
  - Prontuário/evolução com acesso restrito (Profissional/Admin).
  - Minimização de dados no cliente/paciente.