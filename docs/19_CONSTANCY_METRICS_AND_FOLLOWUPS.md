# 19_CONSTANCY_METRICS_AND_FOLLOWUPS

Como medir **constância terapêutica** (presença/faltas) e usar isso para sustentar vínculo — sem julgamento, com firmeza.

> Princípio clínico: **comparecer é parte do tratamento**. A consistência cria condições para mudança.

---

## 1) Fonte de dados (canônica)

### 1.1 `attendance_logs/*`
Coleção para registrar presença/falta por sessão (importada por planilha ou lançada no Admin).

**Campos principais**
- `patientId` (string) ✅ id externo/sistema
- `isoDate` (string `YYYY-MM-DD`) ✅ **data real da sessão**
- `status` (string: `present|absent|unknown|...`)
- `phoneCanonical` (string|null) *(opcional; vínculo operacional)*
- `professional`, `service`, `location` *(opcionais; filtros/segmentos)*
- `createdAt` / `updatedAt`

> Constância é calculada por `isoDate` (não por `createdAt`), para refletir o comparecimento real.

---

## 2) Métricas (janela móvel 30/60/90)

### 2.1 Visão geral
- `sessionsAttended`, `sessionsMissed`, `attendanceRate`

### 2.2 Tendência (trend)
Comparar “metade mais recente” vs “metade anterior” dentro da janela:
- `prevRate` → taxa na metade anterior
- `recentRate` → taxa na metade recente
- `delta` → diferença
- `label` → `improving|stable|worsening|insufficient`

> Tendência não é rótulo; é sinal para **cuidado ativo**.

### 2.3 Segmentos (heurística sem moralismo)
- `stable`: constância boa
- `watch`: sinais leves
- `risk`: sinais moderados/altos
- `insufficient`: pouco histórico

> Segmento **não** determina bloqueio de acesso. Serve para orientar follow-up.

---

## 3) “Atenção clínica” (priorização)
Priorizar:
1) `absentStreak` alto
2) última sessão `absent`
3) taxa baixa
4) mais faltas
5) recência (`lastIsoDate`)

---

## 4) Segurança dos follow-ups
Bloquear envio automático quando:
- `unlinked_patient`
- `ambiguous_phone`
- `phone_mismatch`

---

## 5) Copy clínico (tom)
- Evitar moralismo.
- Linguagem de vínculo: “seu horário é um espaço de cuidado”; “a mudança acontece na continuidade”.
- Mensagens curtas; detalhes em “Por que isso importa?” (colapsável no mobile).
