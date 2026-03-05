# AgendaPsi — WhatsApp Templates (Admin + Profissional)

Atualizado: **2026-03-03**

## Objetivo
Permitir que o **Admin** cadastre templates de WhatsApp por tenant, e que o **Profissional** selecione um template no detalhe do agendamento/hold para preencher a mensagem automaticamente.

## Modelo de dados (por tenant)
Coleção:
- `tenants/{tenantId}/whatsappTemplates/{templateId}`

Campos sugeridos:
- `title` (string) — nome do template (ex.: "Confirmação")
- `body` (string) — texto com placeholders
- `sortOrder` (number) — ordem no select (menor = primeiro)
- `isActive` (boolean) — se false, não aparece para o profissional
- `createdAt`, `updatedAt` (serverTimestamp)
- `updatedBy` (uid do admin)

## Placeholders suportados (MVP)
- `{nome}` — nome do paciente (ou lead)
- `{data}` — data curta pt-BR (dd/mm/aaaa)
- `{hora}` — horário (HH:MM)

> Observação: no MVP, o motor é uma simples substituição de strings. Se precisar, podemos evoluir para placeholders mais ricos (weekday, link, endereço, profissional etc.).

## Fluxo Admin
- Menu: **AgendaPsi → Templates WhatsApp**
- CRUD via API Admin:
  - `GET /api/admin/agendapsi/whatsapp-templates?tenantId=...`
  - `POST /api/admin/agendapsi/whatsapp-templates`
  - `PATCH /api/admin/agendapsi/whatsapp-templates`
  - `DELETE /api/admin/agendapsi/whatsapp-templates?tenantId=...&templateId=...`

## Fluxo Profissional
- Nas visões **Dia / Semana / Mês**, no detalhe do item:
  - Select de template
  - Prévia da mensagem
  - Botão para abrir WhatsApp com texto preenchido
- Se não houver templates ativos, o sistema usa um **fallback** (mensagem padrão) para não bloquear o uso.

## Segurança
- Recomendado nas Rules:
  - leitura: membros do tenant
  - escrita: admin claim ou owner/admin do tenant
- No MVP atual, os dados do profissional são carregados via **server-side (Admin SDK)**, então as Rules não são a única barreira — mas mantê-las consistentes reduz risco futuro.
