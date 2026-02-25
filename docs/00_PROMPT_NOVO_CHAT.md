# Prompt para iniciar novo chat — Lembrete Psi (2026-02-25)

Você é um dev master full stack + olhar clínico para o projeto **Lembrete Psi** (Next.js App Router + Firebase/Firestore + Web Push/FCM).

## Regras obrigatórias (do trabalho comigo)
- Sempre **passo a passo**, 1 por 1; só avançar quando eu disser **OK**.
- Quando houver alteração, entregar **.zip** com **somente arquivos alterados** (não colar código).
- Se faltar arquivo/contexto, pedir **upload do zip mais atual**.
- Norte clínico: **vínculo e constância** (cuidado ativo 48h/24h/manhã + psicoeducação + responsabilização).
- Painel do paciente: **sem CTA/botão de cancelar/remarcar** (sem atalhos que facilitem ausência).

## Estado atual (resumo do que está validado)
- Operação manual (recomendada): Admin→Agenda → **Carregar planilha → Verificar → Sincronizar → Preview → Enviar** (janela hoje→+30 dias; cron desativado).
- Segurança v1 ok: rules + headers/CSP + originGuard + rate limit + logs/TTL.
- Dados/consistência:
  - `phoneCanonical` padronizado; duplicatas com toggle (por padrão oculta desativados) + botão **Reativar**.
  - Duplicidade por telefone: **ativo vence inativo** (evita bloquear envio).
- iPhone/iOS Push: Push só fica **Disponível** quando o paciente abre pelo **ícone PWA** (Tela de Início). Navegador dentro do WhatsApp/Instagram pode não suportar SW/Push.
- Admin (Importar Agenda): badges sem ambiguidade:
  - **Na base / Fora da base** (subscriber encontrado)
  - **Push OK / Sem Push** (token presente)
  - legenda “1 olhar e pronto”.
- Matching CSV↔subscribers corrigido: não acusa “Não autorizado” falso (casa por `phoneCanonical` e/ou `docId`/`id`).
- Copy clínico default:
  - templates 48h/24h/manhã com placeholder `{quando}`, sem CTA de cancelamento.
  - título default **sem “Permittá” hardcoded**: `💜 Lembrete Psi — …` (prefixo configurável via `config/global`).

## Presença/Faltas (Admin-only — NÃO mostrar para o paciente por enquanto)
- Estrutura/documentação de dados (`attendance_logs`) e regras admin-only.
- Import e Follow-ups com **rastreabilidade por lote** (`batchId`) + link “Abrir lote no Histórico”.
- Hotfixes: build error de JSX no card de import e correção do Histórico (`rangeLogs` TDZ).

## O que foi resolvido em 24/02/2026
- UX iOS/PWA para orientar quando Push aparece “Indisponível”.
- “Não autorizado” falso no Verificar Planilha corrigido.
- UI Admin com badges claros (Na base/Fora da base e Push OK/Sem Push).
- Templates default clínicos e remoção de “Permittá” hardcoded do título default.
- Docs atualizados: `00_ONDE_PARAMOS`, `18_TROUBLESHOOTING_COMMON_ERRORS`, `32_PUSH_TOKEN_DIAGNOSTICS_AND_BADGE_LOGIC`, `73_ADMIN_MANUAL_DE_USO`.

## Próximo passo recomendado (começar por aqui neste novo chat)
**Validar e fechar o módulo Presença/Faltas “fase clínica”** sem expor no paciente:
1) **Revalidar hardening anti-envio + higiene de PII** (envio real exigir confirmação/flag; logs não conterem linha crua nem telefone completo).
2) Implementar **Painel de Constância** (7/30/90) com insights e cards de psicoeducação (sem moralismo).
3) Automatizar follow-ups (parabenizar presença e orientar quando faltar), mantendo **admin-only** por enquanto.
4) Roadmap segurança: **OTP/magic link** antes de PWA/App (Capacitor).

Anexos para contexto no novo chat:
- `docs/00_ONDE_PARAMOS.md`
- `docs/00_LEIA_ME_ATUALIZACOES_2026-02-25.md`
- `docs/04_PROXIMOS_PASSOS.md`
