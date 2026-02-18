# Login do paciente — Código de Vinculação (Opção B)

> **Nota de segurança:** o login do paciente por **e-mail** (sem OTP/magic link) é considerado **inseguro**.
> Neste projeto, o acesso padrão para o paciente é via **telefone + código de vinculação**.
> O endpoint legado `/api/patient-auth` deve permanecer **desativado em produção**.

## Objetivo
Um login **simples**, **robusto** e **sem custo** (sem SMS/email), para o paciente acessar o painel e ativar notificações com consistência.

## Fluxo (alto nível)
1) **Admin** gera o código do paciente (uma vez) e entrega (presencial/WhatsApp manual).
2) **Paciente** entra com **telefone + código** e “pareia” o aparelho.
3) Código vira **single-use** (`used`).
4) Se trocar de aparelho/perder acesso: Admin gera **novo código**.

## Endpoints
### Admin
- `POST /api/admin/patient/pair-code`
  - body: `{ uid }`
  - retorna: `{ ok, pairCode, last4 }`
  - grava em `users/{uid}`: `pairCodeHash/salt/status/...`
  - cria `history.type = patient_pair_code_issued`

### Paciente
- `POST /api/patient/pair`
  - body: `{ phone, code }`
  - valida `hash + salt`
  - marca `pairCodeStatus = used`
  - retorna `customToken` (Firebase Auth) para sessão persistente
  - cria `history.type = patient_paired_device`

## Campos no Firestore (users)
- `pairCodeHash`, `pairCodeSalt`
- `pairCodeStatus`: `active|used|revoked`
- `pairCodeCreatedAt`, `pairCodeUsedAt`
- `pairCodeLast4`

## Operação (Admin)
- Admin → Pacientes: coluna “Código” mostra status e last4.
- Botão “Código” gera um novo quando necessário (recuperação/troca de aparelho).

## Mensagem clínica sugerida (ao entregar o código)
“Este acesso é o seu espaço de cuidado. A constância é parte do processo — quando você entra aqui, você está reforçando seu compromisso com você.”
