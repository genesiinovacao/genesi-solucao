-- ============================================================================
-- SOLUÇÃO 2026 — Seed data for development
-- Two tenants so we can validate RLS isolation
-- ============================================================================

-- Tenant 1: Mercado do João
INSERT INTO tenants (id, name, cnpj, plan_type) VALUES
('11111111-1111-1111-1111-111111111111', 'Mercado do João', '12.345.678/0001-90', 'standard');

-- Tenant 2: Padaria da Ana
INSERT INTO tenants (id, name, cnpj, plan_type) VALUES
('22222222-2222-2222-2222-222222222222', 'Padaria da Ana', '98.765.432/0001-10', 'basic');

-- ----------------------------------------------------------------------------
-- USERS — password for all demo users is "123456" (bcrypt cost 11)
-- ----------------------------------------------------------------------------
INSERT INTO users (id, tenant_id, name, email, password_hash, role) VALUES
('aaaaaaaa-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'João Silva',     'admin@mercadojoao.com', '$2a$11$ENWdGRWlqr5pHomQekFOmuiVj1g.qMnyaaFx2YT9.j6Mh4t2BJoYC', 'admin'),
('aaaaaaaa-1111-1111-1111-111111111112', '11111111-1111-1111-1111-111111111111', 'Maria Caixa',    'caixa@mercadojoao.com', '$2a$11$ENWdGRWlqr5pHomQekFOmuiVj1g.qMnyaaFx2YT9.j6Mh4t2BJoYC', 'cashier'),
('bbbbbbbb-2222-2222-2222-222222222221', '22222222-2222-2222-2222-222222222222', 'Ana Pereira',    'admin@padariaana.com',  '$2a$11$ENWdGRWlqr5pHomQekFOmuiVj1g.qMnyaaFx2YT9.j6Mh4t2BJoYC', 'admin');

-- ============================================================================
-- From this point on, every INSERT below MUST run with the right tenant
-- context so the RLS policies validate the WITH CHECK clause.
-- The seed connects as superuser (postgres) which bypasses RLS, so we
-- explicitly set the var as a sanity check & document the pattern.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TENANT 1 DATA
-- ----------------------------------------------------------------------------
SET app.current_tenant_id = '11111111-1111-1111-1111-111111111111';

INSERT INTO suppliers (tenant_id, name, cnpj, contact_name, phone, email, category) VALUES
('11111111-1111-1111-1111-111111111111', 'Distribuidora Central Ltda', '12.345.678/0001-91', 'Pedro Alves',  '(11) 3333-1111', 'comercial@distribcentral.com', 'Mercearia'),
('11111111-1111-1111-1111-111111111111', 'Laticínios Bom Sabor',       '98.765.432/0001-11', 'Sandra Vieira','(11) 3333-2222', 'vendas@bomsabor.com',         'Laticínios'),
('11111111-1111-1111-1111-111111111111', 'Frigorífico Sul',            '11.222.333/0001-44', 'Marcos Gomes', '(11) 3333-3333', 'compras@frigosul.com',        'Carnes');

INSERT INTO products (tenant_id, sku, barcode, name, category, unit, emoji, cost_price, sale_price, stock_quantity, min_stock) VALUES
('11111111-1111-1111-1111-111111111111', 'ARZ005', '7891234560001', 'Arroz Branco 5kg',      'Mercearia',  'un', '🍚', 14.90, 19.90, 150, 20),
('11111111-1111-1111-1111-111111111111', 'FEJ001', '7891234560002', 'Feijão Carioca 1kg',    'Mercearia',  'un', '🫘',  5.80,  8.90, 200, 30),
('11111111-1111-1111-1111-111111111111', 'LEI001', '7891234560003', 'Leite Integral 1L',     'Laticínios', 'un', '🥛',  3.50,  5.49,   8, 50),
('11111111-1111-1111-1111-111111111111', 'PAO001', '7891234560004', 'Pão Francês',           'Padaria',    'kg', '🥖',  4.00,  8.00,  30, 10),
('11111111-1111-1111-1111-111111111111', 'REF002', '7891234560005', 'Refrigerante 2L',       'Bebidas',    'un', '🥤',  5.00,  8.50,  60, 15),
('11111111-1111-1111-1111-111111111111', 'OLE001', '7891234560006', 'Óleo de Soja 900ml',    'Mercearia',  'un', '🫙',  7.20, 10.90,  45, 20),
('11111111-1111-1111-1111-111111111111', 'ACU001', '7891234560007', 'Açúcar Cristal 1kg',    'Mercearia',  'un', '🍬',  3.10,  4.90, 180, 40),
('11111111-1111-1111-1111-111111111111', 'CAF500', '7891234560008', 'Café Torrado 500g',     'Mercearia',  'un', '☕',  9.50, 14.90,   5, 20),
('11111111-1111-1111-1111-111111111111', 'FRG001', '7891234560011', 'Frango Congelado 1kg',  'Carnes',     'kg', '🍗',  9.00, 14.90,  35, 10),
('11111111-1111-1111-1111-111111111111', 'AGU001', '7891234560018', 'Água Mineral 1,5L',     'Bebidas',    'un', '💧',  1.20,  2.49, 100, 30);

INSERT INTO customers (tenant_id, name, tax_id, phone, email, loyalty_points, total_spent) VALUES
('11111111-1111-1111-1111-111111111111', 'Maria da Silva',  '123.456.789-00', '(11) 99999-1111', 'maria@email.com',     350, 1850.00),
('11111111-1111-1111-1111-111111111111', 'João Pereira',    '987.654.321-00', '(11) 98888-2222', 'joao@email.com',      120,  680.00),
('11111111-1111-1111-1111-111111111111', 'Ana Costa',       '111.222.333-44', '(11) 97777-3333', 'ana@email.com',       580, 3200.00),
('11111111-1111-1111-1111-111111111111', 'Fernanda Lima',   '999.888.777-66', '(11) 95555-5555', 'fernanda@email.com',  890, 4750.00),
('11111111-1111-1111-1111-111111111111', 'Lucia Mendes',    '777.888.999-11', '(11) 93333-7777', 'lucia@email.com',    1200, 6400.00);

INSERT INTO promotions (tenant_id, name, discount_percent, target_type, target_value, starts_at, ends_at, is_active) VALUES
('11111111-1111-1111-1111-111111111111', 'Semana da Mercearia',         15, 'category',  'Mercearia',       '2026-05-10', '2026-05-17', true),
('11111111-1111-1111-1111-111111111111', 'Desconto Fidelidade Gold',    10, 'loyalty',   'gold',            '2026-05-01', '2026-05-31', true);

INSERT INTO financial_transactions (tenant_id, type, description, amount, transaction_date, category, status) VALUES
('11111111-1111-1111-1111-111111111111', 'expense', 'Aluguel do Espaço',                   2200.00, '2026-05-20', 'Aluguel',   'pending'),
('11111111-1111-1111-1111-111111111111', 'expense', 'Conta de Energia Elétrica',            420.00, '2026-05-15', 'Utilidades','pending'),
('11111111-1111-1111-1111-111111111111', 'expense', 'NF - Distribuidora Central',           850.00, '2026-05-10', 'Compras',   'paid'),
('11111111-1111-1111-1111-111111111111', 'income',  'Vendas do dia 10/05',                 2840.50, '2026-05-10', 'Vendas',    'paid');

-- ----------------------------------------------------------------------------
-- TENANT 2 DATA — minimal, just enough to validate isolation
-- ----------------------------------------------------------------------------
SET app.current_tenant_id = '22222222-2222-2222-2222-222222222222';

INSERT INTO suppliers (tenant_id, name, cnpj, contact_name, phone, email, category) VALUES
('22222222-2222-2222-2222-222222222222', 'Farinha & Cia',       '55.444.333/0001-22', 'Roberto Cunha', '(11) 4444-1111', 'vendas@farinhacia.com',  'Padaria'),
('22222222-2222-2222-2222-222222222222', 'Bebidas Premium',     '99.888.777/0001-66', 'Lucas Ferreira','(11) 4444-2222', 'vendas@bebpremium.com',  'Bebidas');

INSERT INTO products (tenant_id, sku, barcode, name, category, unit, emoji, cost_price, sale_price, stock_quantity, min_stock) VALUES
('22222222-2222-2222-2222-222222222222', 'PAOQ001', '7899876540001', 'Pão de Queijo (un)',  'Padaria',  'un', '🥯', 0.80,  1.80, 200, 50),
('22222222-2222-2222-2222-222222222222', 'BOLO001', '7899876540002', 'Bolo de Cenoura',     'Padaria',  'un', '🍰', 8.00, 18.00,  12,  5),
('22222222-2222-2222-2222-222222222222', 'CAFE001', '7899876540003', 'Café Expresso',       'Bebidas',  'un', '☕', 1.20,  4.50,  -1,  0);

INSERT INTO customers (tenant_id, name, tax_id, phone, loyalty_points, total_spent) VALUES
('22222222-2222-2222-2222-222222222222', 'Cliente da Ana 1', '000.000.000-01', '(11) 90000-0001', 50,  120.00),
('22222222-2222-2222-2222-222222222222', 'Cliente da Ana 2', '000.000.000-02', '(11) 90000-0002', 30,   80.00);

INSERT INTO financial_transactions (tenant_id, type, description, amount, transaction_date, category, status) VALUES
('22222222-2222-2222-2222-222222222222', 'expense', 'Compra de farinha', 320.00, '2026-05-18', 'Compras', 'paid');

-- ----------------------------------------------------------------------------
-- Reset session var
-- ----------------------------------------------------------------------------
RESET app.current_tenant_id;

-- ============================================================================
-- HOW TO VALIDATE RLS
-- ============================================================================
--
-- 1) Connect as the app role:
--      psql -h localhost -U solucao_app -d solucao
--
-- 2) Without tenant context, all queries return 0 rows:
--      SELECT count(*) FROM products;            -- expected: 0
--
-- 3) Set tenant 1 and you see only its data:
--      SET app.current_tenant_id = '11111111-1111-1111-1111-111111111111';
--      SELECT count(*) FROM products;            -- expected: 10
--      SELECT count(*) FROM customers;           -- expected: 5
--
-- 4) Switch to tenant 2:
--      SET app.current_tenant_id = '22222222-2222-2222-2222-222222222222';
--      SELECT count(*) FROM products;            -- expected: 3
--      SELECT count(*) FROM customers;           -- expected: 2
--
-- 5) Try to insert into the wrong tenant (must FAIL with policy violation):
--      INSERT INTO products (tenant_id, name, cost_price, sale_price)
--      VALUES ('11111111-1111-1111-1111-111111111111', 'Hack', 1, 1);
--      -- ERROR: new row violates row-level security policy
-- ============================================================================
