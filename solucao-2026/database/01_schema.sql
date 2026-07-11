-- ============================================================================
-- SOLUÇÃO 2026 — PostgreSQL Schema
-- Multi-tenant via Row Level Security (RLS) + offline-first sync support
-- ============================================================================

-- Extensions ---------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ============================================================================
-- 1. CONTROL TABLES (no RLS — managed only by superuser / platform admin)
-- ============================================================================

CREATE TABLE tenants (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255) NOT NULL,
    cnpj            VARCHAR(18) UNIQUE NOT NULL,
    plan_type       VARCHAR(50) NOT NULL DEFAULT 'standard'
                    CHECK (plan_type IN ('basic','standard','premium','enterprise')),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    email           CITEXT NOT NULL,
    password_hash   TEXT NOT NULL,
    role            VARCHAR(50) NOT NULL DEFAULT 'manager'
                    CHECK (role IN ('admin','manager','cashier')),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, email)
);

CREATE TABLE refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. BUSINESS TABLES (all tenant-scoped; RLS enforced below)
-- ============================================================================

CREATE TABLE suppliers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    cnpj            VARCHAR(18),
    contact_name    VARCHAR(255),
    phone           VARCHAR(20),
    email           CITEXT,
    address         TEXT,
    category        VARCHAR(100),
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','inactive')),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    supplier_id     UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    sku             VARCHAR(50),
    barcode         VARCHAR(20),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    category        VARCHAR(100),
    unit            VARCHAR(10) NOT NULL DEFAULT 'un',
    emoji           VARCHAR(10),
    cost_price      DECIMAL(12,2) NOT NULL DEFAULT 0,
    sale_price      DECIMAL(12,2) NOT NULL DEFAULT 0,
    stock_quantity  DECIMAL(12,3) NOT NULL DEFAULT 0,
    min_stock       DECIMAL(12,3) NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, sku),
    UNIQUE (tenant_id, barcode)
);

CREATE TABLE customers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    tax_id          VARCHAR(20),
    email           CITEXT,
    phone           VARCHAR(20),
    address         TEXT,
    loyalty_points  INT NOT NULL DEFAULT 0,
    total_spent     DECIMAL(15,2) NOT NULL DEFAULT 0,
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','inactive')),
    birth_date      DATE,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sales (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
    customer_id         UUID REFERENCES customers(id) ON DELETE SET NULL,
    sale_date           TIMESTAMPTZ NOT NULL DEFAULT now(),
    subtotal            DECIMAL(15,2) NOT NULL,
    discount_amount     DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_amount        DECIMAL(15,2) NOT NULL,
    payment_method      VARCHAR(50) NOT NULL
                        CHECK (payment_method IN ('cash','credit','debit','pix','mixed','crediario')),
    amount_received     DECIMAL(15,2),
    change_amount       DECIMAL(15,2),
    status              VARCHAR(20) NOT NULL DEFAULT 'completed'
                        CHECK (status IN ('completed','cancelled','pending')),
    offline_sync_id     UUID UNIQUE,
    pos_terminal_id     VARCHAR(50),
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sale_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sale_id         UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id      UUID REFERENCES products(id) ON DELETE SET NULL,
    product_name    VARCHAR(255) NOT NULL, -- snapshot in case product is deleted
    quantity        DECIMAL(12,3) NOT NULL,
    unit_price      DECIMAL(12,2) NOT NULL,
    discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_price     DECIMAL(12,2) NOT NULL
);

-- Multiple payments per sale (supports split payment: Pix + cash, etc.)
CREATE TABLE sale_payments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sale_id         UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    method          VARCHAR(50) NOT NULL
                    CHECK (method IN ('cash','credit','debit','pix','crediario')),
    amount          DECIMAL(15,2) NOT NULL,
    authorization_code VARCHAR(100),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE stock_movements (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    movement_type   VARCHAR(20) NOT NULL
                    CHECK (movement_type IN ('in','out','adjustment','sale','return','loss')),
    quantity        DECIMAL(12,3) NOT NULL,
    balance_after   DECIMAL(12,3) NOT NULL,
    unit_cost       DECIMAL(12,2),
    reference_type  VARCHAR(50), -- 'sale', 'purchase', 'manual', etc.
    reference_id    UUID,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE financial_transactions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    type            VARCHAR(20) NOT NULL CHECK (type IN ('income','expense')),
    description     VARCHAR(255) NOT NULL,
    amount          DECIMAL(15,2) NOT NULL,
    transaction_date DATE NOT NULL,
    due_date        DATE,
    paid_at         TIMESTAMPTZ,
    category        VARCHAR(100),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','paid','cancelled','overdue')),
    supplier_id     UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    sale_id         UUID REFERENCES sales(id) ON DELETE SET NULL,
    payment_method  VARCHAR(50),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE promotions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    discount_percent DECIMAL(5,2) NOT NULL CHECK (discount_percent >= 0 AND discount_percent <= 100),
    target_type     VARCHAR(20) NOT NULL CHECK (target_type IN ('product','category','loyalty','total')),
    target_value    VARCHAR(255), -- product_id, category name, or loyalty tier
    starts_at       DATE NOT NULL,
    ends_at         DATE NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    sales_count     INT NOT NULL DEFAULT 0,
    total_savings   DECIMAL(15,2) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (ends_at >= starts_at)
);

CREATE TABLE delivery_orders (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id         UUID REFERENCES customers(id) ON DELETE SET NULL,
    sale_id             UUID REFERENCES sales(id) ON DELETE SET NULL,
    order_number        VARCHAR(20) NOT NULL,
    customer_name       VARCHAR(255) NOT NULL,
    customer_phone      VARCHAR(20),
    delivery_address    TEXT NOT NULL,
    items_summary       TEXT,
    total_amount        DECIMAL(15,2) NOT NULL,
    delivery_fee        DECIMAL(15,2) NOT NULL DEFAULT 0,
    payment_method      VARCHAR(50),
    status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','preparing','out_for_delivery','delivered','cancelled')),
    driver_name         VARCHAR(255),
    requested_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at        TIMESTAMPTZ,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, order_number)
);

CREATE TABLE cash_sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    pos_terminal_id VARCHAR(50),
    opened_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    opening_amount  DECIMAL(15,2) NOT NULL DEFAULT 0,
    closed_at       TIMESTAMPTZ,
    closing_amount  DECIMAL(15,2),
    expected_amount DECIMAL(15,2),
    difference      DECIMAL(15,2),
    notes           TEXT
);

CREATE TABLE cash_movements (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    session_id      UUID NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
    type            VARCHAR(20) NOT NULL CHECK (type IN ('supply','withdraw')),
    amount          DECIMAL(15,2) NOT NULL,
    reason          VARCHAR(255),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    action          VARCHAR(100) NOT NULL,
    entity_type     VARCHAR(100) NOT NULL,
    entity_id       UUID,
    metadata        JSONB,
    ip_address      INET,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 3. INDEXES — tenant_id always first (RLS scans), then common lookup keys
-- ============================================================================

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at) WHERE revoked_at IS NULL;

CREATE INDEX idx_suppliers_tenant ON suppliers(tenant_id);
CREATE INDEX idx_suppliers_status ON suppliers(tenant_id, status);

CREATE INDEX idx_products_tenant ON products(tenant_id);
CREATE INDEX idx_products_barcode ON products(tenant_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_products_category ON products(tenant_id, category);
CREATE INDEX idx_products_low_stock ON products(tenant_id) WHERE stock_quantity <= min_stock AND is_active = true;

CREATE INDEX idx_customers_tenant ON customers(tenant_id);
CREATE INDEX idx_customers_tax_id ON customers(tenant_id, tax_id) WHERE tax_id IS NOT NULL;

CREATE INDEX idx_sales_tenant ON sales(tenant_id);
CREATE INDEX idx_sales_date ON sales(tenant_id, sale_date DESC);
CREATE INDEX idx_sales_customer ON sales(tenant_id, customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_sales_status ON sales(tenant_id, status);
CREATE INDEX idx_sales_offline_sync ON sales(offline_sync_id) WHERE offline_sync_id IS NOT NULL;

CREATE INDEX idx_sale_items_tenant ON sale_items(tenant_id);
CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_sale_items_product ON sale_items(product_id);

CREATE INDEX idx_sale_payments_tenant ON sale_payments(tenant_id);
CREATE INDEX idx_sale_payments_sale ON sale_payments(sale_id);

CREATE INDEX idx_stock_movements_tenant ON stock_movements(tenant_id);
CREATE INDEX idx_stock_movements_product ON stock_movements(tenant_id, product_id, created_at DESC);

CREATE INDEX idx_financial_tenant ON financial_transactions(tenant_id);
CREATE INDEX idx_financial_date ON financial_transactions(tenant_id, transaction_date DESC);
CREATE INDEX idx_financial_status ON financial_transactions(tenant_id, status);
CREATE INDEX idx_financial_due ON financial_transactions(tenant_id, due_date) WHERE status = 'pending';

CREATE INDEX idx_promotions_tenant ON promotions(tenant_id);
CREATE INDEX idx_promotions_active ON promotions(tenant_id, is_active, starts_at, ends_at);

CREATE INDEX idx_delivery_tenant ON delivery_orders(tenant_id);
CREATE INDEX idx_delivery_status ON delivery_orders(tenant_id, status);

CREATE INDEX idx_cash_sessions_tenant ON cash_sessions(tenant_id);
CREATE INDEX idx_cash_sessions_open ON cash_sessions(tenant_id, user_id) WHERE closed_at IS NULL;

CREATE INDEX idx_audit_tenant ON audit_log(tenant_id, created_at DESC);

-- ============================================================================
-- 4. UPDATED_AT trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'tenants','users','suppliers','products','customers',
        'financial_transactions','promotions','delivery_orders'
    ]
    LOOP
        EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at()', t);
    END LOOP;
END $$;

-- ============================================================================
-- 5. ROW LEVEL SECURITY
-- Backend MUST set per request:  SET LOCAL app.current_tenant_id = '<uuid>';
-- ============================================================================

-- Helper: read current tenant from session var (missing_ok = true so we get NULL not error)
CREATE OR REPLACE FUNCTION app_current_tenant()
RETURNS UUID
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::UUID
$$;

-- Enable + FORCE so even table owner respects policies
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'users','refresh_tokens','suppliers','products','customers',
        'sales','sale_items','sale_payments','stock_movements',
        'financial_transactions','promotions','delivery_orders',
        'cash_sessions','cash_movements','audit_log'
    ]
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format($f$
            CREATE POLICY tenant_isolation ON %I
                USING (tenant_id = app_current_tenant())
                WITH CHECK (tenant_id = app_current_tenant())
        $f$, t);
    END LOOP;
END $$;

-- ============================================================================
-- Done. Validate by:
--   SET app.current_tenant_id = '<tenant-uuid>';
--   SELECT count(*) FROM products;     -- only that tenant's rows
--   RESET app.current_tenant_id;
--   SELECT count(*) FROM products;     -- 0 rows (no tenant context)
-- ============================================================================
