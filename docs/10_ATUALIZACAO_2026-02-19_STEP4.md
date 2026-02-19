# Atualização — 2026-02-19 (Step 4)

## Objetivo
Endurecer rotas críticas sem quebrar UX do paciente:
- **Validação de payload (schema)**
- **Anti-abuso por IP**
- Ajustes pontuais para reduzir superfície de abuso em ambiente serverless.

## O que foi implementado

### 1) Schema-lite (validação de entrada)
- Criado helper: `src/lib/server/payloadSchema.js`
  - Garante **objeto JSON plain** (evita payloads estranhos)
  - Valida `string/boolean/number/enum/object` com limites (tamanho/bytes)

Aplicado nas rotas:
- **Admin**: `POST /api/admin/attendance/import`
  - `csvText` obrigatório, **limite ~2.5MB**
  - valida `source`, `dryRun`, `defaultStatus`, `reportMode`, `columnMap`
  - **limite 30.000 linhas** por import (evita travar)
- **Paciente (pré-auth)**: `POST /api/patient/pair`
  - valida `phone` e `code`
- **Paciente (auth)**: `POST /api/attendance/confirm`
  - valida `appointmentId` e `channel`
- **Legado inseguro**: `POST /api/patient-auth`
  - valida `email` (quando habilitado por env)

### 2) Anti-abuso por IP (duplo limiter)
- `POST /api/patient/pair`: limiter por **IP** + limiter por **telefone**.
- `POST /api/attendance/confirm`: limiter por **IP** + limiter por **uid**.

### 3) Rate limit — normalização de IP
- Melhorado `src/lib/server/rateLimit.js` para normalizar IP:
  - prioriza `cf-connecting-ip` / `x-forwarded-for` / `x-real-ip`
  - remove porta e prefixo `::ffff:`

## Como testar (rápido)
1) **Paciente → Vincular**: tente payload inválido (sem `phone`/`code`) e confirme erro 400 claro.
2) **Paciente → Confirmar presença**: tente sem `appointmentId` e confirme erro 400.
3) **Admin → Import presença/faltas**: tente importar CSV muito grande e confirme bloqueio com mensagem.
4) **Rate limit**: repetir chamadas rápidas e confirmar 429 com `Retry-After`.

## Observações clínicas
- Validações e rate-limit servem para manter o sistema **previsível e confiável**, evitando ruídos que quebram a leitura de constância.
- Nenhuma mudança adiciona CTA de cancelar/remarcar.
