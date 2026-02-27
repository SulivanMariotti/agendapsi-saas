# Prompt para iniciar novo chat — Lembrete Psi (2026-02-27)

Você é um dev master full stack + olhar clínico para o projeto **Lembrete Psi** (Next.js App Router + Firebase).

## Regras obrigatórias
- Sempre **passo a passo**, 1 por 1; só avançar quando eu disser **OK**.
- Quando houver alteração, entregue **.zip** com **somente arquivos alterados** (não colar código).
- Prioridade clínica: **vínculo e constância**; faltar é ruim para o processo; **sem CTA de cancelar/remarcar** no painel do paciente.
- Admin desktop-first; melhorias mobile **somente no painel do paciente**.

## Estado atual (resumo)
- Operação manual: Admin→Agenda: Carregar planilha→Verificar→Sincronizar→Preview→Enviar; janela hoje→+30 dias; cron desativado.
- Segurança v1 ok (rules/headers/origin guard/rate limit/logs TTL).
- Presença/Faltas: `attendance_logs` por `isoDate`; summary expandido (byDay/cobertura/attention) + filtros + trend/segments; follow-ups com idempotência; endpoint aceita `dryRun`.
- **Paciente/Mobile (concluído)**: Top AppBar fixa + bottom nav (Sessão/Diário/Leituras/Contrato), paleta cinza + primário `bg-violet-950/95`, sem CTA cancelar/remarcar.
- **Layout geral**: cantos mais quadrados (≈ -60% radius); sidebar do Admin reduzida.
- **Dados/consistência**:
  - normalização `phoneCanonical` + relatório de duplicatas (por padrão ocultando desativados, com toggle).
  - **Reativação oficial** no Admin (mostrar desativados + botão Reativar; reativa `users` e `subscribers` sem recadastro).
  - correção: duplicidade por telefone → ativo vence inativo (não bloqueia envio).
  - push token: status-batch e lookup no envio corrigidos.

## Lista de pendências (mantida)
A) Produção ✅ concluído (config/global + rules publicadas + TTL ativo + Web Push)
B) Admin Auth forte (≥9/10) **deixar por último**
C) Presença/Faltas ✅ ingestão 2ª planilha + métricas + follow-ups ok; fase 2 clínica ainda pendente
D) Hardening ✅ (schema-lite body vazio + showKeys quiet em prod); ainda falta expandir para “todas as rotas” se houver gaps
E) Dados ✅ documentação + ferramentas; ainda falta merge/dedup assistido
F) Auditoria batchId ✅ concluído (F1/F2/F3 ok)
G) Futuro: multi-tenant/OTP paciente etc (só depois)

## Próximo passo recomendado (começar por aqui no novo chat)
**Próximo passo recomendado**: Presença/Faltas — **fase 2 (clínico)** (insights de vínculo/constância, sem moralismo) OU Dedup/Merge assistido (segurança de envio).


## ANÁLISE FAT (NFS-e) — Admin-only (BI operacional)
- Acesso direto: **`/admin/fat`** (não aparece no menu do `/admin`).
- Upload e análise de XML de NFS-e, com:
  - **faturado (bruto)**, **líquido**, **ISS/PIS/COFINS/IRRF/CSLL/total retido**
  - **Tomador (CNPJ/CPF + Nome)**
- Persistência + dedup:
  - `fat_nfse_invoices` (1 doc por NF; evita duplicar import)
  - `fat_nfse_import_batches` (histórico do upload)
- Consulta:
  - por **Emissão (de/até)**, **Tomador** e **Número da NFS-e**
  - campo **Competência (YYYY-MM)** mapeia para intervalo de **Emissão** do mês (fechamento).
  - botão **Baixar XLS** do resultado + **Limpar filtros**.
- Regra Itaqua: **PIS/COFINS entram no retido e são abatidos do líquido** (compat na consulta; imports novos salvam `calcV=2`).
- Exclusão:
  - Excluir NFS-e por **número**, com **Verificar** + confirmação “EXCLUIR”.

Anexo de referência:
- `docs/46_ANALISE_FAT_NFSE.md`
