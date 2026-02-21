# Atualização — 2026-02-20 — Paciente (Mobile UI + Paleta + Navegação)

## Objetivo clínico
Deixar o painel do paciente em modo **“1 olhar e pronto”**, reforçando **vínculo e constância** (presença), com **zero CTA** de cancelar/remarcar.

## Entregas principais

### 1) Topo fixo (AppBar)
- Barra superior fixa com branding **Lembrete Psi**, logo branco e acesso ao **Menu**.
- Respeita `env(safe-area-inset-top)`.

### 2) Bottom nav (app nativo)
- Barra inferior fixa com 4 itens: **Sessão / Diário / Leituras / Contrato**.
- Item ativo em pílula + safe-area.

### 3) Contrato (mobile)
- Modal com título sempre visível (altura limitada + scroll interno).
- Contrato também acessível pelo bottom nav.

### 4) Menos contornos (hierarquia real)
- Cards informativos do paciente deixam de ter `border/ring` (viram superfície com sombra leve).
- Borda fica só para **inputs** e **separadores**.

### 5) Paleta consistente
- **Sem rosado**: fundo do paciente migrou para **escala de cinza**.
- Primário do paciente migrou para **`bg-violet-950/95`**.
- Estados preservados: ok (emerald) / atenção (amber).

### 6) Tokens + tema do paciente (sem afetar Admin)
- Tokens do paciente centralizados em `src/features/patient/lib/uiTokens.js`.
- `DesignSystem.Button` lê overrides via `UiThemeProvider`.
- Tema aplicado **apenas no paciente** em `src/app/page.js` (Admin permanece igual).

## Checklist rápido (mobile)
1) Home: Próxima Sessão aparece rápido (sem “peso” no topo).
2) Top AppBar: fica fixa; scroll não corta conteúdo.
3) Bottom nav: 4 itens funcionam + safe-area.
4) Contrato: título visível, rolagem ok.
5) Diários/Leituras: cards não parecem botão; inputs com foco ok.

## Próximas prioridades
1) Migrar `ADMIN_PASSWORD` → Admin Auth forte (Firebase Auth + MFA/TOTP obrigatório; alternativa: magic link).
2) Validar import da 2ª planilha real de Presença/Faltas.
3) Documentar modelo NoSQL/denormalização + chave única do paciente.
