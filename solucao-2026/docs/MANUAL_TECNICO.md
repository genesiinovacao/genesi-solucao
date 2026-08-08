# Manual técnico — SOLUÇÃO 2026

> Guia de manutenção e evolução. Última revisão: **08/08/2026**.
> Para entender os fluxos com diagramas, comece por [ARQUITETURA.md](ARQUITETURA.md).

## 1. Visão geral

| Camada | Stack | Onde roda |
|---|---|---|
| Backend | .NET 9 Web API · 21 controllers | Render (Docker) |
| Dashboard | React + Vite + Tailwind + Tremor · 15 páginas | Render static site |
| PDV | Electron + React + SQLite (offline-first) | Máquina da loja |
| Banco | PostgreSQL 16 com Row Level Security | Neon (`sa-east-1`) |

## 2. Banco de dados e RLS

O isolamento entre lojas é garantido pelo **RLS do PostgreSQL**, não por
`WHERE tenant_id` na aplicação. Cada request abre transação, o
`TenantConnectionInterceptor` executa `SET LOCAL app.current_tenant_id`, e as
policies `tenant_isolation` filtram tudo.

**Três regras invioláveis** (detalhe em [ARQUITETURA.md §2](ARQUITETURA.md)):

1. `SET LOCAL`, nunca `SET` — senão o pool vaza contexto entre requests.
2. `solucao_app` não pode ser superuser nem ter `BYPASSRLS`.
3. No Neon, usar o host **direto**, nunca o `-pooler`.

### Armadilha: `SET` + `INSERT` fora da transação

O RLS só enxerga o `SET` dentro da **mesma transação**. Ao rodar SQL bruto,
envolva em `BeginTransactionAsync` ou use função `SECURITY DEFINER` — senão o
pool pode entregar conexão diferente entre o SET e o INSERT, e a policy
rejeita a linha.

### Armadilha: `timestamptz` e Npgsql

Ao passar `DateTime` para coluna `timestamptz` via SQL bruto, marque o Kind:
`DateTime.SpecifyKind(dt, DateTimeKind.Utc)`. Sem isso, `ArgumentException`.

### Migrações

Não há migração automática no startup. Os arquivos `database/NN_*.sql` são
aplicados **à mão**, em ordem, e **antes** do push do código que os usa.
Ver [DEPLOY.md §0](DEPLOY.md).

## 3. Sincronização offline (PDV)

- Venda gravada em `local_sales` com `synced = 0`; estoque local baixado na hora.
- `electron/sync.cjs` drena as pendentes para `POST /api/sync/sales` com JWT,
  a cada 30s e no evento de voltar online. Retry com backoff; 401/403 não
  são reenviados.
- **Idempotência por `OfflineSyncId`** (UUID do PDV). Reenviar o lote inteiro
  é seguro.
- O snapshot do catálogo só é aplicado **depois** de drenar as pendentes —
  senão sobrescreveria o estoque local com um número que ainda não desconta
  o que foi vendido naquele caixa.
- Toda coluna nova no SQLite precisa entrar em `migrate()` no `db.cjs`:
  `CREATE TABLE IF NOT EXISTS` não altera banco já criado, e o banco do
  operador sobrevive à atualização do app.

## 4. Autorização de operações sensíveis

`IOperatorAuthService.FindSupervisorAsync(code, pin)` valida código + PIN e
exige papel `admin` ou `manager`. Usado por:

| Operação | Controller | Resposta quando falta aval |
|---|---|---|
| Sangria | `CashSessionsController.AddMovement` | `403 { requiresSupervisor: true }` |
| Devolução | `ReturnsController.Create` | `403 { requiresSupervisor: true }` |
| Desconto acima da alçada | `AuthController.Authorize` | idem, via `OperatorModal` |

O front reage ao `requiresSupervisor` mostrando os campos de código e PIN e
reenviando a mesma requisição. Quem autorizou fica no motivo do lançamento e
no `audit_log`.

## 5. Impressão térmica

`pdv/electron/print.cjs` monta HTML e imprime por `webContents.print()` numa
janela oculta.

- `buildReceiptHtml` — cupom de venda; `buildQuoteHtml` — orçamento.
- `resolvePaperWidth(deviceName, configured)` — o **nome da impressora manda**
  sobre a opção da tela: um cupom de 80mm em bobina de 58mm perde os valores
  do lado direito.
- Layout de duas linhas por item: nome longo quebra dentro da própria linha
  em vez de alargar a página.
- Preto puro, sem antialias — térmica não tem meio-tom.
- Não fixar largura em `html, body`: isso impede a renderização na impressão
  (regressão já cometida e revertida na v1.9.1).
- O último HTML gerado fica em `%TEMP%\solucao-ultimo-cupom-*.html` para
  comparar teste × venda real quando alguma impressora der trabalho.

> Nem todo problema de impressão é software. Já houve um caso de bobina
> montada ao contrário — o autoteste da própria impressora sai em branco
> quando isso acontece. Vale conferir o hardware antes de mexer no código.

## 6. Módulos plugáveis

| Módulo | Interface | Implementações |
|---|---|---|
| PIX da assinatura | `IPixProvider` | `SimulatedPixProvider` (confirma em ~20s), `MercadoPagoPixProvider` |
| Fiscal NFC-e | `IFiscalProvider` | `SimulatedFiscalProvider` |

Trocar por configuração: `Billing:Provider` e `Fiscal:Provider`.

## 7. Testes

```powershell
cd backend.Tests; dotnet test
```

139 testes xUnit sobre provider InMemory — rodam sem Postgres. Transações
viram no-op (`TransactionIgnoredWarning` suprimido); o RLS real é coberto
pelos scripts em `database/`.

Consequência a lembrar: `[Authorize(Roles=...)]` **não é aplicado** em teste
unitário de controller. Onde a regra de papel importa, ela é repetida
explicitamente no corpo do método (ex.: `Anonymize`).

## 8. Comandos úteis

```powershell
# Backend
cd backend; dotnet run                    # http://localhost:5160 (+ /swagger)

# Dashboard
cd dashboard; npm run dev                 # http://localhost:5173

# PDV
cd pdv; npm run dev                       # janela nativa (Vite em 5174)
cd pdv; npm run rebuild                   # better-sqlite3 para a versão do Electron

# SQL no Neon sem psql
dotnet run --project tools/SqlRun -- "<conn>" database/20_algo.sql
```

## 9. Segurança

- TLS em todas as pontas.
- O `TenantId` nunca aparece em URL nem header — só na claim assinada do JWT.
- Senhas e PINs com BCrypt.
- Segredos só por variável de ambiente (`ConnectionStrings__AppDb`, `Jwt__Key`);
  sem eles o backend não sobe.
- Conformidade LGPD: [LGPD.md](LGPD.md).
