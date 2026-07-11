-- ============================================================================
-- 09. Cadastro de tenant (onboarding self-service)
-- ============================================================================
--   * O role solucao_app não pode inserir em users sem contexto de tenant
--     (RLS), e o contexto ainda não existe durante o cadastro. A função
--     SECURITY DEFINER cria tenant + usuário admin atomicamente, no mesmo
--     padrão do 04_functions.sql.
--   * O e-mail é único GLOBALMENTE (não só por tenant): o login usa
--     app_find_user_for_login com LIMIT 1 por e-mail, então e-mail repetido
--     em outro tenant tornaria uma das contas inacessível.
-- ============================================================================

CREATE OR REPLACE FUNCTION app_register_tenant(
    p_tenant_name   VARCHAR,
    p_cnpj          VARCHAR,
    p_user_name     VARCHAR,
    p_email         TEXT,
    p_password_hash TEXT
)
RETURNS TABLE (tenant_id UUID, user_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tenant_id UUID;
    v_user_id   UUID;
BEGIN
    IF EXISTS (SELECT 1 FROM tenants t WHERE regexp_replace(t.cnpj, '\D', '', 'g') = regexp_replace(p_cnpj, '\D', '', 'g')) THEN
        RAISE EXCEPTION 'cnpj_taken';
    END IF;

    IF EXISTS (SELECT 1 FROM users u WHERE u.email = p_email::citext) THEN
        RAISE EXCEPTION 'email_taken';
    END IF;

    INSERT INTO tenants (name, cnpj)
    VALUES (p_tenant_name, p_cnpj)
    RETURNING id INTO v_tenant_id;

    INSERT INTO users (tenant_id, name, email, password_hash, role)
    VALUES (v_tenant_id, p_user_name, p_email::citext, p_password_hash, 'admin')
    RETURNING id INTO v_user_id;

    RETURN QUERY SELECT v_tenant_id, v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION app_register_tenant(VARCHAR, VARCHAR, VARCHAR, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_register_tenant(VARCHAR, VARCHAR, VARCHAR, TEXT, TEXT) TO solucao_app;
