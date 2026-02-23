# Atualizações — 2026-02-22

Este arquivo registra as mudanças aplicadas no ciclo de hoje.

## 1) F3 — Dashboard com “Últimos lotes (batchId)”
- Adicionado card no **Dashboard (Admin)** com lista dos últimos `batchId`.
- Clique no lote abre o **Histórico** já filtrado por `batchId`.

## 2) Agenda do paciente como “janela rolante” (30 dias)
Motivo: evitar “sessões fantasma” quando a agenda muda (dia/hora/quantidade) e o paciente já teve sessões geradas para meses à frente.

Mudanças:
- O painel do paciente passa a exibir **apenas os próximos 30 dias** (servidor usa tolerância de ~32 dias).
- O sync do Admin faz **reconciliação na janela**:
  - Sessões existentes (source `admin_sync`) **dentro da janela** que **não aparecem no upload atual** são marcadas como `cancelled`.
  - Não apaga passado/histórico.

Atenção:
- O upload deve representar a **agenda completa** da janela (não recorte), pois o que “sumir do upload” dentro da janela é tratado como removido.

## 3) Ferramenta de higienização (apenas testes)
- Adicionada ação no Admin para **cancelar sessões futuras fora da janela** (para limpar dados de teste).
- **Protegida por feature flags**:
  - UI: `NEXT_PUBLIC_ENABLE_TEST_TOOLS=true`
  - API: `ENABLE_TEST_TOOLS=true`
- Por padrão, em produção fica **desligado** e a API responde `403 test_tools_disabled`.

## 4) “Agenda atualizada em …” (carimbo oficial)
- O painel do paciente exibe o carimbo `config/global.appointmentsLastSyncAt`.
- O Admin passa a gravar/atualizar esse carimbo **sempre após Sincronizar**, sem depender exclusivamente do summary da etapa “Verificar”.

## 5) Estado vazio clínico (sem sessões na janela)
- Quando não há sessões nos próximos 30 dias, o card “Agenda” mostra:
  - Texto curto de **psicoeducação/compromisso**, reforçando vínculo/constância.
  - Sem CTA de cancelar/remarcar.
