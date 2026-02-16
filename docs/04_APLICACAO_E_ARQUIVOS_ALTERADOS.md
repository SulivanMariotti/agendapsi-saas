# Aplicação das alterações (Handoff 2026-02-15)

## Arquivos alterados (final)
- `src/app/api/admin/reminders/send/route.js` *(usar a versão do ZIP “hardening”)*
- `src/services/dataService.js`
- `src/components/Admin/AdminScheduleTab.js`

## Substituição
1) Faça backup dos arquivos atuais  
2) Substitua pelos arquivos acima (mesmos caminhos)  
3) Rode `npm run dev` e/ou `npm run build`

## Observação importante
Se você aplicou o ZIP “idempotência/placeholder” e depois o ZIP “hardening”:
- o `route.js` do hardening **substitui** o `route.js` anterior (ele inclui tudo + auditoria).
- os outros dois arquivos continuam os do ZIP anterior.
