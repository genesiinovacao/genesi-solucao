-- Link sales to their cash session so we can compute a proper Z close.
-- Idempotent.

ALTER TABLE sales ADD COLUMN IF NOT EXISTS cash_session_id UUID
    REFERENCES cash_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_cash_session
    ON sales(tenant_id, cash_session_id) WHERE cash_session_id IS NOT NULL;
