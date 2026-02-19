# Atualização — 2026-02-19 (STEP5)

## Objetivo do passo
**Revisão de endpoints com Admin SDK**, com foco em reduzir superfície e evitar qualquer “atalho” de autenticação que possa fragilizar o vínculo/constância (ex.: alguém acessar a agenda do paciente por e-mail sem verificação).

## O que mudou

### 1) Endpoint legado de login do paciente por e-mail (`/api/patient-auth`)
- **Desativado por padrão** (como já era esperado pelo produto).
- Quando desativado:
  - **Produção:** responde **404** (parece que não existe).
  - **Dev/Testes:** responde **410** com dica de habilitação (para cenários controlados/legado).
- Para habilitar conscientemente (apenas legado/testes):
  - **Server:** `ENABLE_INSECURE_PATIENT_EMAIL_LOGIN="true"`
  - **Client:** `NEXT_PUBLIC_ENABLE_INSECURE_PATIENT_EMAIL_LOGIN="true"`

### 2) Validação de payload mais estrita
- `/api/patient-auth` agora aceita **apenas** a chave `email`.
- Qualquer chave desconhecida retorna **400** (reduz payload inesperado e abuso).

### 3) Alinhamento do client (`authService`)
- `patientLoginByEmail()` passou a aceitar o novo flag público `NEXT_PUBLIC_ENABLE_INSECURE_PATIENT_EMAIL_LOGIN`.
- Mantida compatibilidade com o flag antigo `NEXT_PUBLIC_ENABLE_PATIENT_EMAIL_LOGIN`.

## Norte clínico mantido
- Login do paciente segue sendo **telefone + código de vinculação** (contrato claro e consistente).
- Sem CTA de cancelar/remarcar no painel do paciente.
- Segurança como sustentação do vínculo: menos brechas = menos ruído = mais constância.
