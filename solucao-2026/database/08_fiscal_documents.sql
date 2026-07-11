-- ============================================================================
-- 08. Documentos fiscais (NFC-e / NFe / SAT)
-- ============================================================================
--   * Um documento por emissão; reemissão após rejeição cria nova linha.
--   * A numeração é sequencial por (tenant, document_type, series) — o backend
--     calcula MAX(number)+1 dentro de transação.
--   * O provider default é 'simulated' (sem SEFAZ); a coluna provider permite
--     ligar um gateway real (focus_nfe, plugnotas, ...) sem migração.
-- ============================================================================

CREATE TABLE IF NOT EXISTS fiscal_documents (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sale_id             UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    document_type       VARCHAR(10) NOT NULL DEFAULT 'nfce'
                        CHECK (document_type IN ('nfce','nfe','sat')),
    status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','authorized','rejected','cancelled')),
    environment         VARCHAR(20) NOT NULL DEFAULT 'homologation'
                        CHECK (environment IN ('homologation','production')),
    provider            VARCHAR(30) NOT NULL DEFAULT 'simulated',
    series              INT NOT NULL DEFAULT 1,
    number              BIGINT NOT NULL,
    access_key          CHAR(44),
    protocol_number     VARCHAR(30),
    xml                 TEXT,
    rejection_reason    VARCHAR(500),
    issued_at           TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fiscal_docs_number
    ON fiscal_documents(tenant_id, document_type, series, number);
CREATE INDEX IF NOT EXISTS idx_fiscal_docs_sale   ON fiscal_documents(sale_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_docs_tenant ON fiscal_documents(tenant_id, created_at DESC);

-- RLS — mesmo padrão das outras tabelas
ALTER TABLE fiscal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_documents FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON fiscal_documents;
CREATE POLICY tenant_isolation ON fiscal_documents
    USING (tenant_id = app_current_tenant())
    WITH CHECK (tenant_id = app_current_tenant());
