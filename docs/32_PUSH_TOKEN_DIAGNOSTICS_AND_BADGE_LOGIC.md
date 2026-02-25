# 32_PUSH_TOKEN_DIAGNOSTICS_AND_BADGE_LOGIC

Este documento registra o padrão final para diagnosticar **pushToken** e o badge no Admin (Envios Pendentes).

> Objetivo clínico: evitar falsos “Sem cadastro” que travam operação e comprometem lembretes.  
> Operação previsível = lembrete confiável = mais constância.

---

## 1) Conceitos (2 dimensões)

### A) Na base / Fora da base
- **Na base**: subscriber encontrado (existe doc em `subscribers/{phoneCanonical}` ou match por `docId`).
- **Fora da base**: não foi possível casar subscriber com o telefone canônico.

### B) Push OK / Sem Push
- **Push OK**: subscriber existe **e** `pushToken` está preenchido.
- **Sem Push**: subscriber existe, mas token está vazio/nulo/ausente (ou o diagnóstico server-side retornou false).

> Importante: “Na base” não significa automaticamente “Push OK”. São dimensões diferentes.

---

## 2) Fonte de verdade do token (server-side)

O Admin deve consultar o server para determinar se há token, via endpoint:

- `POST /api/admin/push/status-batch`

Payload:
```json
{ "phones": ["11999998888", "11922223333"] }
```

Resposta:
```json
{ "ok": true, "byPhone": { "11999998888": true, "11922223333": false }, "count": 2 }
```

O badge é calculado por:
- `byPhone[phoneCanonical] === true` => **Push OK**
- caso contrário => **Sem Push**

---

## 3) Canonicalização (regra única)

`phoneCanonical` deve ser sempre:
- somente dígitos
- **SEM 55**
- tamanho preferencial: 10–11 dígitos (DDD + número)

Ex.: `+55 (11) 92222-3333` → `11922223333`

Isso precisa ser consistente entre:
- import da agenda (`appointments`)
- `users/{uid}.phoneCanonical`
- `subscribers/{phoneCanonical}`

---

## 4) Modo DEV (bypass controlado)

Para testes locais (sem fricção), existe bypass no endpoint:

- Habilita apenas se `NEXT_PUBLIC_DEV_LOGIN=true`
- E a chamada for feita com query param `?dev=1`

Ex.:
- `POST /api/admin/push/status-batch?dev=1`

Em produção (sem `?dev=1`), o endpoint exige:
- `Authorization: Bearer <idToken>` e `users/{uid}.role === "admin"`

---

## 5) Regras de UX para o Admin

- O badge não pode travar o fluxo de “Preview”.
- Mesmo quando **Sem Push**, o **Preview** deve rodar e mostrar:
  - `blockedNoToken`
  - `blockedReason: "noToken"`
  - amostras interpoladas (sem dados sensíveis)

Assim o Admin entende o motivo do bloqueio sem perder tempo.

---

## 6) Checklist de verificação

1. No Patient Panel:
   - ativar notificações cria/atualiza `subscribers/{phoneCanonical}` com `pushToken`
2. No Admin:
   - “Verificar” dispara `status-batch`
   - Response contém `byPhone[phoneCanonical] === true`
3. Badge:
   - aparece **Push OK** para quem tem token
4. Preview:
   - habilita e retorna contagens coerentes



---

## 6) Regra de ouro (UX)
- Na tela de Importar Agenda, manter uma **Legenda rápida** fixa explicando:
  - Na base / Fora da base
  - Push OK / Sem Push
  - CHECK (quando o estado de push ainda não foi confirmado para a seleção atual)
