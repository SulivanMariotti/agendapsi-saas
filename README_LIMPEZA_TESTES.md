# Limpeza de dados de testes — Presença/Faltas (v2)

Este pacote traz um script que apaga a coleção do Firestore que alimenta o painel Admin → Presença/Faltas.

✅ **v2**: o script **carrega automaticamente** variáveis de `.env.local` e `.env` do seu projeto.

---

## 1) Copiar arquivo para o projeto
Copie para:

`/scripts/purgeAttendanceLogs.cjs`

> Se a pasta `scripts` não existir, crie.

---

## 2) Garantir que existe credencial no `.env.local` (raiz do projeto)

O seu projeto Next geralmente já tem `.env.local`. Ele precisa ter **UMA** destas chaves:

### Opção A (recomendado)
`FIREBASE_ADMIN_SERVICE_ACCOUNT_B64=...`

### Opção B
`FIREBASE_ADMIN_SERVICE_ACCOUNT={...json...}`

> Use exatamente as mesmas credenciais que o seu backend usa em produção/dev.

---

## 3) Rodar a limpeza (irreversível)
Na raiz do projeto (onde está o `package.json`):

```bash
node scripts/purgeAttendanceLogs.cjs --yes
```

Para limpar outras coleções:

```bash
node scripts/purgeAttendanceLogs.cjs --collection=history --yes
node scripts/purgeAttendanceLogs.cjs --collection=audit_logs --yes
```

---

## 4) Validar no painel
- Recarregue o Admin com **Ctrl + Shift + R**
- Admin → Presença/Faltas deve voltar para 0.

---

## 5) Higienização de Agenda (testes) — sessões futuras fora da janela

Quando você já gerou agenda por meses (ex.: paciente teste) e quer voltar ao modelo operacional de **janela rolante** (hoje → +30 dias), existe um recurso no:

**Admin → Agenda → “Higienização (testes)”**

Ele **cancela** (não apaga) sessões com:
- `startAt` além de **32 dias**
- `source === "admin_sync"`
- status diferente de `done/cancelled`

### Segurança (produção)
Por padrão, este bloco fica visível apenas em desenvolvimento.
Para habilitar em produção (não recomendado), configure:

- **Frontend** (para exibir o bloco):
  - `NEXT_PUBLIC_ENABLE_TEST_TOOLS=true`
- **Backend** (para liberar a rota):
  - `ENABLE_TEST_TOOLS=true`

Depois disso, faça o deploy/restart do ambiente.
