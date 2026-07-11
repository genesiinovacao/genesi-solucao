-- ============================================================================
-- 07. Sale returns (devolução de venda — parcial ou total)
-- ============================================================================
--   * Estende sales.status para aceitar 'returned' e 'partial_returned'
--   * Adiciona customers.credit_balance para guardar o crédito gerado por
--     devoluções de clientes identificados
--   * Cria sale_returns (cabeçalho) + sale_return_items (linhas)
--   * O ajuste de estoque continua sendo registrado em stock_movements
--     (movement_type = 'return'), que já existe no schema.
-- ============================================================================

ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_status_check;
ALTER TABLE sales ADD CONSTRAINT sales_status_check
    CHECK (status IN ('completed','cancelled','pending','returned','partial_returned'));

ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS credit_balance DECIMAL(15,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS sale_returns (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sale_id             UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    customer_id         UUID REFERENCES customers(id) ON DELETE SET NULL,
    user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
    total_refund        DECIMAL(15,2) NOT NULL,
    refund_method       VARCHAR(20) NOT NULL
                        CHECK (refund_method IN ('cash','pix','credit','customer_credit')),
    reason              VARCHAR(500),
    is_partial          BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sale_return_items (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sale_return_id      UUID NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
    sale_item_id        UUID NOT NULL REFERENCES sale_items(id) ON DELETE CASCADE,
    product_id          UUID REFERENCES products(id) ON DELETE SET NULL,
    quantity_returned   DECIMAL(12,3) NOT NULL CHECK (quantity_returned > 0),
    unit_price          DECIMAL(12,2) NOT NULL,
    refund_amount       DECIMAL(15,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sale_returns_tenant ON sale_returns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sale_returns_sale   ON sale_returns(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_returns_date   ON sale_returns(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sale_return_items_tenant ON sale_return_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sale_return_items_return ON sale_return_items(sale_return_id);

-- RLS — mesmo padrão das outras tabelas
ALTER TABLE sale_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_returns FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sale_returns;
CREATE POLICY tenant_isolation ON sale_returns
    USING (tenant_id = app_current_tenant())
    WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE sale_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_return_items FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sale_return_items;
CREATE POLICY tenant_isolation ON sale_return_items
    USING (tenant_id = app_current_tenant())
    WITH CHECK (tenant_id = app_current_tenant());
