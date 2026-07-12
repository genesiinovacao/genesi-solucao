-- ============================================================================
-- 10. Administração da plataforma
-- ============================================================================
--   * Papel 'superadmin': o dono da plataforma (Genesi). Cadastra clientes,
--     define logos e limites. Vive num tenant "plataforma" comum — o RLS
--     continua valendo; o que é cross-tenant passa por endpoints /api/admin
--     que usam a tabela tenants (sem RLS) e funções SECURITY DEFINER.
--   * tenants ganha: logo (base64, exibida no dashboard/PDV do cliente),
--     segment (tipo de comércio) e max_pos_terminals (limite de PDVs).
--   * platform_settings: linha única com a logo global do sistema.
--   * pos_terminals: cada instalação de PDV se registra com uma chave única;
--     o backend recusa novas máquinas além do limite do tenant.
--   * products.expiry_date: validade (farmácia/supermercado).
-- ============================================================================

-- Papel superadmin
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('superadmin','admin','manager','cashier'));

-- Tenant: branding, segmento e limite de PDVs
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_base64        TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS segment            VARCHAR(50)  NOT NULL DEFAULT 'supermercado'
    CONSTRAINT tenants_segment_check CHECK (segment IN
    ('supermercado','farmacia','loja_roupas','loja_pecas','padaria','conveniencia','petshop','papelaria','outro'));
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_pos_terminals  INT NOT NULL DEFAULT 1
    CONSTRAINT tenants_max_pos_check CHECK (max_pos_terminals >= 0);

-- Validade de produto (opcional; usada por farmácia/supermercado)
ALTER TABLE products ADD COLUMN IF NOT EXISTS expiry_date DATE;

-- Configurações globais da plataforma (linha única, sem RLS: leitura por
-- todos os tenants — é a logo do sistema — e escrita só via /api/admin)
CREATE TABLE IF NOT EXISTS platform_settings (
    id           INT PRIMARY KEY CHECK (id = 1),
    logo_base64  TEXT,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO platform_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Terminais de PDV registrados por tenant
CREATE TABLE IF NOT EXISTS pos_terminals (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    terminal_key  VARCHAR(64) NOT NULL,
    name          VARCHAR(120),
    last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, terminal_key)
);
CREATE INDEX IF NOT EXISTS idx_pos_terminals_tenant ON pos_terminals(tenant_id);

ALTER TABLE pos_terminals ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_terminals FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON pos_terminals;
CREATE POLICY tenant_isolation ON pos_terminals
    USING (tenant_id = app_current_tenant())
    WITH CHECK (tenant_id = app_current_tenant());

-- Tenant "plataforma" que abriga o(s) superadmin(s). CNPJ placeholder.
INSERT INTO tenants (id, name, cnpj, plan_type, segment, max_pos_terminals)
VALUES ('00000000-0000-0000-0000-000000000001', 'Plataforma SOLUÇÃO', '00.000.000/0000-00', 'enterprise', 'outro', 0)
ON CONFLICT (id) DO NOTHING;

-- Cria/atualiza um superadmin. SECURITY DEFINER porque users tem RLS e o
-- chamador (endpoint admin ou setup manual) não está no tenant plataforma.
CREATE OR REPLACE FUNCTION app_upsert_superadmin(
    p_name          VARCHAR,
    p_email         TEXT,
    p_password_hash TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO users (tenant_id, name, email, password_hash, role)
    VALUES ('00000000-0000-0000-0000-000000000001', p_name, p_email::citext, p_password_hash, 'superadmin')
    ON CONFLICT (tenant_id, email)
    DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name, is_active = TRUE
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION app_upsert_superadmin(VARCHAR, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_upsert_superadmin(VARCHAR, TEXT, TEXT) TO solucao_app;
