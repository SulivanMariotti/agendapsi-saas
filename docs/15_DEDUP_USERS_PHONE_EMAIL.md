# Deduplicação segura de users (email / phoneCanonical)

## Por que é crítico
Deduplicar “no automático” pode causar:
- envio de lembrete para **destinatário errado** (privacidade + vínculo)
- bloqueio indevido (“inativo vence ativo” — corrigido, mas ainda pode gerar ruído operacional)

## Fluxo recomendado (assistido)
1) Gerar relatório de duplicatas por `phoneCanonical`
2) Classificar casos:
   - A) mesmo paciente duplicado (cadastro repetido)
   - B) telefone compartilhado (família/contato comum) — **não merge automático**
   - C) erro de cadastro (telefone digitado errado)
3) Para A):
   - escolher “registro principal”
   - migrar referências operacionais (se houver)
   - marcar o outro como `inactive` com motivo “duplicate”
4) Para B):
   - manter ambos
   - garantir que o envio nunca “cruze” pessoas (somente se vínculo explícito)
5) Para C):
   - corrigir telefone e re-normalizar

## Ferramentas já existentes no Admin
- Normalização de `phoneCanonical`
- Relatório de duplicatas (por padrão ocultando desativados) + toggle
- Reativação oficial (sem recadastro)
