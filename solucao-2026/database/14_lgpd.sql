-- ============================================================================
-- 14. LGPD — anonimização do titular
-- ============================================================================
--   O direito à eliminação (art. 18, VI) não pode apagar a venda: nota fiscal
--   e escrituração têm guarda obrigatória. A saída é anonimizar o cadastro —
--   os dados pessoais somem, o histórico financeiro continua íntegro e sem
--   dono identificável.
--   'anonymized' é um status próprio (não 'inactive') porque é prova de que o
--   pedido do titular foi atendido, com a data do atendimento.
-- ============================================================================

ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_status_check;
ALTER TABLE customers ADD CONSTRAINT customers_status_check
    CHECK (status IN ('active', 'inactive', 'anonymized'));

ALTER TABLE customers ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ;

-- O audit_log já existe desde a migração 01 (com RLS) — passa a ser gravado
-- de verdade pelo backend a partir desta versão.
GRANT SELECT, INSERT ON audit_log TO solucao_app;
