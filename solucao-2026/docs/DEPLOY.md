# Deploy gratuito — Neon + Render + Netlify

Caminho de custo zero para o piloto, com migração fácil para VPS única depois.

| Peça | Serviço | Observação |
|------|---------|-----------|
| Postgres | [Neon](https://neon.tech) | free tier; suspende ocioso mas **acorda sozinho** |
| Backend .NET | [Render](https://render.com) | free tier; dorme após 15 min (o PDV offline-first tolera) |
| Dashboard | [Netlify](https://netlify.com) | build estático do Vite |
| PDV Electron | máquina do mercado | só muda a `VITE_API_URL` |

---

## 1. Banco no Neon

1. Crie conta em neon.tech → **New Project** (região `aws-sa-east-1`, São Paulo).
2. No painel do projeto, crie um **database chamado `solucao`**
   (o `02_roles.sql` faz `GRANT CONNECT ON DATABASE solucao` — o nome importa).
3. Copie a **connection string DIRETA** do owner (⚠️ não a "Pooled connection":
   o pooler em modo transação quebra o `SET app.current_tenant_id` do RLS).
4. Aplique os scripts, **na ordem, pulando o 03 (seed demo)**:

   ```powershell
   cd "C:\...\solucao-2026\database"
   $NEON = "postgresql://<owner>:<senha>@<host>.neon.tech/solucao?sslmode=require"
   psql $NEON -f 01_schema.sql
   psql $NEON -f 02_roles.sql
   psql $NEON -f 04_functions.sql
   psql $NEON -f 05_tenant_columns.sql
   psql $NEON -f 06_cash_session_link.sql
   psql $NEON -f 07_sale_returns.sql
   psql $NEON -f 08_fiscal_documents.sql
   psql $NEON -f 09_tenant_registration.sql
   ```

   > Sem `psql` local? Use o **SQL Editor** do próprio Neon e cole o conteúdo
   > de cada arquivo, um por vez, na mesma ordem.

5. Troque a senha de dev do role da aplicação:

   ```sql
   ALTER ROLE solucao_app PASSWORD '<senha-forte-que-você-gerar>';
   ```

6. Monte a connection string do backend (usuário `solucao_app`, não o owner):

   ```
   Host=<host>.neon.tech;Port=5432;Database=solucao;Username=solucao_app;Password=<senha>;SSL Mode=Require;Pooling=true;Maximum Pool Size=10
   ```

## 2. Backend no Render

1. Suba o repositório para o GitHub (já está em `genesiinovacao/genesi-solucao`).
2. dashboard.render.com → **New → Blueprint** → conecte o repositório.
   O Render lê o [`render.yaml`](../../render.yaml) da raiz e cria o serviço.
3. No painel do serviço, preencha as variáveis marcadas como segredo:
   - `ConnectionStrings__AppDb` → a string do passo 1.6
   - `Cors__AllowedOrigins__0` → a URL do Netlify (dá para voltar aqui depois do passo 3)
   - `Jwt__Key` → o Render já gerou sozinho (`generateValue`)
4. Deploy. Teste: `https://solucao-backend.onrender.com/health` deve responder
   `{"status":"ok"}` (a primeira chamada pode demorar ~1 min: é o cold start do free tier).

## 3. Dashboard no Netlify

1. app.netlify.com → **Add new site → Import an existing project** → GitHub.
   O [`netlify.toml`](../../netlify.toml) da raiz já configura base/build/publish e o redirect de SPA.
2. Em **Site configuration → Environment variables**, adicione:
   - `VITE_API_URL` = `https://solucao-backend.onrender.com`
3. Deploy. Anote a URL final (ex.: `https://solucao2026.netlify.app`) e
   **volte ao Render** para colocá-la em `Cors__AllowedOrigins__0`.
4. Acesse `/register` e cadastre o primeiro mercado real.

## 4. PDV no mercado

Na máquina do PDV, antes de rodar/empacotar, crie `pdv/.env`:

```
VITE_API_URL=https://solucao-backend.onrender.com
```

O CORS do PDV (`app://.`) já está liberado no `render.yaml`.

---

## Limitações do free tier (aceitáveis no piloto)

- **Render dorme** após 15 min sem tráfego; acorda em ~30–60s. O dashboard sente
  no primeiro acesso; o PDV não — as vendas ficam no SQLite e o retry sincroniza.
- **Neon suspende** o compute ocioso; a primeira query acorda em ~1s.
- Sem domínio próprio (URLs `.onrender.com` / `.netlify.app`) — dá para plugar
  domínio depois sem redeployar.

## Migração futura para VPS única

1. `pg_dump` no Neon → `pg_restore` no Postgres da VPS.
2. Na VPS: `cp .env.example .env` (preencher) e
   `docker compose -f docker-compose.prod.yml up -d --build`.
3. Trocar `VITE_API_URL` no Netlify (ou mover o estático para a VPS) e o
   `pdv/.env` dos mercados.

Nada no código muda — segredos já vêm de variáveis de ambiente.
