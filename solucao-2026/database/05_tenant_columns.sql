-- ============================================================================
-- Tenants — extra editable fields (company info + business config)
-- These were originally in localStorage in the v1.0 system.
-- Idempotent: safe to re-run.
-- ============================================================================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS phone               VARCHAR(20);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email               CITEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS address             TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS daily_sales_target  DECIMAL(15,2) NOT NULL DEFAULT 0;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tax_regime          VARCHAR(50)   NOT NULL DEFAULT 'simples_nacional';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_emoji          VARCHAR(10);

-- Backfill demo values for the seeded tenants (only if still NULL/zero)
UPDATE tenants
   SET phone              = COALESCE(phone,              '(11) 99999-0000'),
       email              = COALESCE(email,              'contato@mercadojoao.com'::citext),
       address            = COALESCE(address,            'Rua Principal, 100 - Centro'),
       daily_sales_target = CASE WHEN daily_sales_target = 0 THEN 3500 ELSE daily_sales_target END,
       logo_emoji         = COALESCE(logo_emoji,         '🛒')
 WHERE id = '11111111-1111-1111-1111-111111111111';

UPDATE tenants
   SET phone              = COALESCE(phone,              '(11) 98888-0000'),
       email              = COALESCE(email,              'contato@padariaana.com'::citext),
       address            = COALESCE(address,            'Av. Padaria, 50 - Vila Madalena'),
       daily_sales_target = CASE WHEN daily_sales_target = 0 THEN 1200 ELSE daily_sales_target END,
       logo_emoji         = COALESCE(logo_emoji,         '🥐')
 WHERE id = '22222222-2222-2222-2222-222222222222';
