# Auth do Portal do Paciente com sessão isolada

## Decisão
O **Portal do Paciente** (`/paciente`) usa um **Firebase App secundário** para **Auth**.

- Arquivo: `src/app/firebasePatient.js`
- App name: `patientPortal`
- `PatientLogin` e rotas do paciente usam `getAuth(patientApp)`

## Por quê
No mesmo navegador, o usuário pode estar logado no **painel do profissional** e, ao mesmo tempo, acessar o **portal do paciente**
para testes/suporte. O Firebase Auth mantém **uma sessão por app**; se usarmos o mesmo app, a sessão “mistura” papéis e causa:
- `Acesso restrito ao paciente.` (token do profissional tentando chamar APIs do paciente)
- ou logout involuntário do profissional ao entrar como paciente

## Impacto
- Profissional continua no app principal (sem mudanças)
- Paciente mantém sessão separada (não interfere no profissional)

## Como validar
1. Logar no **Profissional** (`/login` → `/profissional`).
2. Em outra aba, abrir `/paciente`:
   - Deve mostrar **tela de login do paciente** (mesmo com o profissional logado).
3. Logar como paciente (código de acesso / demo):
   - Deve carregar agenda/biblioteca sem erro.
