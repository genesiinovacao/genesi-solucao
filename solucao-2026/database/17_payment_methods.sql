-- ============================================================================
-- 17. Vale crédito, transferência bancária e acréscimo
-- ============================================================================
--   * store_credit: gasta o saldo que o cliente ganhou em devoluções. Sem
--     isto o crédito era gerado (customers.credit_balance) e ninguém
--     conseguia usar — a devolução ficava pela metade.
--   * transfer: TED/DOC, comum em compras maiores.
--   * surcharge_amount: acréscimo (entrega, juros, taxa repassada). É o
--     oposto do desconto e entra no total.
-- ============================================================================

ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_payment_method_check;
ALTER TABLE sales ADD CONSTRAINT sales_payment_method_check
    CHECK (payment_method IN ('cash','credit','debit','pix','mixed','crediario','store_credit','transfer'));

ALTER TABLE sale_payments DROP CONSTRAINT IF EXISTS sale_payments_method_check;
ALTER TABLE sale_payments ADD CONSTRAINT sale_payments_method_check
    CHECK (method IN ('cash','credit','debit','pix','crediario','store_credit','transfer'));

ALTER TABLE sales ADD COLUMN IF NOT EXISTS surcharge_amount DECIMAL(15,2) NOT NULL DEFAULT 0;

-- Delivery e financeiro aceitam os mesmos meios (colunas livres, sem CHECK)
