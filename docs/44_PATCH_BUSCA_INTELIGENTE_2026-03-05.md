# PATCH — Busca inteligente (Profissional) — 2026-03-05

## Objetivo
Adicionar busca com escopo alternável no header da agenda do Profissional:
- **Visão**: busca apenas nos itens carregados (Dia/Semana/Mês).
- **Pacientes**: busca em **todos os pacientes do tenant** via API server-side e abre o cadastro do paciente.

## O que foi implementado
### UI (Header da Agenda)
- Toggle **Visão / Pacientes** dentro do campo de busca.
- Placeholder muda conforme o escopo.
- Ao trocar o escopo, o campo de busca é limpo para evitar resultados misturados.

### Comportamento
- **Visão** (default): mantém o comportamento existente:
  - Dia: seleciona e abre ocorrência.
  - Semana/Mês: seleciona e navega para o dia correspondente.
- **Pacientes**:
  - Consulta `GET /api/professional/patients/search?q=...` (debounce 250ms).
  - Resultados mostram `Nome — +E164` quando disponível.
  - Seleção abre `PatientProfileModal` (cadastro completo) para o paciente.

### API
- `GET /api/professional/patients/search?q=...`
  - Auth: `requireProfessionalApi`
  - Rate limit: bucket `professional:patients:search`
  - Estratégias:
    1) Match exato por **CPF** (patientCpfIndex) quando aplicável.
    2) Match exato por **telefone canonical** (patientPhoneIndex) quando aplicável.
    3) Prefix search em `fullName` (best-effort).
    4) Fallback: scan limitado (orderBy updatedAt desc, limit 250) com filtro `includes` (MVP).

## Arquivos alterados
- `src/components/Professional/ProfessionalAgendaHeader.js`
- `src/components/Professional/ProfessionalDayViewClient.js`
- `src/components/Professional/ProfessionalWeekViewClient.js`
- `src/components/Professional/ProfessionalMonthViewClient.js`
- `src/app/api/professional/patients/search/route.js`
- `docs/31_PATCHES_ZIPS_APLICADOS.md`
- `docs/44_PATCH_BUSCA_INTELIGENTE_2026-03-05.md`

## Testes manuais
1) Em `/profissional`:
   - Digite no modo **Visão** e confirme que aparece lista de pacientes/ocorrências da visão.
   - Clique em um item:
     - Dia: abre detalhe.
     - Semana/Mês: navega para o dia.

2) Troque para **Pacientes**:
   - Pesquise por nome (>=2 chars) e selecione um resultado: deve abrir o **modal de cadastro**.
   - Pesquise por telefone/CPF (quando conhecido) e selecione: deve abrir o modal.

3) Segurança:
   - Confirmar que API responde 401 sem sessão e é bloqueada por rate limit em abuso.
