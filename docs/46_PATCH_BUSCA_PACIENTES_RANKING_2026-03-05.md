# PATCH — Busca global de Pacientes (Profissional) — Ranking + Normalização

Data: 2026-03-05  
Patch: `AgendaPsi_patch_prof_busca_pacientes_ranking_2026-03-05.zip`

## Objetivo
Melhorar a relevância e a tolerância a variações de escrita na busca **Pacientes** (header da agenda do Profissional), sem alterar UI.

## Mudanças
- API `GET /api/professional/patients/search?q=...`:
  - Normaliza texto de busca (lowercase + remove acentos/diacríticos).
  - Tenta prefix search em campo opcional `searchName` (quando existir nos docs de pacientes).
  - Mantém prefix search por `fullName` como fallback.
  - Fallback final agora é **bounded scan com ranking** (prioriza match por telefone/CPF e por início de nome).

## Impacto
- Não muda permissões, nem rotas públicas.
- Resposta da API mantém o mesmo formato (`{ ok, patients: [...] }`).
- Melhora experiência quando o nome do paciente tem acentos ou variações.

## Como validar
1. Em `/profissional`, no header, selecione escopo **Pacientes**.
2. Pesquise um paciente com nome que tenha acento (ex.: “João”) digitando “joao”.
3. Pesquise por parte do telefone (últimos 5+ dígitos) e confirme que aparece no topo.
4. Confirmar que não há erros no console/network.

