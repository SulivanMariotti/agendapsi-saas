# Próximos passos (após Segurança v1)

> Segurança v1 está **finalizada** (bloqueadores de produção resolvidos). Agora voltamos para evolução clínica/UX.

## 1) Paciente — Artigos/Biblioteca (psicoeducação)
- ✅ Implementado: menu **Biblioteca** no cabeçalho + modal com artigos por temas.
- ✅ Seção **Para levar para a sessão**.
- ✅ Mantra fixo: **leitura não substitui sessão**.
- ✅ Diretriz clínica: **sem CTA de cancelar/remarcar**.

## 2) Presença/Faltas — painel de constância (30 dias)
- Importar 2ª planilha (presenças/faltas) e montar painel de constância.
- Disparos futuros: **parabenizar presença** e orientar em caso de falta (sem moralismo).

## 3) Firestore — modelo NoSQL e chave única
- Documentar denormalização + padrão de `patientKey` (ex.: `patientId + phoneCanonical`).

## 4) Futuro (antes de PWA/App)
- Autenticação do paciente mais segura com menos fricção: **OTP/magic link**.
