# 18_TROUBLESHOOTING_COMMON_ERRORS (atualizado em 2026-02-24)

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

## 5) Admin / Histórico: `Cannot access 'rangeLogs' before initialization`

**Sintoma**
- Ao abrir a aba **Histórico** no Admin, o app quebra com erro no console:
  - `Cannot access 'rangeLogs' before initialization`

**Causa**
- Regressão em `AdminHistoryTab.js`: o `const rangeLogs = useMemo(...)` foi escrito
  referenciando `rangeLogs` dentro do próprio initializer (ex.: `rangeLogs.filter(...)`).
- Como `const` usa *temporal dead zone*, isso gera ReferenceError.

**Correção**
1. Em `src/components/Admin/AdminHistoryTab.js`, garanta que o `rangeLogs` é derivado sempre
   de uma lista base (ex.: `logs`) e nunca do próprio `rangeLogs`.
2. Exemplo correto:
   - `const base = Array.isArray(logs) ? logs : []`
   - `return rangeStartMs ? base.filter(...) : base`

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


---

## iPhone: “Indisponível” no card de Notificações (Push)

**Sintoma**
- No iPhone, o painel do paciente mostra “Indisponível” para notificações.

**Causa**
- No iOS, Push Web normalmente só está disponível quando o site está instalado na **Tela de Início (PWA)** (iOS 16.4+).
- Navegadores dentro de apps (WhatsApp/Instagram/Facebook) podem bloquear Push/Service Worker.

**Correção (passo a passo)**
1. Abrir o site no **Safari**.
2. Compartilhar → **Adicionar à Tela de Início**.
3. Abrir pelo **ícone** (PWA).
4. Ajustes do iPhone → Notificações → Lembrete Psi → **Permitir notificações**.

---

## iOS/Safari: `ReferenceError: Notification is not defined`

**Sintoma**
- Tela de erro em iPhone ao carregar o painel do paciente.

**Causa**
- Em alguns ambientes iOS, o identificador global `Notification` não existe.
- `Notification?.permission` pode quebrar por “variável inexistente”.

**Correção**
- Ler sempre via `window.Notification` / `globalThis.Notification`, depois acessar `.permission`.

---

## Importar Agenda (Admin): “não autorizado” mesmo com token

**Sintoma**
- Toast do “Verificar” mostrava “não autorizado” para paciente que tem pushToken.

**Causa**
- Matching incorreto do subscriber (ex.: procurar `s.phone` ao invés de `phoneCanonical`/`docId`).

**Correção**
- Matching deve usar `phoneCanonical` e/ou `docId` do doc em `subscribers/{phoneCanonical}`.
- Se voltar a acontecer, validar:
  - telefone canônico (somente dígitos, sem 55)
  - existência do doc `subscribers/{phoneCanonical}`
