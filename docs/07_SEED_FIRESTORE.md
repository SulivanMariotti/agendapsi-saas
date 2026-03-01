# Seed Firestore — AgendaPsi

Atualizado: 2026-02-28

## Rodar
- `npm run seed:agendapsi`

## O que cria/atualiza
- tenant + settings/schedule
- occurrenceCodes
- whatsappTemplates
- patient teste
- appointmentSeries + appointmentOccurrences (inclui exemplos)
- membership + `userTenantIndex/{uid}`

## Pegadinha do Console (subcoleções)
Às vezes o Firestore Console não lista todas as subcoleções do doc do tenant.
Use URL direta, por exemplo (dentro do Firestore Data URL):
- adicionar `~2FappointmentSeries`
- adicionar `~2FappointmentOccurrences`
