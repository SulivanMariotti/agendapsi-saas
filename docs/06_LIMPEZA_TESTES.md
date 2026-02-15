# Limpeza de dados de testes (Presença/Faltas)

O painel Admin → Presença/Faltas soma dados da coleção `attendance_logs`.
Se os números estão “sujos” por testes, apague a coleção com o script:

## Rodar
Na raiz do projeto:
```bash
node scripts/purgeAttendanceLogs.cjs --yes
```

## Outras coleções (opcional)
```bash
node scripts/purgeAttendanceLogs.cjs --collection=history --yes
node scripts/purgeAttendanceLogs.cjs --collection=audit_logs --yes
```

## Observação (Windows)
Se você ver erro de credencial no script, confira:
- `.env.local` na raiz do projeto com `FIREBASE_ADMIN_SERVICE_ACCOUNT_B64` (ou `FIREBASE_ADMIN_SERVICE_ACCOUNT`).
