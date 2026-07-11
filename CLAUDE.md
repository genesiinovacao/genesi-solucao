# SOLUÇÃO — Sistema de Varejo

> Contexto do projeto para continuidade entre sessões do Claude Code.
> Consolidado a partir das notas de memória (`project-solucao-varejo`, `runbook-solucao-local`).
> **As descrições abaixo são um retrato de ~mai/2026 — verifique contra o código atual antes de afirmar como fato.**

**Localização:** `C:\Users\Jailson S\Documents\Genesi\Sistema de Varejo teste` (repositório git)

---

## Duas arquiteturas convivem no mesmo repositório

### 1. v1.0 — estática (raiz do projeto)
Aplicação HTML5 + CSS3 + JS Vanilla + Chart.js (CDN), **sem servidor**, persistência via `localStorage` (prefixo `solucao_*`).

- **Páginas:** `index.html` (login), `dashboard.html`, `pdv.html`, `estoque.html`, `clientes.html`, `fornecedores.html`, `financeiro.html`, `promocoes.html`, `delivery.html`, `relatorios.html`, `configuracoes.html`, `ia.html` (+ `manual.html`, `plano.html`).
- **Lógica:** `js/*.js` — um arquivo por módulo + `data.js` (SEED + DataService) + `app.js` (sidebar/toasts/modais).
- **CSS:** `css/main.css` (design tokens), `sidebar.css`, `components.css`.
- **Credenciais demo:** `admin@solucao.com` / `123456`.
- **Módulos prontos:** PDV (4 formas de pagamento + troco + cupom + leitor de código de barras com foco automático), estoque (CRUD + movimentações + alertas críticos + export CSV), fidelidade Bronze/Silver/Gold (1 pt a cada R$10), financeiro "Meu Lucro" (receitas/despesas/margem/ROI), promoções (produto/categoria/fidelidade), delivery Kanban 4 colunas (WhatsApp simulado), relatórios (4 gráficos + PDF simulado), IA local baseada em regras (sem LLM externo, lê o LocalStorage).
- **Integrações citadas mas SIMULADAS:** iFood Mercado, WhatsApp Business, Mix Fiscal (regime tributário/NFe/SAT), Scantech (leitor de barras).

### 2. solucao-2026/ — reescrita multi-tenant
Estrutura: `backend/` (.NET 8/9 Web API), `dashboard/` (React + Tailwind + Tremor), `pdv/` (Electron + React + SQLite offline-first), `database/schema.sql` (PostgreSQL com Row Level Security via `app.current_tenant_id`), `docker-compose.yml`, `tools/`, `docs/`, `README.md`.

- Sincronização idempotente via `OfflineSyncId` (UUID).
- Estágio (jul/2026): **Fases 1–3 prontas e rodando ponta a ponta** — backend completo (JWT+refresh, RLS, 16+ controllers), dashboard com 13 páginas na API real, PDV Electron offline-first com baixa de estoque no servidor. Também prontos: relatórios com margem/curva ABC, módulo fiscal NFC-e com provider plugável (simulado por padrão — `Fiscal:Provider` no appsettings), SignalR de alertas de estoque (`/hubs/stock`) e `backend.Tests/` (xUnit, roda sem Postgres).
- Migração `database/08_fiscal_documents.sql` precisa ser aplicada manualmente em banco já criado (scripts do Docker só rodam na primeira subida): `docker exec -i solucao-postgres psql -U solucao_admin -d solucao < database/08_fiscal_documents.sql`.

---

## Design system (v1.0)
Dark theme com variáveis CSS — roxo `#7c3aed` (primary), ciano `#06b6d4` (secondary), fundos `#0f1117` / `#1a1d2e` / `#1e2235`. Tipografia Outfit (Google Fonts). Glassmorphism no login com orbs animados.

---

## Runbook local — solucao-2026

Ordem obrigatória (cada peça depende da anterior):

```powershell
# 1. Docker
docker info      # se erro, abrir "Docker Desktop" e aguardar baleia verde
cd "C:\Users\Jailson S\Documents\Genesi\Sistema de Varejo teste\solucao-2026"
docker compose up -d      # esperar Postgres ficar (healthy)

# 2. Backend
cd backend; dotnet run

# 3. Dashboard (terminal separado)
cd dashboard; npm run dev     # http://localhost:5173

# 4. PDV Electron (terminal separado)
cd pdv; npm run dev           # abre janela nativa
```

### Portas
| Porta | Serviço |
|-------|---------|
| 5432 | Postgres |
| 5050 | pgAdmin (`admin@solucao.com` / `admin`) |
| 5160 | Backend .NET (HTTP) |
| 7160 | Backend .NET (HTTPS, desabilitado em Dev) |
| 5173 | Dashboard React (Vite) |
| 5174 | PDV Electron (Vite) |

### CORS
`backend/appsettings.json → Cors.AllowedOrigins` precisa listar todas as origens dos clientes (5173, 5174, 3000, `app://.`). Se der "Network Error" no front, adicionar a origem aqui.

---

## Gotchas conhecidos (Windows do usuário)

- **`ELECTRON_RUN_AS_NODE=1`** — vaza do `electron-rebuild` e faz o `electron.exe` agir como Node puro, quebrando o PDV com `Cannot read properties of undefined (reading 'isPackaged')`. Checar: `Get-ChildItem Env:ELECTRON*`. Remover via Painel → Variáveis de Ambiente (usuário + sistema). Workaround no shell: `Remove-Item Env:ELECTRON_RUN_AS_NODE`.
- **Processos zumbi `Solucao.Backend.exe`** — `Stop-Process -Force` dá "Acesso negado". Usar: `Get-WmiObject Win32_Process -Filter "Name='Solucao.Backend.exe'" | %{$_.Terminate()}`.
- **better-sqlite3 + Electron** — precisa rebuild para a versão do Electron. Automatizado via `postinstall: electron-rebuild -f -w better-sqlite3` no `pdv/package.json`.
- **`"type": "module"` no PDV quebra Electron** — configs Vite/Tailwind/PostCSS estão como `.mjs` para evitar `type:module`.
- **Npgsql + timestamptz** — ao passar `DateTime` para coluna `timestamptz` via raw SQL, marcar Kind=Utc: `DateTime.SpecifyKind(dt, DateTimeKind.Utc)`, senão joga `ArgumentException`.
- **`SET app.current_tenant_id` + INSERT** — RLS só enxerga o SET dentro da **mesma transação**. Envolver com `BeginTransactionAsync` ou usar função `SECURITY DEFINER`, senão o pool pode entregar conexão diferente entre SET e INSERT e a policy rejeita.

---

## Credenciais demo — solucao-2026 (senha `123456`)
- `admin@mercadojoao.com` → Tenant 1 (Mercado do João, 10 produtos, 5 clientes)
- `caixa@mercadojoao.com` → Tenant 1 (role cashier)
- `admin@padariaana.com` → Tenant 2 (Padaria da Ana, 3 produtos, 2 clientes)

UUIDs fixos (úteis em queries diretas):
- Tenant 1: `11111111-1111-1111-1111-111111111111`
- Tenant 2: `22222222-2222-2222-2222-222222222222`

**SQLite local do PDV:** `C:\Users\Jailson S\AppData\Roaming\solucao-pdv\data.db` — apagar zera o cache; o bootstrap rebaixa tudo do backend no próximo login.

---

## Como decidir onde aplicar uma mudança
Ao pedir "atualização", confirmar em qual trilha:
- **v1.0 estática** — mais rápido, atinge o usuário hoje.
- **solucao-2026** — mais robusto, ainda em construção.

Funcionalidades de **multi-usuário, multi-loja, NFe real ou sincronização entre dispositivos** pertencem obrigatoriamente à **solucao-2026**.
