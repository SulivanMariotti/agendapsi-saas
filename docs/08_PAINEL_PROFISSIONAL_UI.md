# Painel do Profissional — UI (MVP)

Atualizado: 2026-02-28

## Rotas
- `/login`
- `/profissional` (Dia por padrão)
- `/profissional?view=week&date=YYYY-MM-DD`
- `/profissional?view=month&date=YYYY-MM-DD`

## Funcionalidades atuais
### Visão Dia
- Slots renderizados conforme `settings/schedule` (intervalo + ranges do dia).
- Cards compactos com:
  - cor suave por status
  - ícone de status no canto direito (sem texto)
- Multi-bloco e buffer respeitados.

### Visão Semana
- Grade semanal estilo calendário (coluna de horas + seg..dom).
- Clique em:
  - bloco ocupado → abre detalhes (status editável)
  - horário livre → escolhe **Agendar** ou **Reservar (Hold)**

### Visão Mês
- Grade mensal compacta.
- Clique em:
  - dia → abre Visão Dia
  - item → abre detalhes

### Próximos horários
- Botão lista **3 próximos** horários livres (até 30 dias) e, ao escolher, abre o fluxo de agendar.

## Observação de UX
- Padrão de clique deve ser consistente em todas as visões:
  - ocupado → detalhes
  - livre → Agendar/Reservar (Semana já OK; Mês ainda pendente)
