-- ============================================================================
-- 11. Assinatura do cliente
-- ============================================================================
--   * subscription_expires_at: data de expiração da assinatura, gerida pelo
--     superadmin no painel /admin (cadastro + botão Renovar).
--   * NULL = sem controle de expiração (ex.: cortesia/interno).
--   * A expiração NÃO bloqueia login automaticamente — gera alertas no painel
--     admin e na área do cliente a partir de 3 dias do vencimento. O bloqueio
--     continua manual (tenants.is_active).
-- ============================================================================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_expires_at DATE;
