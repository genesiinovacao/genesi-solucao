-- ============================================================================
-- 22. Suporte redefinir a senha de um usuário do cliente
-- ============================================================================
--   A tabela users tem RLS e o superadmin opera a partir do tenant plataforma,
--   então ele não enxerga usuário de cliente nenhum pela conexão normal —
--   mesmo motivo pelo qual o cadastro de cliente já passa por
--   app_register_tenant. Duas funções SECURITY DEFINER, ambas exigindo o
--   tenant_id junto do alvo: assim um id trocado por engano não atinge usuário
--   de outra loja.
--
--   Quem pode chamar é decidido na API ([Authorize(Roles="superadmin")]).
--   Estas funções não conferem papel — elas são a porta, não a fechadura.
-- ============================================================================

-- Usuários de um cliente, para o suporte escolher quem vai ter a senha trocada.
-- Nunca devolve o hash: a tela não precisa dele e o que não trafega não vaza.
CREATE OR REPLACE FUNCTION app_admin_list_tenant_users(p_tenant_id UUID)
RETURNS TABLE (
    user_id    UUID,
    name       VARCHAR,
    email      CITEXT,
    role       VARCHAR,
    is_active  BOOLEAN,
    last_login TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT u.id, u.name, u.email, u.role, u.is_active, u.last_login_at
    FROM users u
    WHERE u.tenant_id = p_tenant_id
      AND u.role <> 'superadmin'          -- conta da plataforma não se mexe daqui
    ORDER BY
      CASE u.role WHEN 'admin' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END,
      u.name
$$;

-- Redefine a senha e derruba as sessões abertas, na mesma transação.
-- Devolve o e-mail atingido para a API registrar na auditoria; NULL quer dizer
-- que o par (usuário, cliente) não existe.
CREATE OR REPLACE FUNCTION app_admin_reset_user_password(
    p_user_id       UUID,
    p_tenant_id     UUID,
    p_password_hash TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_email TEXT;
BEGIN
    UPDATE users
       SET password_hash = p_password_hash,
           is_active     = TRUE,
           updated_at    = now()
     WHERE id = p_user_id
       AND tenant_id = p_tenant_id
       AND role <> 'superadmin'
    RETURNING email::text INTO v_email;

    IF v_email IS NULL THEN
        RETURN NULL;
    END IF;

    -- Sessão antiga não sobrevive à troca: quem tinha o refresh token
    -- continuaria dentro com a senha que acabou de ser substituída.
    UPDATE refresh_tokens
       SET revoked_at = now()
     WHERE user_id = p_user_id
       AND revoked_at IS NULL;

    RETURN v_email;
END;
$$;

REVOKE ALL ON FUNCTION app_admin_list_tenant_users(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_admin_list_tenant_users(UUID) TO solucao_app;

REVOKE ALL ON FUNCTION app_admin_reset_user_password(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_admin_reset_user_password(UUID, UUID, TEXT) TO solucao_app;
