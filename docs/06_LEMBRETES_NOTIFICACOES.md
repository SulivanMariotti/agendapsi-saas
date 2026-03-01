# Lembretes e notificações — AgendaPsi

Atualizado: 2026-02-28

## Princípio
AgendaPsi é a **fonte de verdade** do agendamento. O módulo de lembretes é derivado do Lembrete Psi, reaproveitando código e lógica.

## Reuso do Lembrete Psi
Reaproveitar:
- Service Worker `firebase-messaging-sw.js` (FCM Web Push)
- lógica de registro de token do paciente (adaptada ao tenant/paciente do AgendaPsi)
- templates de mensagens e regras de disparo (ajustadas ao AgendaPsi)
- componentes de UI e padrões do Admin para monitoramento

## Fluxo de dados recomendado (MVP)
1) Profissional cria/atualiza `appointmentOccurrences`.
2) Um job (cron / scheduler) gera “tarefas de lembrete” para a janela:
   - D-1, H-2, etc. (a definir)
3) Disparo via FCM.
4) Log de disparos e auditoria (LGPD: sem conteúdo sensível).

## Observações de separação
- Não reutilizar as coleções do Lembrete “como estão” no projeto AgendaPsi.
- O que é reaproveitado é **código e padrões**, com o **modelo do AgendaPsi**.


> Estado: Ainda não integrado no AgendaPsi (somente base/ideia de reuso do Lembrete Psi quando chegar a fase de lembretes).
