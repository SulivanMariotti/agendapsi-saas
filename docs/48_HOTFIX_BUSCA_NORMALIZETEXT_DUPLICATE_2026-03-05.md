# HOTFIX — Busca inteligente (Pacientes) — normalizeText duplicado

Data: 2026-03-05

## Problema
Ao rodar `npm run dev` / `npm run build`, ocorria erro:

- `the name normalizeText is defined multiple times`
- Arquivo: `src/app/api/professional/patients/search/route.js`

## Causa
Durante um patch anterior, a função helper `normalizeText()` foi declarada duas vezes no mesmo arquivo, gerando erro de build (ESM/Next).

## Correção aplicada
- Removida a declaração duplicada de `normalizeText()` (mantida apenas 1).

## Como validar
1. Parar o dev server
2. (Recomendado) apagar a pasta `.next`
3. Rodar `npm run dev` e acessar `/profissional`
4. Rodar `npm run build` e confirmar que não há erro
