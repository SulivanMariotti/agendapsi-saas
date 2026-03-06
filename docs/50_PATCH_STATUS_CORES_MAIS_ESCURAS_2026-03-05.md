# PATCH — Agenda (Profissional) — Cores de status mais escuras (~20%)

Data: 2026-03-05  
Zip: `AgendaPsi_patch_status_colors_darker_20pct_2026-03-05.zip`

## Objetivo
Deixar as cores dos status um pouco mais “cheias” (aprox. ~20% mais escuras) para melhorar contraste e leitura rápida.

## O que mudou
- Ajuste de *shades* Tailwind em `src/lib/shared/occurrenceStatusStyles.js`:
  - **Pills/chips**: `*-50 → *-100`, bordas `*-200 → *-300`, texto `*-800 → *-900`
  - **Barras/dots/acento**: `*-500 → *-600`
  - **Blocos da Semana**: `bg *-100 → *-200`, `border *-300 → *-400` (texto mantido)
  - **Itens do Mês**: `bg *-100/80 → *-200/80`, `border *-200 → *-300`
- Holds (`isHold=true`) permanecem neutros (cinza), sem alteração.

## Arquivos alterados
- `src/lib/shared/occurrenceStatusStyles.js`
- `docs/31_PATCHES_ZIPS_APLICADOS.md`

## Como testar / validar
1) Abrir `/profissional` nas visões **Dia / Semana / Mês**
2) Conferir que todos os status ficaram “um tom” mais escuros:
   - Agendado (violet)  
   - Confirmado (azul)  
   - Finalizado (verde)  
   - Não comparece (pink)  
   - Cancelado (vermelho)  
   - Reagendado (laranja)
3) Confirmar que **Não comparece (pink)** segue claramente diferente de **Cancelado (vermelho)**.
4) Verificar que Holds continuam neutros (cinza).
