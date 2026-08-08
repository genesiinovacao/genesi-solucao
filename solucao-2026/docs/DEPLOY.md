# Deploy gratuito — Neon + Render

> Última revisão: **08/08/2026**. Caminho de custo zero para o piloto, com
> migração fácil para VPS única depois.

| Peça | Serviço | Observação |
|------|---------|-----------|
| Postgres | [Neon](https://neon.tech) | free tier; suspende ocioso mas **acorda sozinho** |
| Backend .NET | [Render](https://render.com) | free tier; dorme após 15 min (o PDV offline-first tolera) |
| Dashboard | [Render static site](https://render.com) | build estático do Vite |
| PDV Electron | máquina do mercado | só muda a `VITE_API_URL` |

> **Netlify saiu em ago/2026.** Os créditos da conta acabaram e os deploys
> passaram a ser pulados em silêncio ("Skipped due to account credit usage
> exceeded") — o dashboard ficava numa versão velha sem nenhum erro visível.
> O `netlify.toml` permanece no repo apenas como referência.

---

## 0. A regra que não pode ser esquecida

**Migração no banco vem ANTES do push do código.**

Não há migração automática no startup. O EF mapeia a coluna nova assim que o
backend sobe; se ela ainda não existe no Neon, toda consulta àquela tabela
responde **500** — e o Render já terá trocado o build. A ordem é:

1. Abrir o SQL Editor do Neon e rodar o `database/NN_*.sql` novo.
2. Conferir que rodou (`Statement executed successfully`).
3. Só então `git push origin main`.

---

## 1. Banco no Neon

1. Crie conta em neon.tech → **New Project** (região `aws-sa-east-1`, São Paulo).
2. No painel do projeto, crie um **database chamado `solucao`**
   (o `02_roles.sql` faz `GRANT CONNECT ON DATABASE solucao` — o nome importa).
3. Copie a **connection string DIRETA** do owner (⚠️ não a "Pooled connection":
   o pooler em modo transação quebra o `SET app.current_tenant_id` do RLS).
4. Aplique **todos** os scripts de `database/`, na ordem numérica,
   **pulando o `03_seed.sql`** (seed demo — não vai para produção):

   ```
   01_schema  02_roles  04_functions  05_tenant_columns  06_cash_session_link
   07_sale_returns  08_fiscal_documents  09_tenant_registration
   10_platform_admin  11_subscription  12_billing  13_billing_cycle
   14_lgpd  15_tenant_groups  16_operator_pin
   17_discount_default  17_payment_methods           ← os dois, nesta ordem
   18_quotes  19_quote_no_expiry
   ```

   ```powershell
   cd "C:\...\solucao-2026\database"
   $NEON = "postgresql://<owner>:<senha>@<host>.neon.tech/solucao?sslmode=require"
   psql $NEON -f 01_schema.sql
   # ... e assim por diante, pulando o 03
   ```

   > **Sem `psql` na máquina?** Duas saídas:
   > - **SQL Editor do Neon** — cole o conteúdo de cada arquivo, um por vez.
   >   É o caminho usado no dia a dia deste projeto.
   > - `dotnet run --project tools/SqlRun -- "<conn>" arquivo.sql`

   > ⚠️ **Colisão de numeração:** existem `17_discount_default.sql` e
   > `17_payment_methods.sql`. Ambos já aplicados em produção; ficam como
   > estão para não quebrar o histórico. O próximo número livre é o **20**.

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
   - `Cors__AllowedOrigins__0` → a URL do dashboard (dá para voltar aqui depois do passo 3)
   - `Jwt__Key` → o Render já gerou sozinho (`generateValue`)
4. Deploy. Teste: `https://solucao-backend.onrender.com/health` deve responder
   `{"status":"ok"}` (a primeira chamada pode demorar ~1 min: é o cold start do free tier).

### Como saber se o deploy novo subiu

O `/health` responde igual nos dois builds. Para confirmar que o código novo
está no ar, chame um endpoint que **só existe** na versão nova — sem token,
`401` prova que a rota existe e `404` prova que não:

```bash
curl -o /dev/null -w "%{http_code}\n" https://solucao-backend.onrender.com/api/quotes
```

## 3. Dashboard no Render (static site)

1. dashboard.render.com → o [`render.yaml`](../../render.yaml) da raiz já
   declara o static site junto do backend; o Blueprint cria os dois.
2. Variável de ambiente do site:
   - `VITE_API_URL` = `https://solucao-backend.onrender.com`
3. Deploy. Anote a URL final e **volte ao serviço do backend** para colocá-la
   em `Cors__AllowedOrigins__0`.
4. Acesse `/register` e cadastre o primeiro mercado real.

> Se o front acusar "Network Error", quase sempre é CORS: a origem precisa
> estar em `Cors:AllowedOrigins`. As origens usadas são o dashboard, mais
> `app://.` (PDV empacotado) e `http://localhost:5173`/`5174` em dev.

## 4. PDV no mercado (instalador)

O PDV é distribuído como instalador Windows e **se atualiza sozinho** via
GitHub Releases (`electron-updater`).

### Lançar uma versão nova (caminho normal)

```powershell
# 1. bump da versão em pdv/package.json
# 2. commit + push
git push origin main
# 3. tag: é ela que dispara o workflow "Release do PDV"
git tag v1.14.0
git push origin v1.14.0
```

O workflow builda com `--publish never` e publica com `softprops/action-gh-release`
(o upload direto de 83 MB pelo electron-builder falhava). A release **precisa
dos 3 assets** — sem o `latest.yml` o `electron-updater` não enxerga a versão:

| Asset | Para quê |
|---|---|
| `SOLUCAO-PDV-Setup-X.Y.Z.exe` | instalador |
| `...exe.blockmap` | download diferencial |
| `latest.yml` | manifesto que o updater consulta |

### Gerar localmente (sem publicar)

```powershell
cd pdv
npm run dist
```

Sai em `pdv/release/SOLUCAO-PDV-Setup-<versão>.exe`. A URL da API embutida vem
de [`pdv/.env.production`](../pdv/.env.production) (hoje aponta para o Render);
mude lá e regenere se o backend trocar de endereço.

**Na máquina do cliente:** rodar o instalador (2 cliques, sem opções), abrir
"SOLUÇÃO PDV" e logar com o usuário do mercado. O primeiro login precisa de
internet (baixa o catálogo); depois o PDV opera offline e sincroniza sozinho.

Notas:
- O instalador não é assinado digitalmente — o Windows SmartScreen pode exibir
  "aplicativo não reconhecido"; clique em "Mais informações → Executar assim
  mesmo". Assinatura de código (certificado) é um passo futuro.
- Dados locais ficam em `%APPDATA%\solucao-pdv\data.db`.
- O CORS do PDV empacotado (`app://.`) já está liberado no `render.yaml`.

### Armadilhas conhecidas na máquina Windows

| Sintoma | Causa e saída |
|---|---|
| `Cannot read properties of undefined (reading 'isPackaged')` | A variável `ELECTRON_RUN_AS_NODE=1` vazou do `electron-rebuild` e faz o `electron.exe` agir como Node puro. Conferir com `Get-ChildItem Env:ELECTRON*` e remover nas variáveis de ambiente do usuário **e** do sistema. |
| Instalador diz "não é possível fechar o SOLUCAO PDV" | Outro processo segura o `.exe`. O Restart Manager do Windows aponta qual — já aconteceu de ser um jogo em segundo plano. |
| `better-sqlite3` reclama de versão | Precisa de rebuild para a versão do Electron. Automatizado no `postinstall`; manual: `npm run rebuild`. |
| Processo zumbi `Solucao.Backend.exe` | `Stop-Process -Force` dá "Acesso negado". Usar `Get-WmiObject Win32_Process -Filter "Name='Solucao.Backend.exe'" \| %{$_.Terminate()}`. |

---

## Superadmin (dono da plataforma)

Não existe signup público: clientes são cadastrados no painel `/admin`, visível
apenas para o papel `superadmin`. Para criar o seu superadmin:

```powershell
# 1. Gere o hash BCrypt da senha escolhida
dotnet run --project tools/HashGen -- "SuaSenhaForteAqui"

# 2. No SQL Editor do Neon (database solucao), rode com o hash copiado:
#    SELECT app_upsert_superadmin('Seu Nome', 'seu@email.com', '<hash>');
```

A função é idempotente — rodar de novo com outro hash troca a senha.
O superadmin loga no dashboard normal e vê o item "🛠️ Administração".

## Backup automático do banco

Três camadas de proteção:

1. **Neon point-in-time restore** (nativo): desfaz erros das últimas horas
   pelo painel do Neon (Branches → Restore).
2. **Dump diário via GitHub Actions** ([.github/workflows/db-backup.yml](../../.github/workflows/db-backup.yml)):
   roda às 03:00 (Brasília), guarda `solucao-AAAA-MM-DD.dump` como artifact
   privado do repositório com retenção de 30 dias.
   - Requer o secret **`NEON_DATABASE_URL`** (Settings → Secrets and variables
     → Actions) com a connection string **direta do owner** (`neondb_owner`) —
     é o único role com BYPASSRLS, necessário para o dump conter todos os tenants.
   - Para baixar: aba Actions → run do dia → Artifacts.
   - Para restaurar: `pg_restore --no-owner --clean --if-exists -d "<conn>" arquivo.dump`
3. **SQLite local do PDV**: continuidade operacional offline (não é backup do
   banco central — cobre só o catálogo e as vendas pendentes daquele caixa).

## Limitações do free tier (aceitáveis no piloto)

- **Render dorme** após 15 min sem tráfego; acorda em ~30–60s. O dashboard sente
  no primeiro acesso; o PDV não — as vendas ficam no SQLite e o retry sincroniza.
- **Neon suspende** o compute ocioso; a primeira query acorda em ~1s.
- Sem domínio próprio (URLs `.onrender.com`) — dá para plugar domínio depois
  sem redeployar.

## Migração futura para VPS única

1. `pg_dump` no Neon → `pg_restore` no Postgres da VPS.
2. Na VPS: `cp .env.example .env` (preencher) e
   `docker compose -f docker-compose.prod.yml up -d --build`.
3. Trocar `VITE_API_URL` no static site (ou mover o estático para a VPS) e o
   `pdv/.env.production` dos mercados.

Nada no código muda — segredos já vêm de variáveis de ambiente.

Além do custo, há um motivo de conformidade: o Render **não tem região no
Brasil**, então hoje existe transferência internacional de dados pessoais.
Ver [LGPD.md §5](LGPD.md).
