-- ============================================================================
-- 13. Ciclo de cobrança no dia fixo (25) + bonificação
-- ============================================================================
--   * tenants.subscription_is_bonus: o período atual é cortesia (não gera
--     receita). O financeiro distingue cortesia de assinatura paga.
--   * billing_charges ganha charge_type ('subscription' | 'bonus'), o período
--     coberto e o detalhe do pro-rata — cada concessão de acesso, paga ou
--     bonificada, vira uma linha auditável.
--   * provider_charge_id/qr_code_text viram opcionais: bonificação não tem PIX.
-- ============================================================================

ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS subscription_is_bonus BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE billing_charges
    ADD COLUMN IF NOT EXISTS charge_type VARCHAR(20) NOT NULL DEFAULT 'subscription';
ALTER TABLE billing_charges DROP CONSTRAINT IF EXISTS billing_charges_type_check;
ALTER TABLE billing_charges ADD CONSTRAINT billing_charges_type_check
    CHECK (charge_type IN ('subscription', 'bonus'));

ALTER TABLE billing_charges ADD COLUMN IF NOT EXISTS period_start   DATE;
ALTER TABLE billing_charges ADD COLUMN IF NOT EXISTS prorata_days   INT NOT NULL DEFAULT 0;
ALTER TABLE billing_charges ADD COLUMN IF NOT EXISTS prorata_amount DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE billing_charges ADD COLUMN IF NOT EXISTS notes          TEXT;

-- Bonificação pode ser só de dias (0 mês cheio); paga pode ser anual (12)
ALTER TABLE billing_charges DROP CONSTRAINT IF EXISTS billing_charges_months_check;
ALTER TABLE billing_charges ADD CONSTRAINT billing_charges_months_check
    CHECK (months BETWEEN 0 AND 24);

-- Bonificação não tem cobrança no provider nem QR Code
ALTER TABLE billing_charges ALTER COLUMN provider_charge_id DROP NOT NULL;
ALTER TABLE billing_charges ALTER COLUMN qr_code_text       DROP NOT NULL;

-- O superadmin (tenant "plataforma") precisa conceder bonificação e ler o
-- histórico financeiro de qualquer cliente. Sem esta exceção o RLS rejeitaria
-- o INSERT/SELECT, porque app_current_tenant() seria o tenant da plataforma.
DROP POLICY IF EXISTS tenant_isolation ON billing_charges;
CREATE POLICY tenant_isolation ON billing_charges
    USING (tenant_id = app_current_tenant()
           OR app_current_tenant() = '00000000-0000-0000-0000-000000000001'::uuid)
    WITH CHECK (tenant_id = app_current_tenant()
           OR app_current_tenant() = '00000000-0000-0000-0000-000000000001'::uuid);

GRANT SELECT, INSERT, UPDATE ON billing_charges TO solucao_app;
