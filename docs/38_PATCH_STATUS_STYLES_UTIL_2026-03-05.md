# PATCH — Centralização de estilos por status (Profissional)

Data: 2026-03-05  
Patch: `AgendaPsi_patch_status_styles_util_centralizado_2026-03-05.zip`

## Objetivo
Evitar divergência futura de cores/estilos por status entre as visões **Dia / Semana / Mês** ao centralizar o mapeamento em um único arquivo.

## O que mudou
- Novo util:
  - `src/lib/shared/occurrenceStatusStyles.js`
    - Exporta `STATUSES` e helpers:
      - `statusPillClass`
      - `statusBarClass`
      - `statusCardSoftClass`
      - `statusAccentBorderClass`
      - `statusIconColorClass`
      - `statusBlockClass` (Semana)
      - `statusDotClass` (Mês)
      - `statusItemBgClass` (Mês)
    - Mantém strings explícitas (compatível com Tailwind scanning)
    - Alias defensivo para variações de “Não comparece”

- Refactor (sem alteração visual):
  - Dia: `ProfessionalDayViewClient.js`
  - Semana: `ProfessionalWeekViewClient.js`
  - Mês: `ProfessionalMonthViewClient.js`

## Como validar
- Abrir `/profissional` em Dia/Semana/Mês e comparar visualmente:
  - Confirmado azul, Finalizado verde, Não comparece pink, Cancelado vermelho, Reagendado laranja, Agendado mantém.
- Abrir detalhe/overlay e verificar chips/indicadores iguais ao antes.
- Rodar build (`npm run build`) para garantir que não há erro de import/export.
