# Atualização — 2026-02-19

## Presença/Faltas — o que foi ajustado

### 1) Import CSV mais tolerante (Admin)
- Autodetecção de separador no cabeçalho: `;` / `,` / **TAB**.
- Suporte a CSV com **BOM** (o “caractere invisível” no início do arquivo).
- Colunas obrigatórias agora são só:
  - **ID**
  - **DATA/HORA** (coluna única) **OU** **DATA + HORA**
- Colunas opcionais (geram *warnings*, não bloqueiam):
  - NOME, PROFISSIONAL, SERVIÇOS, LOCAL, STATUS
  - **TELEFONE** (fallback)

### 2) Período do painel de constância corrigido
- `GET /api/admin/attendance/summary` passa a calcular o período pela **data real da sessão** (`isoDate`), e não pela data do import (`createdAt`).

### 3) Follow-ups mais seguros
- `POST /api/admin/attendance/send-followups` agora **bloqueia envio** quando:
  - paciente não está vinculado (`unlinked_patient`)
  - telefone é ambíguo sem vínculo (`ambiguous_phone`)
  - conflito entre telefone do log e telefone do perfil (`phone_mismatch`)

> Diretriz clínica preservada: reforçar vínculo e constância, sem atalhos de cancelamento/remarcação.
