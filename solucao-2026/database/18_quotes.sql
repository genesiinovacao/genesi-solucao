-- ============================================================================
-- 18. Orçamentos (quotes)
-- ============================================================================
--   Balcão de autopeças/materiais monta a lista, imprime e entrega ao
--   cliente — que volta dias depois com o papel na mão. Um orçamento que o
--   sistema não sabe reabrir obriga o atendente a digitar tudo de novo, por
--   isso ele é gravado, não só impresso.
--
--   Orçamento NÃO é venda: não baixa estoque, não entra no caixa e não
--   aparece no faturamento. Só vira número quando é convertido em venda.
--
--   * number: sequencial por tenant, é o que vai impresso ("Orçamento 42").
--     Único por loja para o atendente achar pelo papel.
--   * valid_until: preço de peça muda; sem validade o cliente cobra um valor
--     de três meses atrás.
-- ============================================================================

CREATE TABLE IF NOT EXISTS quotes (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    number              BIGINT NOT NULL,
    user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
    customer_id         UUID REFERENCES customers(id) ON DELETE SET NULL,
    -- Cliente de balcão sem cadastro: só o nome/telefone do papel
    customer_name       VARCHAR(255),
    customer_phone      VARCHAR(30),
    subtotal            DECIMAL(15,2) NOT NULL DEFAULT 0,
    discount_amount     DECIMAL(15,2) NOT NULL DEFAULT 0,
    surcharge_amount    DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_amount        DECIMAL(15,2) NOT NULL DEFAULT 0,
    valid_until         DATE NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','converted','cancelled')),
    converted_sale_id   UUID REFERENCES sales(id) ON DELETE SET NULL,
    notes               VARCHAR(1000),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quote_items (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    quote_id            UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    product_id          UUID REFERENCES products(id) ON DELETE SET NULL,
    product_name        VARCHAR(255) NOT NULL,
    quantity            DECIMAL(12,3) NOT NULL CHECK (quantity > 0),
    unit_price          DECIMAL(12,2) NOT NULL,
    discount_amount     DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_price         DECIMAL(12,2) NOT NULL
);

-- O atendente procura pelo número impresso no papel do cliente
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_tenant_number ON quotes(tenant_id, number);
CREATE INDEX IF NOT EXISTS idx_quotes_tenant_date ON quotes(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_quote_items_tenant ON quote_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items(quote_id);

-- RLS — mesmo padrão das outras tabelas
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON quotes;
CREATE POLICY tenant_isolation ON quotes
    USING (tenant_id = app_current_tenant())
    WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON quote_items;
CREATE POLICY tenant_isolation ON quote_items
    USING (tenant_id = app_current_tenant())
    WITH CHECK (tenant_id = app_current_tenant());
