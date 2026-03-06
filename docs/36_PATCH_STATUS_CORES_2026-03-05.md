# PATCH — Cores dos status (Profissional)

Data: 2026-03-05  
Arquivo: `AgendaPsi_patch_status_colors_prof_agenda_2026-03-05.zip`

## Objetivo
Padronizar as **cores de status** nos cards/chips da agenda do **Profissional** (Dia/Semana/Mês), garantindo leitura rápida e consistência visual.

## Mapeamento de cores (oficial)
- **Agendado**: mantém a cor atual
- **Confirmado**: **Azul**
- **Finalizado**: **Verde**
- **Não comparece**: **Rosa**
- **Cancelado**: **Vermelho**
- **Reagendado**: **Laranja**
- **Hold/Reserva** (`isHold=true`): mantém neutro (cinza), independente do status

## Onde aplica
- Visão **Dia**: barra lateral + card soft + borda de acento + chips de status
- Visão **Semana**: bloco do grid + chips + ícone do status
- Visão **Mês**: ponto (dot) + chip colorido do item

## Arquivos alterados
- `src/components/Professional/ProfessionalDayViewClient.js`
- `src/components/Professional/ProfessionalWeekViewClient.js`
- `src/components/Professional/ProfessionalMonthViewClient.js`
- `docs/31_PATCHES_ZIPS_APLICADOS.md`

## Como validar (checklist)
1) Abrir `/profissional` e checar:
- [ ] **Confirmado** aparece **azul** (Dia/Semana/Mês)
- [ ] **Finalizado** aparece **verde**
- [ ] **Não comparece** aparece **rosa**
- [ ] **Cancelado** aparece **vermelho**
- [ ] **Reagendado** aparece **laranja**
- [ ] **Agendado** mantém a cor anterior
- [ ] **Hold** permanece neutro (cinza)

2) Abrir o detalhe (overlay) e confirmar:
- [ ] Chip de status segue as mesmas cores
