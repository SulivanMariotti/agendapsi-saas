# HOTFIX — Detalhe do agendamento (P1) — correção de build

Data: 2026-03-05

## Problema
Após aplicar o patch **P1** do "Detalhe do agendamento", o projeto passou a falhar com:

1) **Module not found**: import de `AppointmentDetailHeader` (arquivo inexistente) no *Dia*  
2) **Parsing error (JSX)** no *Mês* (estrutura do modal ficou inválida)

## O que foi feito neste hotfix (escopo mínimo)
- **Dia**: restaura `ProfessionalDayViewClient.js` para a versão estável anterior (sem dependência de `AppointmentDetailHeader`).
- **Mês**: restaura `ProfessionalMonthViewClient.js` para a versão estável anterior (JSX válido).

> Este hotfix **reverte** as mudanças do Patch P1 especificamente em **Dia/Mês** para recuperar o build.

## Como validar
1) Parar o dev server (`Ctrl+C`)
2) (Recomendado) remover a pasta `.next`
3) `npm run dev`
4) Abrir `/profissional`
   - não deve ocorrer erro 500
5) `npm run build` deve concluir sem erros

## Próximo passo (retomar P1 em patches menores)
Reaplicar o padrão do detalhe em entregas menores e seguras:
1) Criar componente compartilhado do header do detalhe (sem quebrar Dia/Semana/Mês)
2) Migrar Dia para layout 2 colunas mantendo build verde
3) Migrar Mês mantendo build verde
