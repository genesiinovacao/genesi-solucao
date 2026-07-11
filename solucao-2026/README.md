# SOLUÇÃO 2026 — Sistema de Varejo (SaaS Multi-tenant)

Plataforma de gestão de varejo com arquitetura híbrida:

- **Backend:** .NET 8 Web API
- **Banco:** PostgreSQL 16 com **Row Level Security (RLS)** para isolamento por tenant
- **Dashboard:** React + Vite + Tailwind + Tremor
- **PDV:** Electron + React + SQLite (offline-first), sincroniza com o backend via `OfflineSyncId` idempotente

> **Status:** Fase 0 — fundações. Banco, schema multi-tenant e infra Docker prontos. Backend e frontends ainda não rodam ponta a ponta.

---

## 📁 Estrutura

```
solucao-2026/
├── docker-compose.yml          # Postgres 16 + pgAdmin
├── backend/                    # API .NET 8
│   ├── Solucao.Backend.csproj
│   ├── Program.cs
│   ├── appsettings.json
│   ├── appsettings.Development.json
│   ├── Controllers/
│   ├── Middleware/
│   └── Properties/launchSettings.json
├── dashboard/                  # React admin (web)
│   ├── package.json
│   └── src/{pages,styles}
├── pdv/                        # Electron PDV (desktop)
│   └── src/{pages,services}
├── database/
│   ├── 01_schema.sql           # DDL: tabelas, índices, triggers, RLS
│   ├── 02_roles.sql            # Role `solucao_app` (sem BYPASSRLS)
│   ├── 03_seed.sql             # 2 tenants demo para validar isolamento
│   └── schema.sql              # ⚠️ legado da v0; pode ser removido
└── docs/MANUAL_TECNICO.md
```

---

## 🚀 Subindo o ambiente local

### Pré-requisitos
- Docker Desktop
- .NET 8 SDK
- Node.js 20+

### 1. Subir o banco

```powershell
cd "C:\Users\Jailson S\Documents\Genesi\Sistema de Varejo teste\solucao-2026"
docker compose up -d
```

Isso vai subir:
- **Postgres** em `localhost:5432` (db `solucao`, admin `solucao_admin` / `solucao_dev_admin_pwd`)
- **pgAdmin** em `http://localhost:5050` (login `admin@solucao.com` / `admin`)

Na primeira subida o Postgres executa em ordem:
1. `01_schema.sql` — cria todas as tabelas + RLS
2. `02_roles.sql` — cria o role `solucao_app` que o backend usa
3. `03_seed.sql` — popula 2 tenants demo

> Se precisar reaplicar o schema do zero: `docker compose down -v && docker compose up -d`
> (o `-v` apaga o volume `solucao_pgdata`; ⚠️ destrutivo)

### 2. Validar o RLS (o teste mais importante desta fase)

Conecte como o role da aplicação (não como `solucao_admin` — esse é superuser e ignora RLS):

```powershell
docker exec -it solucao-postgres psql -U solucao_app -d solucao
```

Dentro do `psql`:

```sql
-- Sem contexto: deve devolver 0
SELECT count(*) FROM products;

-- Tenant 1 (Mercado do João): 10 produtos
SET app.current_tenant_id = '11111111-1111-1111-1111-111111111111';
SELECT count(*) FROM products;
SELECT name, stock_quantity FROM products LIMIT 3;

-- Tenant 2 (Padaria da Ana): 3 produtos
SET app.current_tenant_id = '22222222-2222-2222-2222-222222222222';
SELECT count(*) FROM products;

-- Tentar inserir no tenant errado: deve falhar
SET app.current_tenant_id = '22222222-2222-2222-2222-222222222222';
INSERT INTO products (tenant_id, name, cost_price, sale_price)
VALUES ('11111111-1111-1111-1111-111111111111', 'Hack', 1, 1);
-- ERROR:  new row violates row-level security policy for table "products"
```

Se todos os passos acima funcionaram, **o isolamento está garantido**.

### 3. Backend (próxima fase)

```powershell
cd backend
dotnet restore
dotnet run
```

> Hoje ainda não compila — faltam `Models/`, `Data/AppDbContext`, `AuthController`, etc.
> Esses arquivos virão na Fase 1.

Swagger ficará em `https://localhost:7160/swagger`.

### 4. Dashboard (próxima fase)

```powershell
cd dashboard
npm install
npm run dev
```

Abre em `http://localhost:5173`.

### 5. PDV (Fase 3)

Ainda não está empacotado como Electron — só tem páginas React isoladas. Cobrirei isso na Fase 3.

---

## 🔐 Como o multi-tenant funciona

1. Cliente loga → backend devolve JWT contendo a claim `tenant_id`.
2. Toda request seguinte traz `Authorization: Bearer <jwt>`.
3. O `TenantMiddleware` (ou o interceptor do `AppDbContext`) lê o claim e executa, **dentro da mesma transação**:
   ```sql
   SET LOCAL app.current_tenant_id = '<uuid>';
   ```
4. As policies de RLS (`tenant_isolation`) filtram automaticamente todo `SELECT/INSERT/UPDATE/DELETE`.
5. Mesmo um SQL injection bem-sucedido não pode vazar dados de outro tenant — o filtro é no banco, não na aplicação.

**Por que `SET LOCAL` e não `SET`:** `SET LOCAL` morre no fim da transação, garantindo que conexões reaproveitadas pelo pool não vazem contexto entre requests.

**Por que o role `solucao_app` não pode ser superuser nem `BYPASSRLS`:** caso contrário, as policies seriam ignoradas e o isolamento quebra. Esse é o erro de configuração mais comum em sistemas multi-tenant com RLS.

---

## 🗺️ Roadmap

| Fase | Entrega | Status |
|------|---------|--------|
| **0** | Fundações: docker-compose, schema completo, RLS, role app | ✅ Pronto |
| **1** | Backend MVP: Models, AppDbContext, JWT, CRUD básico, SyncController funcional | ⏳ Próxima |
| **2** | Dashboard web: login + Estoque + Clientes + Dashboard + demais módulos | ⏳ |
| **3** | PDV Electron real: SQLite + sincronização + impressão + leitor de barras | ⏳ |
| **4** | Integrações reais: NFC-e, Pix dinâmico, WhatsApp, LLM | ⏳ |
| **5** | Deploy + observabilidade: HTTPS, logs, métricas, CI/CD | ⏳ |

---

## 📝 Credenciais demo

Após o seed, ambos os tenants têm usuários com senha `123456`:

| Tenant | E-mail | Role |
|--------|--------|------|
| Mercado do João | `admin@mercadojoao.com` | admin |
| Mercado do João | `caixa@mercadojoao.com` | cashier |
| Padaria da Ana | `admin@padariaana.com` | admin |

---

## 📜 Licença / propriedade

Projeto interno — © 2026 SOLUÇÃO.
