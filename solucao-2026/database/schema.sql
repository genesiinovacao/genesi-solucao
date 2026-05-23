-- SOLUÇÃO 2026 - PostgreSQL Database Schema
-- Focus: Multi-tenancy (RLS) and Scalability

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TENANTS TABLE (Clients)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    cnpj VARCHAR(18) UNIQUE NOT NULL,
    plan_type VARCHAR(50) DEFAULT 'standard', -- basic, premium, enterprise
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- 3. USERS TABLE
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(50) DEFAULT 'manager', -- admin, manager, cashier
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. PRODUCTS TABLE
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    sku VARCHAR(50),
    barcode VARCHAR(13),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    cost_price DECIMAL(12,2) NOT NULL,
    sale_price DECIMAL(12,2) NOT NULL,
    stock_quantity DECIMAL(12,3) DEFAULT 0,
    min_stock DECIMAL(12,3) DEFAULT 0,
    unit VARCHAR(10) DEFAULT 'un',
    emoji VARCHAR(10),
    is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. CUSTOMERS TABLE
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    tax_id VARCHAR(20), -- CPF/CNPJ
    email VARCHAR(255),
    phone VARCHAR(20),
    address TEXT,
    loyalty_points INT DEFAULT 0,
    total_spent DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active'
);

-- 6. SALES TABLE
CREATE TABLE sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    customer_id UUID REFERENCES customers(id),
    sale_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    subtotal DECIMAL(15,2) NOT NULL,
    discount_amount DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) NOT NULL,
    payment_method VARCHAR(50), -- cash, credit, debit, pix
    status VARCHAR(20) DEFAULT 'completed', -- completed, cancelled, pending
    offline_sync_id UUID UNIQUE -- ID from local PDV to prevent duplicates
);

-- 7. SALE ITEMS TABLE
CREATE TABLE sale_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    quantity DECIMAL(12,3) NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    total_price DECIMAL(12,2) NOT NULL
);

-- 8. ROW LEVEL SECURITY (RLS) SETUP
-- Enable RLS on all main tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;

-- 9. POLICIES (Example for Products)
-- This policy ensures that a user can only see products belonging to their tenant_id
-- We assume the tenant_id is passed via session variable or JWT claim context
CREATE POLICY tenant_isolation_policy ON products
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY tenant_isolation_policy_users ON users
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY tenant_isolation_policy_customers ON customers
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY tenant_isolation_policy_sales ON sales
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
