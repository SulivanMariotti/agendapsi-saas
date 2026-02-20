# Lembrete Psi — Handoff para novo chat (2026-02-20)

Este pack serve para iniciar um novo chat e continuar o desenvolvimento **de onde paramos**, sem perder decisões clínicas/técnicas.

## Regras de trabalho (obrigatórias)
- Sempre **passo a passo**, 1 por 1; só avançar quando eu disser **OK**.
- Quando houver alteração de código/documentação, entregar **.zip** com **somente arquivos alterados** (não colar código no chat).
- Diretriz clínica: foco em **constância/vínculo**; faltar é ruim para o processo; **sem CTA de cancelar/remarcar** no painel do paciente.
- Admin será tratado como **desktop-first**; otimizações mobile **somente no painel do paciente**.

---

## Estado atual (resumo)
### Operação (manual)
Admin → Agenda → **Carregar Planilha → Verificar → Sincronizar → Preview → Enviar**  
- Janela: **hoje → +30 dias**
- Cron não habilitado (rotas `/api/cron/*` seguras para futuro)

### Segurança
- Paciente: telefone + código (single-use por dispositivo)
- Admin: custom claims + guards
- Rules + CSP/headers + origin guard + rate limit + logs TTL
- Acesso do paciente: **bloqueio só por flag explícita** (`accessDisabled/securityHold/...`)
- Endpoint Admin: `POST /api/admin/patient/access` (com `audit_logs` + `history`)

**Pendência para nota ≥ 9**
- Migrar `ADMIN_PASSWORD` → login Admin forte:
  - preferido: Firebase Auth + **MFA/TOTP obrigatório**
  - alternativa: magic link (email link)
  - migração progressiva e desativação do legado em produção

### Presença/Faltas (constância)
- Import robusto + painel de constância 30 dias por `isoDate`
- `GET /api/admin/attendance/summary` expandido (byDay/cobertura/attention) + filtros + trend/segments
- UI Admin: filtros e prioridades (sem moralismo)

### Painel do paciente (mobile)
- Base mobile-first (viewport, spacing)
- Drawer menu + bottom nav
- Agenda colapsável, diário otimizado, próxima sessão compacta e confirmação destacada
- Notificações compactas, biblioteca com busca/categorias sticky

---

## Próximo passo (a atacar primeiro)
1) **Paciente/Mobile:** reduzir altura do topo (mantra/header) + melhorar leitura do painel.
2) Validar ingestão da **2ª planilha real** de presença/faltas (modo mapeado) com cabeçalhos reais.
3) Segurança: plano de migração do login Admin (MFA/magic link) para chegar em ≥ 9/10.

---

## Arquivos-chave para retomar
- `docs/00_ONDE_PARAMOS.md`
- `docs/00_PROMPT_NOVO_CHAT.md`
- `docs/02_BACKLOG.md`
- `docs/02_CHANGELOG.md`
- `docs/04_PROXIMOS_PASSOS.md`
- `docs/16_API_ENDPOINTS_CATALOG.md`
- `docs/19_CONSTANCY_METRICS_AND_FOLLOWUPS.md`
- `docs/26_ATTENDANCE_IMPORT_SPEC.md`
- `docs/74_SEGURANCA_PLANO_PRODUCAO.md`
