# Reuso do Lembrete Psi como base (código/UI) — AgendaPsi

Data: 2026-02-28

## Decisão
- **Lembrete Psi** (agenda.msgflow.app.br) segue em produção na clínica **sem alterações obrigatórias** para o AgendaPsi.
- **AgendaPsi** (agendapsi.msgflow.app.br) é um **novo sistema** e **não compartilha** base de dados/regras com o Lembrete Psi.

## O que significa “reaproveitar”
Reaproveitar = **copiar/adaptar** o que já existe no Lembrete Psi para acelerar o AgendaPsi, mantendo:
- separação de projeto Firebase
- separação de coleções
- separação de regras
- separação de deploy/domínio

## Componentes/padrões candidatas a reuso
- Layout e componentes do Admin (tabelas, filtros, toasts, navegação, modais)
- Padrões de endpoints e validação (zod/validação manual, tratamento de erro)
- Mecanismo de push/FCM (quando o AgendaPsi passar a enviar lembretes)

## Itens explicitamente fora do reuso
- Firebase Project do Lembrete Psi (produção)
- Firestore Rules do Lembrete Psi como “verdade” (AgendaPsi terá regras próprias)
- Coleções e chaves do Lembrete Psi (AgendaPsi possui seu próprio modelo)

## Admin “unificado” no AgendaPsi
No AgendaPsi:
- **Admin** usa o *template* do Admin do Lembrete Psi (UI/código base)
- Admin recebe módulos novos: tenants, profissionais, pacientes, agenda, status, códigos, templates, etc.

O Lembrete Psi da clínica não é substituído automaticamente — o AgendaPsi é separado.


---

## Admin do AgendaPsi (unificado por UX/código)
- Reaproveitamos o template do Admin do Lembrete Psi (componentes/UI) dentro do AgendaPsi.
- Configurações do AgendaPsi (ex.: schedule) ficam em módulos/abas do `/admin`, mas com dados no Firestore do AgendaPsi.
