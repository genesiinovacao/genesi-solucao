-- ============================================================================
-- 21. Dados para imprimir o DANFE da NFC-e
-- ============================================================================
--   O cupom fiscal exige do emitente o que a tabela ainda não tinha (IE) e do
--   documento o que o provider precisa devolver para o QR Code funcionar.
--
--   * state_registration: Inscrição Estadual. Sai impressa ao lado do CNPJ.
--   * approximate_tax_percent: percentual usado no "valor aproximado dos
--     tributos" (Lei 12.741/2012). É aproximação declarada, não cálculo
--     fiscal — o cálculo correto depende do NCM de cada item e da tabela
--     IBPT, que este sistema ainda não tem. Zero = não imprime a linha.
--   * qr_code_data: o conteúdo do QR Code da NFC-e, montado pelo provider.
--     Depende do CSC (Código de Segurança do Contribuinte) da loja e de um
--     hash SHA-1 — só um provider real produz um QR que a SEFAZ valida.
--   * consulta_url: endereço de consulta da UF, que muda por estado.
-- ============================================================================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS state_registration VARCHAR(20);

ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS approximate_tax_percent DECIMAL(5,2) NOT NULL DEFAULT 0;

ALTER TABLE fiscal_documents ADD COLUMN IF NOT EXISTS qr_code_data TEXT;
ALTER TABLE fiscal_documents ADD COLUMN IF NOT EXISTS consulta_url TEXT;
