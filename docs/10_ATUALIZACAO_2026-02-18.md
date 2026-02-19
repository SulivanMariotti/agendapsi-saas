# Atualização — 2026-02-18

## Resumo do dia (o que foi fechado)

### 1) Segurança v1 (produção-ready)
- **Desativado** login paciente por e-mail sem verificação (padrão).
- Fluxo do paciente: **vínculo por telefone + código** (single-use por dispositivo).
- Admin: acesso somente por **custom claims**.
- Firestore rules: travas críticas em `users`, `audit_logs`, `subscribers`, `patient_notes`.
- Hardening: headers + CSP enforce em produção; rate limit; erros seguros; origin guard padronizado.
- Retenção: `expireAt` + **TTL configurado** em `history` e `audit_logs`.

### 2) Biblioteca (Paciente)
- Menu **Biblioteca** (desktop + mobile).
- Modal com rolagem interna e botão de fechar (X/Fechar/ESC).
- Busca, categorias e seção **“Para levar para a sessão”**.
- Mantra fixo: **leitura não substitui sessão**.

### 3) Biblioteca (Admin)
- Repositório de artigos: criar/editar/publicar/despublicar/excluir.
- Categorias: CRUD + ativar/desativar/ordenar.
- Editor de artigo: select de categoria + criar categoria inline.

---

## Estado atual
- Operação principal continua **manual** (sem cron).
- Diretriz clínica mantida: **sem CTA** de cancelar/remarcar no paciente.

## Próximo foco
- Presença/Faltas: **painel de constância (30 dias)** com insights clínicos + suporte a segunda planilha/relatório.


---

> Continuação: veja `docs/10_ATUALIZACAO_2026-02-19.md` (Presença/Faltas: robustez do import + bloqueios seguros de follow-up).
