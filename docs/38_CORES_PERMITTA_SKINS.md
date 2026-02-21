# Cores via Skins (Paciente + Admin)

## Objetivo
Aplicar paleta por escopo com **baixo risco** e **sem refatorar** todos os componentes, mantendo alertas (erro/aviso/sucesso) com cores tradicionais.

- **Paciente:** paleta em **escala de cinza** + primário `violet` (reforço de foco e leitura “1 olhar”).
- **Admin:** pode usar **paleta de marca** (skin-admin) **ou** herdar a paleta do paciente (skin-patient) quando a prioridade for consistência visual.

## Estratégia
- Implementação via CSS em `src/app/globals.css`:
  - `.skin-patient` → afeta apenas PatientLogin + PatientFlow
  - `.skin-admin` → afeta apenas Admin UI (quando usado)
- As skins harmonizam superfícies (`bg-*`), bordas (`border-*`), sombras (`shadow-*`) e contraste de textos.

## O que NÃO é afetado
- Alertas e estados semânticos:
  - `red-*` (erro)
  - `amber/yellow-*` (aviso)
  - `green/emerald-*` (sucesso)

## Onde fica aplicado
- **Paciente:** `src/app/page.js` envolve a área do paciente com `skin-patient`.
- **Admin:** `src/app/admin/layout.js` define o wrapper do Admin:
  - `skin-admin` (marca)
  - ou `skin-patient` (escala de cinza, igual ao paciente)

## Troubleshooting (quando “não muda”)
Em ambiente local, pode haver cache do Next/Turbopack e do browser.

1. Pare o servidor: **Ctrl + C**
2. Apague a pasta `.next` na raiz do projeto
3. Rode `npm run dev`
4. No browser: **Ctrl + Shift + R** (hard refresh)

## Próxima melhoria (opcional)
Realizar **auditoria de resíduos de cor** (Passo 21): procurar classes fora do padrão (ex.: `text-blue-*`, `bg-indigo-*`, `from-purple-*`) e ajustar pontualmente.

Detalhe: `docs/40_PASSO_21_AUDITORIA_CORES.md`.

---

## Escala `--accent-*` (violet) — referência
Quando precisar de uma sequência completa (até `1000`), use a escala abaixo:

```css
--accent-50: #f5f3ff;
--accent-100: #ede9fe;
--accent-200: #ddd6fe;
--accent-300: #c4b5fd;
--accent-400: #a78bfa;
--accent-500: #8b5cf6;
--accent-600: #7c3aed;
--accent-700: #6d28d9;
--accent-800: #5b21b6;
--accent-900: #4c1d95;
--accent-950: #2e1065;
--accent-1000: #250d51;
```

**Padronização do projeto (mais escuro):** sempre que possível, preferir `--accent-800` (`#5b21b6`) como tom principal.
Se existir resíduo de `violet-600`, o projeto pode aplicar alias global `--color-violet-600 → --color-violet-800` para garantir consistência.
