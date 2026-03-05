# Onde paramos — AgendaPsi (SaaS)

Atualização: **2026-03-05**

> Este arquivo é um resumo executivo. Para retomar exatamente do ponto atual, use também:  
> `docs/00_HANDOFF_PARA_NOVO_CHAT.md`

## Estado atual (resumo)

### ✅ Implementado
- Seed + tenant isolation + sessão server-side (Profissional).
- SaaS Tenants (Super Admin): criar/listar/suspender/reativar + vincular Owner + auditoria mínima.
- Admin: schedule settings, occurrence codes, patient portal settings, templates WhatsApp.
- Profissional:
  - Agenda Dia/Semana/Mês com overlay clínico e fluxo de recorrência/holds.
  - **Header premium (Variante A)**: sticky + “Ir para data”, busca, +Novo, filtros por badges, “Ir para agora” condicional e “Próximo atendimento”.
  - **ÉPICO J (MVP)**: cadastro completo do paciente + pré-cadastro rápido + `generalNotes` no agendamento.
- Paciente: portal via APIs (sem Firestore client), termo, lembretes, biblioteca, anotações (exclusão lógica), sem CTA cancelar/remarcar.

### 🟡 Próximos upgrades (fila)
1) Persistir preferências do profissional (visão/filtro/header).
2) Busca inteligente (nesta visão vs todos).
3) Densidade compacta na Semana.
4) Aviso de conflito.

## Como iniciar novo chat
Anexar:
1) ZIP do projeto atual (sem `node_modules/` e `.next/`)
2) `docs/00_HANDOFF_PARA_NOVO_CHAT.md`
