-- ============================================================================
-- 17. Desconto no PDV: alçada zero por padrão
-- ============================================================================
--   Em operação controlada o caixa não tem alçada de desconto — qualquer
--   abatimento passa por gerente. O limite continua configurável por loja
--   (Configurações), mas o padrão deixa de ser 10% e passa a ser 0.
--   O UPDATE alcança as lojas existentes porque nenhuma havia configurado
--   esse limite ainda (o campo nasceu na migração 16, hoje).
-- ============================================================================

ALTER TABLE tenants ALTER COLUMN max_discount_percent SET DEFAULT 0;

UPDATE tenants SET max_discount_percent = 0 WHERE max_discount_percent = 10;
