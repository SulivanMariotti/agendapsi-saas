# Leia-me — Atualizações (2026-02-25)

Este arquivo resume o que foi consolidado na sessão de 24/02 → 25/02/2026 e o estado pronto para retomar em um novo chat.

---

## 1) Norte clínico (inalterado)
- Objetivo do sistema: **sustentar vínculo e constância**.
- Disparos: **48h / 24h / manhã**.
- Psicoeducação: faltar interrompe o processo.
- Responsabilização: horário existe por contrato.
- Painel do paciente: **sem CTA/botão de cancelar/remarcar**.

---

## 2) O que foi resolvido em 24/02/2026
### iPhone/iOS Push
- Push Web no iOS só fica disponível quando o paciente abre pelo **ícone PWA** (Tela de Início).
- Navegador “dentro” de apps (WhatsApp/Instagram) pode bloquear SW/Push → UX orienta abrir no Safari e instalar.

### Importar Agenda (Admin) — clareza operacional
- Badges separados:
  - **Na base / Fora da base** (subscriber encontrado vs não encontrado)
  - **Push OK / Sem Push** (token presente)
- Legenda rápida “1 olhar e pronto”.

### Fix de matching CSV ↔ subscribers
- Corrigido o “Não autorizado” falso: matching passou a considerar `phoneCanonical` e/ou `docId/id` (não só `s.phone`).

### Copy clínico default
- Templates default 48h/24h/morning com `{quando}`, sem CTA de cancelamento.
- Remoção de “Permittá” hardcoded do título default: agora `💜 Lembrete Psi — …` (prefixo configurável via `config/global`).

### Docs tocados
- `docs/00_ONDE_PARAMOS.md`
- `docs/18_TROUBLESHOOTING_COMMON_ERRORS.md`
- `docs/32_PUSH_TOKEN_DIAGNOSTICS_AND_BADGE_LOGIC.md`
- `docs/73_ADMIN_MANUAL_DE_USO.md`

---

## 3) O que foi consolidado em 25/02/2026 (Admin / Presença-Faltas / Histórico)
### Presença/Faltas (Admin-only)
- Documento de modelo de dados e regras admin-only (`attendance_logs`).
- Import e follow-ups com **rastreabilidade por lote**: `batchId`.
- UI: botões **“Abrir lote no Histórico”** após import/disparo.

### Hotfixes
- Build error: JSX inválido em `AdminAttendanceImportCard.js`.
- Histórico: fix do erro `Cannot access 'rangeLogs' before initialization`.

---

## 4) Próximos passos (retomar no novo chat)
1) **Revalidar/fechar hardening do módulo Presença/Faltas**:
   - envio real exigir confirmação/flag explícita;
   - bloquear ranges inválidos (futuro/janelas grandes);
   - logs/payload sem PII desnecessária (evitar linha crua e telefone completo).
2) **Painel de constância (7/30/90)** com insights clínicos + cards.
3) Automatizar follow-ups (presença/falta) — mantendo **admin-only** por enquanto.
4) Roadmap segurança: OTP/magic link antes de PWA/App; depois multi-tenant.

---

## 5) Como iniciar o próximo chat
Anexe estes arquivos:
- `docs/00_PROMPT_NOVO_CHAT.md`
- `docs/00_ONDE_PARAMOS.md`
- `docs/00_LEIA_ME_ATUALIZACOES_2026-02-25.md`
- `docs/04_PROXIMOS_PASSOS.md`
