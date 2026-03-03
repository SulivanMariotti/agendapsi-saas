# README — Referência do Lembrete Psi (somente UI/código)

Atualizado: **2026-03-02**

Este arquivo existe apenas para **referência** (reuso de UI/padrões) e para lembrar as regras de separação.

## Regra crítica (não negociar)
- **Lembrete Psi** roda em `agenda.msgflow.app.br` e permanece como está.
- **AgendaPsi** roda em `agendapsi.msgflow.app.br` e é um projeto separado.
- É proibido compartilhar Firebase Project/Firestore/Rules/deploy/dados.

## Reuso permitido
- Componentes, layout, UX patterns, validação e padrões de rotas.

## Reuso proibido
- Qualquer coisa de dados: coleções, rules, custom claims, projetos Firebase.

