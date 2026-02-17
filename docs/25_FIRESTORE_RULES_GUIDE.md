# 25_FIRESTORE_RULES_GUIDE

Guia prático para manter **Firestore Rules** seguras sem quebrar o produto.

> Regra clínica: se uma regra “fecha demais” e o paciente não acessa, a continuidade sofre.  
> Regra boa é **segura** e **previsível**, com decisões críticas **server-side**.

---

## 1) Princípios

1. **Fonte de verdade** do paciente é `users/{uid}` (role/status).
2. **Chave do paciente**: `phoneCanonical`.
3. **Client lê pouco** e escreve menos ainda.
4. Ações críticas (envio, bloqueio de inativo, janela de envio) acontecem em **API routes** com Admin SDK.
5. Rules servem para:
   - impedir leitura/escrita indevida
   - reduzir superfície de ataque
   - proteger dados sensíveis

---

## 2) Padrão de checagem de role/status

No client, sempre que permitir leitura, condicione a:
- usuário autenticado
- role compatível
- status ativo (se fizer sentido para a rota)

### Exemplo de política (conceitual)
- Admin: pode ler coleções operacionais
- Patient: lê apenas os próprios dados e dados “sem risco” (ex.: próximos horários)

> Evite depender de campos “no documento alvo” para autorizar.  
> Prefira derivar autorização de `users/{uid}`.

---

## 3) Recomendações por coleção

### 3.1 `users/{uid}`
- Patient:
  - pode ler **apenas o próprio doc**
  - escrita limitada (se existir): campos não críticos (ex.: preferências)
- Admin:
  - pode ler todos
  - pode atualizar `status`, `role`, etc.

### 3.2 `subscribers/{phoneCanonical}`
- Patient:
  - pode escrever **apenas** o doc do seu `phoneCanonical` (para salvar `pushToken`)
  - leitura pode ser limitada (ideal: permitir leitura mínima ou usar server-side quando possível)
- Admin:
  - leitura para diagnóstico e envio

### 3.3 `appointments/*`
- Patient:
  - **não lê direto do Firestore (client)**
  - lê via **API server-side** (`/api/patient/appointments`, Admin SDK)
  - motivo clínico: evita `permission-denied`/tela vazia (quebra de continuidade)
  - motivo técnico: reduz superfície de ataque e centraliza regras críticas no server-side
  - escrita: **negada** (agenda é sempre importada/sincronizada pelo admin)
- Admin:
  - leitura/escrita para import/sincronização

### 3.4 `attendance_logs/*`
- Patient:
  - normalmente leitura negada (ou leitura agregada, se você expor)
- Admin:
  - leitura/escrita (import/manual)

### 3.5 `config/global`
- Patient:
  - leitura (se necessário) apenas de campos não sensíveis
- Admin:
  - leitura/escrita

### 3.6 `history/*`
- Patient:
  - leitura negada
- Admin:
  - leitura para auditoria
- Escrita:
  - preferir server-side (Admin SDK), pois logs são sensíveis e devem ser confiáveis

---

## 4) Anti-padrões (evitar)

- ✅ Bloquear envio de paciente inativo **no server-side**
- ❌ Confiar apenas em regra no client para bloquear envio
- ❌ Permitir escrita ampla em `users/{uid}`
- ❌ Autorizar por “phone” sem canonicalização
- ❌ Fazer regra depender de campos inconsistentes do `appointments`

---

## 5) Checklist de validação rápida

- [ ] Patient consegue abrir painel e ver próxima sessão
- [ ] Patient consegue salvar `pushToken` (se habilitado)
- [ ] Admin consegue importar e enviar (dryRun + real)
- [ ] Paciente inativo:
  - [ ] envios bloqueados server-side
  - [ ] logs registram bloqueio

---

## 6) Quando mudar rules

Sempre registrar em `history`:
- `type`: `security.rules.updated`
- `payload`: justificativa + referência do commit

E executar testes mínimos do doc `20_RELEASE_CHECKLIST_CONSTANCY_FIRST.md`.

