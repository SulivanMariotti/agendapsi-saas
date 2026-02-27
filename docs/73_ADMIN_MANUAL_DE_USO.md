# 73 — Manual de Uso (Painel Admin) — Agenda e Presença/Faltas (2026-02-24)

Este manual existe para **reduzir falhas operacionais** que viram falhas de cuidado ativo.  
Quando o lembrete falha, a sessão “some” da semana — e a constância (que é parte do tratamento) perde força.

> Diretriz: o painel do paciente **não** oferece CTA/botão de cancelar/remarcar.  
> Cancelar/remarcar exige contato ativo (barreira saudável contra resistências momentâneas).

---

## 1) Agenda — finalidade clínica
- Garantir que o paciente **não precise lembrar sozinho**.
- Diminuir faltas por esquecimento e por “ruído” do dia a dia.
- Sustentar vínculo: o horário é um compromisso terapêutico.

---

## 2) Agenda — passo a passo (modo manual recomendado)

### 2.1 Importar agenda (janela móvel)
1. Admin → **Agenda** → **Carregar Planilha**
2. Selecione a planilha do período **hoje → +30 dias**
3. Clique **Verificar**
   - confira parsing (data/hora/profissional)
   - corrija linhas problemáticas na origem quando necessário
4. Clique **Sincronizar**
   - cria/atualiza sessões
   - quando uma sessão futura “sumiu” do upload, ela pode ser marcada como **missing/cancelled** (mantém histórico)

### 2.2 Lembretes (dryRun → envio)
1. Clique **Gerar Preview do Disparo** (dryRun)
2. Confira:
   - enviáveis (sendable)
   - bloqueados por motivo: `SEM_PUSH` (UI: **Sem Push**), `INATIVO`, `SEM_TELEFONE`, `ALREADY_SENT`
3. Confira a amostra (placeholders preenchidos)
4. Clique **Enviar lembrete**

**Regra de segurança:** se houver **CHECK** (push não confirmado), o sistema bloqueia o envio até você gerar preview/diagnóstico coerente.

### Legenda rápida (1 olhar e pronto)
- **Na base**: subscriber encontrado (cadastro técnico ok).
- **Fora da base**: não casou subscriber → não entra na fila.
- **Push OK**: token presente → pode enviar notificação.
- **Sem Push**: sem token → entra para diagnóstico, mas não dispara push.
- **CHECK**: o push ainda não foi confirmado para a seleção atual (gere Preview/diagnóstico).


---

## 3) Operação do Dia — como usar
No topo da Agenda existe o card **Operação do Dia** para reduzir risco humano:

- **Progresso** do pipeline (import/verificar/sincronizar/preview/envio)
- **CHECK**: indica que o estado de push ainda não foi confirmado para a seleção atual
- **CSV diagnóstico**: exporta uma lista objetiva de bloqueios (para ação rápida)
- **Copiar resumo do dia**: pronto para colar no seu registro diário
- **Salvar registro** e **Marcar dia concluído**
- **Histórico (últimos 14 dias)**: auditoria e comparação

---

## 4) Presença/Faltas — finalidade clínica
- Não é “punição”: é **visibilidade do processo**.
- Ajuda a clínica a detectar padrões:
  - faltas recorrentes por esquecimento
  - resistências/evitações
  - necessidade de reforço de vínculo/contrato terapêutico

---

## 5) Presença/Faltas — passo a passo
1. Admin → **Presença/Faltas** → importar a planilha/relatório (quando aplicável)
2. Conferir métricas (30/60/90 dias)
3. Rodar follow-ups primeiro em **dryRun**
4. Enviar follow-ups reais

### Idempotência (anti-spam)
- O follow-up não reenviará se:
  - `attendance_logs/{id}.followup.sentAt` já existir

---

## 6) Diagnóstico rápido (erros comuns)
- **SEM_PUSH**: paciente não ativou notificações / token ausente
- **INATIVO**: usuário/paciente está desativado
- **SEM_TELEFONE**: falta phone/phoneCanonical (corrigir cadastro/import)
- **ALREADY_SENT**: idempotência funcionando (reenvio bloqueado)
- **CHECK**: precisa rodar preview/diagnóstico antes de enviar

Se algo bloquear o lembrete, trate como risco de constância:  
“Se o lembrete não chega, o paciente fica sozinho com a tarefa de lembrar — e isso aumenta a chance de falta.”

---

## 7) Links úteis
- Runbook operacional: `docs/27_OPERATIONS_RUNBOOK.md`
- Checklist 1 página: `docs/27A_DAILY_CHECKLIST_ONEPAGER.md`
- Template de registro: `docs/27B_DAILY_LOG_TEMPLATE.md`
- Troubleshooting: `docs/18_TROUBLESHOOTING_COMMON_ERRORS.md`
- Catálogo de endpoints: `docs/16_API_ENDPOINTS_CATALOG.md`

---


## ANÁLISE FAT (XML de NFS-e) — Admin-only

**Acesso:** `https://SEU_DOMINIO/admin/fat`  
> Não aparece no menu do `/admin` (acesso direto por URL).

### Para que serve
Fechamento mensal e BI operacional (interno) com:
- faturado (bruto), líquido
- tributos separados (ISS/PIS/COFINS/IRRF/CSLL/total retido)
- Tomador (CNPJ/CPF + Nome)

### Fluxo recomendado
1) Abra `/admin/fat`
2) **Importar**
   - Selecione o XML do mês (pode conter várias notas)
   - Clique **Analisar** (prévia)
   - Clique **Importar e salvar** (persistência + dedup)
3) **Consultar**
   - Preencha **apenas 1 filtro** (ex.: Tomador OU Emissão de/até OU Competência YYYY-MM)
   - Clique **Buscar**
4) **Excluir** (avançado)
   - Digite o número da NFS-e
   - Clique **Verificar**
   - Para excluir: digite **EXCLUIR** e confirme

### Observações importantes
- O campo “Competência (YYYY-MM)” é usado para facilitar fechamento por **Emissão** (mês).  
  `dCompet` pode vir inconsistente em algumas emissões de NFS-e; por isso o fechamento é por emissão.
