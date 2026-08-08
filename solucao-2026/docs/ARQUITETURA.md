# Arquitetura e fluxos — SOLUÇÃO 2026

> Diagramas do sistema em funcionamento. Última revisão: **08/08/2026**.
> Os diagramas são Mermaid — o GitHub renderiza direto no navegador.
>
> Quem chega agora deve ler nesta ordem: **§1 (peças)** → **§2 (isolamento
> entre lojas)** → **§3 (venda)**. O resto é consulta.

---

## 1. Peças e como conversam

```mermaid
graph TB
    subgraph loja["🏪 Dentro da loja"]
        PDV["PDV Electron<br/>React + SQLite local<br/><i>opera sem internet</i>"]
        IMP["Impressora térmica<br/>58mm / 80mm"]
        LEI["Leitor de<br/>código de barras"]
    end

    subgraph nuvem["☁️ Nuvem"]
        API["Backend .NET 9<br/>Render<br/><i>21 controllers</i>"]
        DASH["Dashboard React<br/>Render static<br/><i>15 páginas</i>"]
        DB[("PostgreSQL<br/>Neon · sa-east-1<br/><i>RLS por tenant</i>")]
    end

    subgraph genesi["🛠️ Genesi"]
        ADMIN["Painel /admin<br/><i>superadmin</i>"]
        GH["GitHub Releases<br/><i>auto-update do PDV</i>"]
    end

    LEI -->|bipe| PDV
    PDV -->|cupom e orçamento| IMP
    PDV <-->|"JWT · sync de vendas"| API
    PDV <-.->|"electron-updater"| GH
    DASH <-->|"JWT"| API
    ADMIN --> DASH
    API <-->|"SET LOCAL app.current_tenant_id"| DB
    API -.->|"SignalR /hubs/stock"| DASH

    classDef offline fill:#1e3a5f,stroke:#3b82f6,color:#fff
    classDef cloud fill:#1e3a2f,stroke:#10b981,color:#fff
    classDef ops fill:#3f2d1e,stroke:#f59e0b,color:#fff
    class PDV,IMP,LEI offline
    class API,DASH,DB cloud
    class ADMIN,GH ops
```

**A decisão que molda tudo:** o PDV é *offline-first*. Ele nunca depende da
nuvem para vender — a venda é gravada no SQLite local e sincronizada depois.
Internet caindo no meio do movimento não pode parar a fila do caixa.

A única exceção é o **orçamento**, que precisa do servidor para receber
número sequencial. Está documentado como limitação conhecida em §5.

---

## 2. Isolamento entre lojas (multi-tenant)

Cem lojas dividem o mesmo banco. O que impede a loja A de ver os dados da
loja B **não é código de aplicação** — é política do PostgreSQL.

```mermaid
sequenceDiagram
    participant C as Cliente<br/>(PDV/Dashboard)
    participant API as Backend
    participant MW as TenantMiddleware
    participant IC as ConnectionInterceptor
    participant PG as PostgreSQL

    C->>API: POST /api/auth/login
    API-->>C: JWT com claim tenant_id

    Note over C,PG: toda request seguinte

    C->>API: GET /api/products<br/>Authorization: Bearer JWT
    API->>MW: valida assinatura do token
    MW->>MW: claims → ITenantContext (scoped)
    MW->>IC: abre transação
    IC->>PG: SET LOCAL app.current_tenant_id = '<uuid>'
    IC->>PG: SELECT * FROM products
    PG->>PG: policy tenant_isolation<br/>filtra por tenant_id
    PG-->>API: só as linhas da loja
    API-->>C: 200 OK
```

Três regras que sustentam isso — quebrar qualquer uma derruba o isolamento:

| Regra | Por quê |
|---|---|
| `SET LOCAL`, não `SET` | `LOCAL` morre no fim da transação. Sem isso, uma conexão devolvida ao pool levaria o contexto da loja anterior para a próxima request. |
| Role `solucao_app` sem `BYPASSRLS` nem superuser | Superuser ignora policy. É o erro de configuração mais comum em multi-tenant com RLS. |
| Host **direto** do Neon, nunca o `-pooler` | O pooler em modo transação não preserva `set_config` entre o SET e a query. O RLS passa a filtrar por um contexto vazio. |

O `tenant_id` **nunca** viaja na URL nem em header — só na claim assinada do
JWT. Um cliente malicioso não consegue pedir dados de outra loja porque não
existe parâmetro para isso.

---

## 3. Uma venda, do bipe ao servidor

```mermaid
flowchart TD
    A["Operador bipa o produto<br/><i>ou digita 12*código</i>"] --> B{"Achou<br/>no catálogo<br/>local?"}
    B -->|não| B1["Avisa: cadastre no dashboard"] --> A
    B -->|sim| C["Entra no carrinho<br/><i>promoção vigente aplicada</i>"]
    C --> D{"Mais<br/>itens?"}
    D -->|sim| A
    D -->|não| E{"Desconto?"}
    E -->|"acima da alçada"| E1["Supervisor: código + PIN"]
    E1 --> F
    E -->|não| F["F10 · Pagamento"]
    F --> G["Dinheiro / Pix / Débito / Crédito<br/>Transferência / Vale crédito<br/><i>pode misturar</i>"]
    G --> H["Grava no SQLite local<br/><b>synced = 0</b>"]
    H --> I["Baixa estoque local<br/>+ imprime cupom"]
    I --> J{"Online?"}
    J -->|não| K["Fica na fila.<br/><b>A venda já aconteceu.</b>"]
    K -.->|"volta a internet"| L
    J -->|sim| L["POST /api/sync/sales"]
    L --> M["Servidor: grava venda,<br/>baixa estoque, abate vale,<br/>fecha orçamento"]
    M --> N["synced = 1"]

    style H fill:#1e3a5f,stroke:#3b82f6,color:#fff
    style K fill:#3f2d1e,stroke:#f59e0b,color:#fff
    style M fill:#1e3a2f,stroke:#10b981,color:#fff
```

**Idempotência:** cada venda carrega um `OfflineSyncId` (UUID gerado no PDV).
O servidor ignora um `OfflineSyncId` que já viu. Por isso reenviar o lote
inteiro é seguro — e é justamente o que acontece quando a rede cai no meio da
sincronização.

**Estoque pode ficar negativo no servidor.** É proposital: duas vendas
offline em caixas diferentes podem passar do saldo conhecido. O servidor
registra a realidade em vez de rejeitar uma venda que já foi feita e paga.

---

## 4. Ciclo do orçamento

O caso do balcão de autopeças: monta a lista, imprime, o cliente leva o papel
e volta dias depois.

```mermaid
stateDiagram-v2
    [*] --> Carrinho: operador monta a lista
    Carrinho --> Aberto: F11 · salva e imprime
    note right of Aberto
        Número sequencial por loja.
        NÃO baixa estoque.
        NÃO entra no caixa.
    end note

    Aberto --> Carrinho2: cliente volta · F11 busca pelo número
    Carrinho2: Carrinho reaberto
    note left of Carrinho2
        Mantém o preço prometido,
        mas avisa o que mudou
        desde o orçamento.
    end note

    Carrinho2 --> Convertido: fecha a venda (F10)
    note right of Convertido
        Só AQUI o estoque baixa
        e o dinheiro entra.
    end note

    Aberto --> Vencido: passou da validade
    note left of Vencido
        "Sem validade" nunca vence —
        para contrato ou tabela
        combinada com oficina.
    end note
    Vencido --> Carrinho2: reabre mesmo assim, decisão do atendente
    Aberto --> Cancelado: cancela
    note right of Cancelado
        Não apaga: o que foi orçado
        e não fechou mostra onde
        a loja perde negócio.
    end note

    Convertido --> [*]
    Cancelado --> [*]
```

A conversão viaja **dentro do próprio sync da venda** (`SaleSyncDto.QuoteId`),
não num endpoint separado. Assim funciona igual quando o PDV fechou a venda
offline e só sincronizou horas depois.

---

## 5. Devolução, vale crédito e o dinheiro do cliente

```mermaid
sequenceDiagram
    participant O as Operador
    participant S as Supervisor
    participant PDV
    participant API as Backend
    participant DB as PostgreSQL

    O->>PDV: F7 · escolhe a venda e os itens
    PDV->>API: POST /api/sales/{id}/returns
    API-->>PDV: 403 requiresSupervisor
    Note over O,S: devolução mexe em dinheiro e estoque:<br/>mesma regra da sangria
    S->>PDV: código + PIN
    PDV->>API: reenvia com credenciais do supervisor
    API->>DB: estorna estoque + marca a venda
    alt reembolso = crédito do cliente
        API->>DB: customers.credit_balance += valor
    end
    API-->>PDV: ok · saldo do cliente

    Note over O,DB: dias depois, o cliente volta

    O->>PDV: F3 seleciona o cliente
    PDV->>PDV: mostra 🎟️ saldo em vale
    O->>PDV: F10 · usa "Vale crédito"
    PDV->>PDV: campo travado no saldo disponível
    PDV->>API: sync da venda com pagamento store_credit
    API->>DB: credit_balance -= usado<br/><i>Math.Min: nunca negativo</i>
```

O saldo é abatido **em dois lugares**: no servidor (dentro da transação da
venda) e no SQLite local. Sem a baixa local, o operador gastaria o mesmo vale
várias vezes até o próximo snapshot do catálogo.

---

## 6. Quem pode o quê

```mermaid
graph LR
    subgraph papeis["Papéis"]
        SU["superadmin<br/><i>Genesi</i>"]
        AD["admin<br/><i>dono da loja</i>"]
        GE["manager<br/><i>gerente</i>"]
        CX["cashier<br/><i>caixa</i>"]
    end

    SU --> P1["Criar/suspender lojas<br/>Acessar como cliente (impersonação)<br/>Liberar nº de PDVs"]
    AD --> P2["Cadastros, preços, promoções<br/>Operadores e PINs<br/>Anonimizar cliente (LGPD)"]
    GE --> P3["Autorizar desconto<br/>Autorizar sangria<br/>Autorizar devolução"]
    CX --> P4["Vender · orçar<br/>Suprimento de caixa<br/>Abrir/fechar o próprio caixa"]

    GE -.->|"herda"| P4
    AD -.->|"herda"| P3

    classDef su fill:#3f1e3a,stroke:#a855f7,color:#fff
    classDef ad fill:#1e3a2f,stroke:#10b981,color:#fff
    classDef ge fill:#3f2d1e,stroke:#f59e0b,color:#fff
    classDef cx fill:#1e3a5f,stroke:#3b82f6,color:#fff
    class SU,P1 su
    class AD,P2 ad
    class GE,P3 ge
    class CX,P4 cx
```

O caixa **executa**; quem responde pela loja **autoriza**. As três ações que
tiram dinheiro ou mercadoria — desconto acima da alçada, sangria e devolução —
exigem código + PIN de um `admin` ou `manager`, validados **no servidor**.
Quem liberou fica gravado no motivo do lançamento e no `audit_log`.

---

## 7. Assinatura do lojista

```mermaid
stateDiagram-v2
    [*] --> Ativa: cadastro ou pagamento
    Ativa --> Carencia: venceu no dia 25
    Carencia: Carência de 3 dias
    note right of Carencia
        Sistema segue funcionando.
        Aviso no menu lateral.
    end note
    Carencia --> Bloqueada: passou da carência
    note right of Bloqueada
        402 em toda a API do tenant.
        Liberados: login, settings GET
        e a própria tela de pagamento.
    end note
    Bloqueada --> Ativa: PIX confirmado
    Carencia --> Ativa: PIX confirmado
    Ativa --> Cortesia: superadmin concede bônus
    Cortesia --> Ativa: fim do período
```

O primeiro ciclo é **pro-rata** até o dia 25. O provider de PIX é plugável
(`Billing:Provider`): `simulated` confirma sozinho em ~20s para teste;
`mercadopago` usa o token real.

---

## 8. Do commit ao caixa do cliente

```mermaid
flowchart LR
    A["commit em main"] --> B{"tem migração<br/>de banco?"}
    B -->|sim| C["⚠️ rodar o SQL no Neon<br/><b>ANTES</b> do push"]
    C --> D
    B -->|não| D["git push origin main"]
    D --> E["Render: backend + dashboard<br/><i>auto-deploy</i>"]
    D --> F{"lançar<br/>PDV?"}
    F -->|sim| G["bump em pdv/package.json<br/>+ tag vX.Y.Z"]
    G --> H["GitHub Actions<br/>electron-builder"]
    H --> I["Release com 3 assets:<br/>.exe · .exe.blockmap · latest.yml"]
    I --> J["electron-updater<br/>atualiza o PDV do cliente"]

    style C fill:#3f1e1e,stroke:#ef4444,color:#fff
```

**A ordem não é preferência, é requisito.** O EF mapeia a coluna nova assim
que o código sobe; se ela ainda não existe no banco, toda consulta àquela
tabela responde 500. Não há migração automática no startup — cada
`database/NN_*.sql` é aplicado à mão no SQL Editor do Neon.

Os 3 assets da release são obrigatórios: sem o `latest.yml` o
`electron-updater` não enxerga a versão nova.

---

## 9. Onde os dados pessoais moram (LGPD)

```mermaid
graph TD
    T["Titular<br/><i>consumidor</i>"] --> C["customers<br/>nome · CPF · e-mail<br/>telefone · endereço · nascimento"]
    T --> Q["quotes<br/>nome · telefone<br/><i>cópia para imprimir</i>"]
    T --> D["delivery_orders<br/>telefone · endereço"]
    T --> S["sales<br/><i>vínculo + itens</i>"]

    C -->|"🔒 anonimizar"| X["nome trocado, campos nulos<br/>status = anonymized"]
    Q -->|"🔒 anonimizar"| X2["nome e telefone nulos"]
    S -->|"guarda fiscal 5 anos"| Y["preservada<br/><i>sem dono identificável</i>"]

    style X fill:#1e3a2f,stroke:#10b981,color:#fff
    style X2 fill:#1e3a2f,stroke:#10b981,color:#fff
    style Y fill:#3f2d1e,stroke:#f59e0b,color:#fff
```

Anonimizar em vez de excluir é o que concilia o **art. 18, VI** (eliminação)
com a guarda fiscal obrigatória de 5 anos. Detalhamento completo, incluindo o
que ainda falta no plano jurídico, em [LGPD.md](LGPD.md).

---

## 10. Mapa do repositório

```
solucao-2026/
├── backend/              .NET 9 · 21 controllers
│   ├── Controllers/      Auth, Products, Sales, Sync, Cash, Quotes, Returns…
│   ├── Middleware/       TenantMiddleware · SubscriptionGate
│   ├── Data/             AppDbContext · TenantConnectionInterceptor (RLS)
│   └── Services/         Jwt · Audit · OperatorAuth · Billing/ · Fiscal/
├── dashboard/            React + Vite + Tailwind · 15 páginas
├── pdv/                  Electron offline-first
│   ├── electron/         main · preload · db (SQLite) · sync · print · updater
│   └── src/              PDV.jsx + modais (pagamento, orçamento, devolução…)
├── database/             01…19 · aplicados À MÃO, em ordem
├── backend.Tests/        xUnit · 139 testes · rodam sem Postgres
└── docs/                 ARQUITETURA (este) · DEPLOY · LGPD · MANUAL_TECNICO
```

> ⚠️ **Colisão de numeração:** existem `17_discount_default.sql` e
> `17_payment_methods.sql`. Ambos já aplicados em produção; ficam como estão
> para não quebrar o histórico. O próximo número livre é o **20**.
