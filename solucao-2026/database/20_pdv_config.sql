-- ============================================================================
-- 20. Configuração do PDV pelo administrador da loja
-- ============================================================================
--   * pdv_shortcuts: mapa JSON ação → tecla. Existe para a loja que vem de
--     outro sistema poder manter a musculatura do caixa — trocar de PDV já é
--     traumático, obrigar o operador a reaprender F2/F10 custa fila. NULL
--     significa "usar o padrão do sistema".
--
--   * allow_sale_without_stock: libera vender item com saldo zerado ou
--     insuficiente, mediante aval de gerente. Cenário real: a mercadoria está
--     na prateleira e a nota de entrada só chega dias depois; bloquear a venda
--     com o cliente na frente perde o negócio e não conserta o estoque.
--     Desligado por padrão — quem liga assume a divergência.
-- ============================================================================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pdv_shortcuts TEXT;

ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS allow_sale_without_stock BOOLEAN NOT NULL DEFAULT FALSE;
