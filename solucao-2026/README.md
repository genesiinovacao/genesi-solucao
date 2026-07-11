# SOLUÇÃO 2026 — Sistema de Varejo (SaaS Multi-tenant)

Plataforma de gestão de varejo com arquitetura híbrida:

- **Backend:** .NET Web API (JWT + refresh tokens, RLS por tenant)
- **Banco:** PostgreSQL 16 com **Row Level Security (RLS)** para isolamento por tenant
- **Dashboard:** React + Vite + Tailwind + Tremor
- **PDV:** Electron + React + SQLite (offline-first), sincroniza com o backend via `OfflineSyncId` idempotente

> **Status:** Fases 1–3 entregues — backend, dashboard e PDV rodam ponta a ponta.
> Fase 5 em andamento: cadastro self-service de mercado, segredos via ambiente,
> Dockerfile + compose de produção. Fase 4 (integrações reais) aguarda piloto.

---

## 📁 Estrutura

```
solucao-2026/
├── docker-compose.yml          # Postgres 16 + pgAdmin
├── backend/                    # API .NET
│   ├── Program.cs              # JWT Bearer, CORS, Swagger, pipeline auth → tenant
│   ├── Controllers/            # 16 controllers (Auth, Products, Sales, Sync, Cash, ...)
│   ├── Middleware/             # TenantMiddleware (claims JWT → ITenantContext)
│   ├── Data/                   # AppDbContext + TenantConnectionInterceptor (RLS)
│   ├── Models/                 # Entities + DTOs por módulo
│   └── Services/               # JwtService, TenantContext
├── dashboard/                  # React admin (web) — 13 páginas conectadas à API
│   └── src/{pages,components,lib}
├── pdv/                        # Electron PDV (desktop, offline-first)
│   ├── electron/               # main, preload, db (SQLite), sync, print
│   └── src/{pages,components,lib}
├── database/
│   ├── 01_schema.sql           # DDL: tabelas, índices, triggers, RLS
│   ├── 02_roles.sql            # Role `solucao_app` (sem BYPASSRLS)
│   ├── 03_seed.sql             # 2 tenants demo para validar isolamento
│   ├── 04_functions.sql        # Funções auxiliares
│   ├── 05_tenant_columns.sql   # Migração incremental
│   ├── 06_cash_session_link.sql
│   └── 07_sale_returns.sql
├── backend.Tests/              # Testes xUnit (JWT, sync, fiscal)
├── tools/HashGen/              # Gerador de hash de senha (BCrypt)
└── docs/MANUAL_TECNICO.md
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

Na primeira subida o Postgres executa os scripts `database/01…07` em ordem.

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

Cobrem JWT (emissão/claims/refresh), sincronização do PDV (idempotência,
baixa de estoque, estoque negativo) e o módulo fiscal (numeração, chave de
acesso, cancelamento). Rodam em memória — não precisam de Postgres.

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

## 🚢 Deploy em produção

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

---

## 🗺️ Roadmap

| Fase | Entrega | Status |
|------|---------|--------|
| **0** | Fundações: docker-compose, schema completo, RLS, role app | ✅ Pronto |
| **1** | Backend MVP: Models, AppDbContext, JWT, CRUD básico, SyncController funcional | ✅ Pronto |
| **2** | Dashboard web: login + Estoque + Clientes + Dashboard + demais módulos | ✅ Pronto |
| **3** | PDV Electron real: SQLite + sincronização + impressão + leitor de barras | ✅ Pronto |
| **4** | Integrações reais: NFC-e, Pix dinâmico, WhatsApp, LLM | ⏳ Em andamento |
| **5** | Deploy + observabilidade: HTTPS, logs, métricas, CI/CD | ⏳ |

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
