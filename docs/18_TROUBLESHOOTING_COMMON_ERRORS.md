# 18_TROUBLESHOOTING_COMMON_ERRORS (atualizado em 2026-02-17)

Este documento reúne erros recorrentes do **Lembrete Psi** e o caminho de diagnóstico.  
Objetivo: reduzir regressões que quebram lembretes (e quebrar lembretes aumenta risco de falta — falta interrompe evolução).

---

## 1) `permission-denied` no painel do paciente (Firestore)

**Sintoma**
- Console: `FirebaseError: [code=permission-denied]: Missing or insufficient permissions.`
- Agenda do paciente não carrega / listener falha.

**Causa mais comum (atual)**
- Código do paciente (antigo) tentando ler `appointments/*` via Firestore client.
- No estado atual validado:
  - agenda do paciente é **server-side** via `GET /api/patient/appointments` (Admin SDK)
  - `appointments/*` em Firestore é **admin-only** (por Rules)

**Checklist (ordem)**
1. Confirme que o painel do paciente está chamando **API** (não Firestore) para agenda:
   - `GET /api/patient/appointments`
2. Confirme que o deploy está atualizado (cache/build antigo costuma manter imports antigos).
3. Procure no código por:
   - `collection(db, 'appointments')`
   - `onSnapshot(...appointments...)`
   - e remova/garanta que não é usado no fluxo do paciente.

---

## 2) Next/Build: `Module not found: Can't resolve './AdminManualTab'`

**Sintoma**
- Build quebra apontando import em `AdminPanelView.js`:
  - `import AdminManualTab from './AdminManualTab';`

**Causa**
- Arquivo `AdminManualTab.js` não existe no diretório esperado (`src/components/Admin/`).

**Correção**
- Garantir que o arquivo existe e está com o nome correto:
  - `src/components/Admin/AdminManualTab.js`
- Em Windows, atenção extra com:
  - extensão invisível (ex.: `AdminManualTab.js.txt`)
  - diferença de maiúsculas/minúsculas em git/zip

---

## 3) React: `useEffect changed size between renders`

**Sintoma**
- `The final argument passed to useEffect changed size between renders...`

**Causa**
- Array de dependências variável, ex.:
  - `[a, b].filter(Boolean)`
  - `cond ? [a, b] : [a]`
  - `...(cond ? [x] : [])`

**Correção**
- Sempre deps com tamanho fixo:
  - `useEffect(fn, [a, b])` (mesmo que `b` seja `undefined`)

---

## 4) Web Push: Preview mostra candidatos mas `blockedNoToken` alto

**Sintoma**
- Dry run: `candidates > 0`, `sent = 0`, `blockedNoToken` alto.

**Causa**
- Pacientes não ativaram notificações no dispositivo
- `subscribers/{phoneCanonical}.pushToken` ausente/expirado

**Ação recomendada (produto)**
- No painel do paciente, reforçar psicoeducação:
  - “Ativar notificações é cuidar da sua constância. Você não precisa lembrar sozinho.”
- Mostrar estado claro:
  - Ativo neste aparelho / desativado / permissão negada.

---

## 5) Import da agenda: “limpar” e reprocessar mantém preview antigo

**Sintoma**
- Após limpar, upload não “recarrega” sem trocar de menu
- Bloco de preview permanece e botão fica verde indevidamente

**Causa provável**
- Estado do componente Admin não reseta todos os campos relacionados (ex.: `preview`, `pending`, `fileRef`, `candidates`)
- `key` do input file não muda, então o browser não dispara `onChange`

**Ação técnica**
- Reset completo do state do upload
- Alterar `key` do `<input type="file">` ao clicar em “Limpar”

---

## Boas práticas para evitar regressão

- Bloqueios críticos sempre **server-side** (status inativo, janela de envio, etc.).
- Não “inventar join”: defina e persista `phoneCanonical` como chave de relacionamento.
- Logs/auditoria: registrar ações críticas sem dados sensíveis.
- Sempre que um erro impactar lembretes, trate como risco clínico: menos lembrete → mais chance de falta.
