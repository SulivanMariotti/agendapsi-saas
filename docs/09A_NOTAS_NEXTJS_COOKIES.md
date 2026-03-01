# 09A — Notas de Compatibilidade (Next.js)

## APIs dinâmicas como Promise (Next 15+)

Em algumas versões recentes do Next.js, APIs como `cookies()` e `headers()` podem ser retornadas como **Promise** e exigem `await`.

### Sintoma
Erro em runtime parecido com:

- `cookies(...).get is not a function`

### Correção
Usar:

- `const cookieStore = await cookies();`
- `cookieStore.get(...)`

> Observação: `await` é seguro mesmo quando a API retorna um valor síncrono.
