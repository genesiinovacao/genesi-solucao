# SOLUÇÃO 2026 — Sistema de Varejo (SaaS Multi-tenant)

Plataforma de gestão de varejo com arquitetura híbrida:

- **Backend:** .NET Web API (JWT + refresh tokens, RLS por tenant)
- **Banco:** PostgreSQL 16 com **Row Level Security (RLS)** para isolamento por tenant
- **Dashboard:** React + Vite + Tailwind + Tremor
- **PDV:** Electron + React + SQLite (offline-first), sincroniza com o backend via `OfflineSyncId` idempotente

> **Status (08/08/2026):** em produção com piloto. Backend, dashboard e PDV
> rodam ponta a ponta, com assinatura/cobrança, LGPD, redes de lojas,
> operador com PIN, impressão térmica e orçamento no balcão.
> Aguardam integração real: NFC-e (provider simulado) e PIX
> (`Billing:Provider=mercadopago` pendente de token).

> 🗺️ **Novo no projeto? Comece por [docs/ARQUITETURA.md](docs/ARQUITETURA.md)** —
> diagramas dos fluxos (isolamento entre lojas, venda offline, orçamento,
> devolução, deploy).

---

## 📁 Estrutura

```
solucao-2026/
├── docker-compose.yml          # Postgres 16 + pgAdmin
├── backend/                    # API .NET 9
│   ├── Program.cs              # JWT Bearer, CORS, Swagger, pipeline auth → tenant
│   ├── Controllers/            # 21 controllers (Auth, Products, Sales, Sync,
│   │                           #   Cash, Quotes, Returns, Billing, Admin, ...)
│   ├── Middleware/             # TenantMiddleware + SubscriptionGate
│   ├── Data/                   # AppDbContext + TenantConnectionInterceptor (RLS)
│   ├── Models/                 # Entities + DTOs por módulo
│   └── Services/               # Jwt, Audit, OperatorAuth, StockAlert,
│                               #   Billing/ (PIX plugável), Fiscal/ (NFC-e)
├── dashboard/                  # React admin (web) — 15 páginas conectadas à API
│   └── src/{pages,components,lib}
├── pdv/                        # Electron PDV (desktop, offline-first)
│   ├── electron/               # main, preload, db (SQLite), sync, print, updater
│   └── src/{pages,components,lib}
├── database/                   # 01…19 — aplicados À MÃO, em ordem (ver DEPLOY.md)
├── backend.Tests/              # 139 testes xUnit — rodam sem Postgres
├── tools/{HashGen,SqlRun}/     # Hash BCrypt · executor de .sql sem psql
└── docs/                       # ARQUITETURA · DEPLOY · LGPD · MANUAL_TECNICO
```

---

## 🚀 Subindo o ambiente local

### Pré-requisitos
- Docker Desktop
- .NET SDK 8+
- Node.js 20+

### 1. Subir o banco

```powershell
cd "C:\Users\Jailson S\Documents\Genesi\Sistema de Varejo teste\solucao-2026"
docker compose up -d
```

Isso vai subir:
- **Postgres** em `localhost:5432` (db `solucao`, admin `solucao_admin` / `solucao_dev_admin_pwd`)
- **pgAdmin** em `http://localhost:5050` (login `admin@solucao.com` / `admin`)

Na primeira subida o Postgres executa **todos** os scripts de `database/` em ordem.

> ⚠️ Os scripts do Docker só rodam na **primeira** subida (volume vazio). Num
> banco já criado, cada migração nova precisa ser aplicada à mão:
> ```powershell
> docker exec -i solucao-postgres psql -U solucao_admin -d solucao < database/19_quote_no_expiry.sql
> ```

> Se precisar reaplicar o schema do zero: `docker compose down -v && docker compose up -d`
> (o `-v` apaga o volume `solucao_pgdata`; ⚠️ destrutivo)

### 2. Backend

```powershell
cd backend
dotnet run
```

- API HTTP em `http://localhost:5160`
- Swagger em `http://localhost:5160/swagger`
- Health check em `http://localhost:5160/health`

### 3. Dashboard

```powershell
cd dashboard
npm install
npm run dev
```

Abre em `http://localhost:5173`.

### 4. PDV Electron

```powershell
cd pdv
npm install     # roda electron-rebuild do better-sqlite3 no postinstall
npm run dev     # abre a janela nativa (Vite em 5174)
```

SQLite local em `%APPDATA%\solucao-pdv\data.db` — apagar o arquivo zera o cache;
o bootstrap rebaixa tudo do backend no próximo login.

### Testes do backend

```powershell
cd backend.Tests
dotnet test
```

139 testes cobrindo JWT (emissão/claims/refresh), sincronização do PDV
(idempotência, baixa de estoque, estoque negativo, vale crédito, acréscimo),
módulo fiscal, ciclo de cobrança, LGPD (anonimização e exportação),
autorização de supervisor (sangria e devolução), PIN de operador, redes de
lojas e orçamentos. Rodam em memória — não precisam de Postgres.

### Validar o RLS

Conecte como o role da aplicação (não como `solucao_admin` — esse é superuser e ignora RLS):

```powershell
docker exec -it solucao-postgres psql -U solucao_app -d solucao
```

```sql
-- Sem contexto: deve devolver 0
SELECT count(*) FROM products;

-- Tenant 1 (Mercado do João): 10 produtos
SET app.current_tenant_id = '11111111-1111-1111-1111-111111111111';
SELECT count(*) FROM products;

-- Tentar inserir no tenant errado: deve falhar com
-- ERROR: new row violates row-level security policy
```

---

## 🏪 Cadastro de mercado (onboarding)

Não é preciso mexer no banco para criar um mercado novo:

- **Pela tela**: `http://localhost:5173/register` — cria o tenant + usuário admin e já entra logado.
- **Pela API**: `POST /api/auth/register` com `{ tenantName, cnpj, userName, email, password }`.

Regras: CNPJ com 14 dígitos e único; e-mail único **globalmente** (o login localiza
o tenant pelo e-mail). A criação roda na função `app_register_tenant`
(SECURITY DEFINER, `09_tenant_registration.sql`), pois não existe contexto de
tenant para o RLS antes de o tenant existir.

---

## 🚢 Deploy

**Em produção hoje:** Neon (Postgres, `sa-east-1`) + Render (backend **e**
dashboard) — passo a passo completo em [docs/DEPLOY.md](docs/DEPLOY.md).
O blueprint [`render.yaml`](../render.yaml) na raiz cria os dois serviços.

> O dashboard esteve no Netlify até ago/2026, quando os créditos da conta
> acabaram e os deploys passaram a ser pulados silenciosamente
> ("Skipped due to account credit usage exceeded"). Migrado para static site
> do Render. O `netlify.toml` foi mantido apenas como referência.

⚠️ **Ordem obrigatória do deploy:** se o commit traz migração, rode o SQL no
Neon **antes** do push. O EF mapeia a coluna nova assim que o código sobe; se
ela ainda não existe, toda consulta àquela tabela responde 500.

### VPS única (produção definitiva)

```bash
cp .env.example .env    # preencha os segredos (JWT_KEY, senhas, origem do dashboard)
docker compose -f docker-compose.prod.yml up -d --build
# após a PRIMEIRA subida, troque a senha do role da aplicação:
docker exec -it solucao-postgres psql -U solucao_admin -d solucao \
  -c "ALTER ROLE solucao_app PASSWORD '<POSTGRES_APP_PASSWORD do .env>'"
```

- O backend **exige** `ConnectionStrings__AppDb` e `Jwt__Key` via ambiente — não há
  segredo commitado; sem eles o processo não sobe.
- O Postgres não publica porta no host e o backend só escuta em `127.0.0.1:5160` —
  coloque um reverse proxy com HTTPS na frente (Caddy: `reverse_proxy localhost:5160`).
- O seed demo (`03_seed.sql`) fica de fora do compose de produção.
- Logs estruturados via Serilog no stdout (`docker logs solucao-backend`).
- O dashboard é estático: `npm run build` e hospede o `dist/` (Vercel/Netlify/Nginx)
  com `VITE_API_URL` apontando para a API.

---

## 🔐 Como o multi-tenant funciona

1. Cliente loga → backend devolve JWT contendo a claim `tenant_id`.
2. Toda request seguinte traz `Authorization: Bearer <jwt>`.
3. O `TenantMiddleware` lê as claims e popula o `ITenantContext` (scoped).
4. O `TenantConnectionInterceptor` executa, dentro da mesma transação:
   ```sql
   SET LOCAL app.current_tenant_id = '<uuid>';
   ```
5. As policies de RLS (`tenant_isolation`) filtram automaticamente todo `SELECT/INSERT/UPDATE/DELETE`.
6. Mesmo um SQL injection bem-sucedido não pode vazar dados de outro tenant — o filtro é no banco, não na aplicação.

**Por que `SET LOCAL` e não `SET`:** `SET LOCAL` morre no fim da transação, garantindo que conexões reaproveitadas pelo pool não vazem contexto entre requests.

**Por que o role `solucao_app` não pode ser superuser nem `BYPASSRLS`:** caso contrário, as policies seriam ignoradas e o isolamento quebra. Esse é o erro de configuração mais comum em sistemas multi-tenant com RLS.

---

## 🔄 Sincronização offline do PDV

- Vendas são gravadas no SQLite local (`local_sales`, coluna `synced`).
- `electron/sync.cjs` drena as pendentes para `POST /api/sync/sales` com JWT.
- O `SyncController` é idempotente por `OfflineSyncId` (UUID gerado no PDV) — reenvios não duplicam vendas.
- O catálogo é rebaixado a cada 5 min (e no botão 🔄 / F5), **depois** de
  drenar as vendas pendentes — senão o snapshot sobrescreveria o estoque
  local com um número que ainda não desconta o que foi vendido ali.

Diagrama do fluxo completo em [docs/ARQUITETURA.md §3](docs/ARQUITETURA.md).

---

## ⌨️ PDV sem mouse

Caixa de supermercado opera no teclado. **F1** abre a lista completa dentro
do PDV; o resumo:

| Tecla | Ação | Tecla | Ação |
|---|---|---|---|
| `F2` | Busca / leitor | `F8` | Acréscimo (R$) |
| `F3` | Cliente | `F9` `F9` | Cancelar a venda |
| `F4` | Desconto (%) | `F10` | Pagamento |
| `F5` | Atualizar catálogo | `F11` | Orçamento |
| `F6` | Sangria / Suprimento | `F12` | Fechar o caixa |
| `F7` | Devolução | `Esc` | Fecha o que está aberto |

`↑ ↓` escolhe o item do carrinho; `+` `−` mudam a quantidade e `Delete`
remove — **só com a busca vazia**, para não roubar as teclas de quem digita.
`12*código` lança 12 unidades de uma vez.

> O app empacotado roda **sem menu do Electron** (`Menu.setApplicationMenu(null)`):
> os aceleradores do menu (F11 tela cheia, F12, Ctrl+R) roubavam teclas do
> caixa. Em desenvolvimento o menu continua.

---

## 🗺️ Roadmap

| Fase | Entrega | Status |
|------|---------|--------|
| **0** | Fundações: docker-compose, schema completo, RLS, role app | ✅ Pronto |
| **1** | Backend MVP: Models, AppDbContext, JWT, CRUD básico, SyncController | ✅ Pronto |
| **2** | Dashboard web: login + Estoque + Clientes + Dashboard + demais módulos | ✅ Pronto |
| **3** | PDV Electron real: SQLite + sincronização + impressão + leitor de barras | ✅ Pronto |
| **3.5** | Operação de loja: assinatura/PIX, LGPD, redes de lojas, operador com PIN, promoções aplicadas, térmica 58/80mm, formas de pagamento, atalhos, orçamento | ✅ Pronto |
| **4** | Integrações reais: NFC-e homologada, PIX Mercado Pago, WhatsApp, LLM | ⏳ Em andamento |
| **5** | Deploy + observabilidade: HTTPS, logs, métricas, CI/CD | ⏳ |

### Pendências conhecidas

| Item | Onde trava |
|---|---|
| Preços reais dos planos | `Billing:Plans` no appsettings — valores ainda são placeholder |
| PIX real | Falta conta + `Billing__MercadoPago__AccessToken`; hoje `simulated` confirma sozinho em ~20s |
| NFC-e real | `Fiscal:Provider` = simulado; falta certificado e homologação |
| Documentos jurídicos LGPD | Política de privacidade, DPA, DPO — ver [docs/LGPD.md §6](docs/LGPD.md) |
| Orçamento exige servidor | Precisa do número sequencial; é a única função do PDV que não é offline-first |
| Cold start do Render | ~50s no free tier após 15 min ocioso |

---

## 📝 Credenciais demo

Após o seed, ambos os tenants têm usuários com senha `123456`:

| Tenant | E-mail | Role |
|--------|--------|------|
| Mercado do João | `admin@mercadojoao.com` | admin |
| Mercado do João | `caixa@mercadojoao.com` | cashier |
| Padaria da Ana | `admin@padariaana.com` | admin |

UUIDs fixos (úteis em queries diretas):
- Tenant 1: `11111111-1111-1111-1111-111111111111`
- Tenant 2: `22222222-2222-2222-2222-222222222222`

---

## 📜 Licença / propriedade

Projeto interno — © 2026 SOLUÇÃO.
