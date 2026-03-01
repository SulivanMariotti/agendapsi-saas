# Onde paramos — AgendaPsi (SaaS)

Atualização: 2026-02-28

## Decisão reforçada: Separação do Lembrete Psi
- Lembrete Psi segue em produção na clínica (agenda.msgflow.app.br) como está.
- AgendaPsi é novo sistema separado (agendapsi.msgflow.app.br).
- Reuso é **apenas de código/UI/lógica**, nunca de base/dados/deploy.

## Estado atual (resumo)
### Admin
- `/admin` com configuração do schedule do AgendaPsi (intervalo 30/45/60, buffer, almoço e horários por dia).
- Persistência: `tenants/{tenantId}/settings/schedule`.

### Profissional
- `/profissional` com visões:
  - Dia (compacto, cor suave por status, ícone de status no canto direito)
  - Semana (grade tipo calendário; clique no vazio abre Agendar/Reservar)
  - Mês (grade mensal; clique em item abre detalhes; clique em dia abre Dia)
- “Próximos horários” lista 3 próximos horários livres.
- Multi-bloco + buffer aplicados na ocupação.

## Próximo foco recomendado
- Mês: clique em área livre para Agendar/Reservar (padrão da Semana).
- Painel de resumo do paciente no agendamento.
- Prontuário por ocorrência + códigos.
