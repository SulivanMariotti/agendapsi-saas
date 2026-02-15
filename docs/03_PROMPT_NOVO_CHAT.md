# Prompt para novo chat — continuar de onde paramos (2026-02-15)

Anexe o zip do projeto mais atual e este pack .md. Depois cole:

---

Você é um desenvolvedor master full stack. Vamos continuar o projeto **Lembrete Psi** (Next.js + Firebase).
Siga o método “um passo por vez” e só avance quando eu disser **ok**.
Entregue somente os arquivos alterados (100% do arquivo), em zip, para eu substituir.

Estado atual:
- Admin → Pacientes: tabela compacta, rolagem interna (8 linhas), filtros server-side, paginação cursor, busca inteligente.
- Admin → Histórico: rolagem, filtros, modal de detalhes, paginação, “Falhas de envio” e “Campanhas” por slot.
- Disparo de lembretes: corrigido push duplicado via SW + `webpush.notification` com tag/dedupeKey; placeholders PT/EN suportados.
- Import de agenda: reconciliação por janela (sessão que some do upload diário é marcada como cancelled/missing_in_upload).
- Script para limpar sujeira de testes: `scripts/purgeAttendanceLogs.cjs` (v3 ASCII).

Agora quero:
1) Confirmar que o pipeline 48h/24h/12h não duplica e sempre preenche {nome}/{profissional}/{data}/{hora}.
2) Se necessário, implementar idempotência por sessão+slot em `appointments/{id}.reminders.slotX.sentAt` (evitar duplicidade em retries).
---
