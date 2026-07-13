-- ============================================================================
-- 12. Cobranças de assinatura via PIX
-- ============================================================================
--   Cada renovação gera uma cobrança PIX (QR Code). Quando o provider
--   confirma o pagamento, o backend estende tenants.subscription_expires_at
--   e grava paid_at/applied_new_expiry — a cobrança nunca é aplicada 2x.
-- ============================================================================

CREATE TABLE IF NOT EXISTS billing_charges (
    id                  UUID PRIMARY KEY,
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plan_type           VARCHAR(20) NOT NULL,
    months              INT NOT NULL CHECK (months BETWEEN 1 AND 12),
    amount              DECIMAL(12,2) NOT NULL,
    provider            VARCHAR(30) NOT NULL,
    provider_charge_id  VARCHAR(120) NOT NULL,
    qr_code_text        TEXT NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','paid','expired','error')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at             TIMESTAMPTZ,
    applied_new_expiry  DATE
);

CREATE INDEX IF NOT EXISTS idx_billing_charges_tenant ON billing_charges(tenant_id, created_at DESC);

ALTER TABLE billing_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_charges FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON billing_charges;
CREATE POLICY tenant_isolation ON billing_charges
    USING (tenant_id = app_current_tenant())
    WITH CHECK (tenant_id = app_current_tenant());
