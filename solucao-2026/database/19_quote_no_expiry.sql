-- ============================================================================
-- 19. Orçamento sem prazo de validade
-- ============================================================================
--   Nem todo orçamento vence: contrato fechado, tabela de preço combinada com
--   frota ou oficina parceira valem até a loja avisar o contrário. Guardar
--   uma data futura qualquer para simular "não vence" mentiria no papel
--   impresso, então a coluna passa a aceitar NULL = sem prazo.
--
--   Orçamentos já gravados mantêm a data que têm — nada muda para eles.
-- ============================================================================

ALTER TABLE quotes ALTER COLUMN valid_until DROP NOT NULL;
