-- ============================================================================
-- 16. Operador de caixa: código + PIN, e limite de desconto
-- ============================================================================
--   No balcão a troca de turno é constante: digitar e-mail e senha a cada
--   troca não funciona. O operador passa a ter um código curto e um PIN
--   numérico — as credenciais completas seguem valendo para o dashboard.
--
--   O mesmo PIN autoriza operações sensíveis (desconto acima do limite),
--   sem trocar quem está logado no caixa.
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS operator_code VARCHAR(10);
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash      TEXT;

-- Código curto é único dentro da loja (é o que o operador digita)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_operator_code
    ON users(tenant_id, operator_code) WHERE operator_code IS NOT NULL;

-- Desconto acima disso exige autorização de supervisor no PDV
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_discount_percent DECIMAL(5,2) NOT NULL DEFAULT 10
    CONSTRAINT tenants_max_discount_check CHECK (max_discount_percent BETWEEN 0 AND 100);
