-- ============================================================================
-- 15. Grupo econômico (rede de lojas)
-- ============================================================================
--   Cada filial continua sendo um cliente independente — mesmo isolamento,
--   mesma assinatura por loja. O grupo apenas liga as lojas do mesmo dono,
--   permitindo que o funcionário alterne entre elas sem novo login.
--
--   Só a tabela `users` enxerga o grupo (o usuário precisa existir ao operar
--   em outra filial). Produtos, estoque, vendas, caixa e financeiro seguem
--   estritamente isolados por filial.
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenant_groups (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(255) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS group_id UUID
    REFERENCES tenant_groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tenants_group ON tenants(group_id) WHERE group_id IS NOT NULL;

-- Tenants visíveis na sessão atual: a própria loja e, havendo grupo, as irmãs.
-- SECURITY DEFINER porque consulta `tenants` para resolver o grupo; STABLE para
-- o planner avaliar uma vez por consulta, não por linha.
CREATE OR REPLACE FUNCTION app_group_tenants()
RETURNS UUID[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE(
        (SELECT ARRAY(SELECT id FROM tenants WHERE group_id = t.group_id)
           FROM tenants t
          WHERE t.id = app_current_tenant() AND t.group_id IS NOT NULL),
        ARRAY[app_current_tenant()]
    )
$$;

REVOKE ALL ON FUNCTION app_group_tenants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_group_tenants() TO solucao_app;

-- Leitura abrange o grupo (senão o usuário "some" ao operar noutra filial);
-- escrita continua restrita à loja atual — ninguém cria usuário na filial
-- vizinha sem estar dentro dela.
DROP POLICY IF EXISTS tenant_isolation ON users;
CREATE POLICY tenant_isolation ON users
    USING (tenant_id = ANY(app_group_tenants()))
    WITH CHECK (tenant_id = app_current_tenant());

GRANT SELECT ON tenant_groups TO solucao_app;
