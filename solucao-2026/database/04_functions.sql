-- ============================================================================
-- SECURITY DEFINER functions
-- These run with the OWNER privileges (superuser) and bypass RLS so the
-- app role can perform lookups that need cross-tenant visibility, like
-- looking up which tenant a user belongs to during login.
--
-- Each function MUST be narrow (one specific purpose) and SECURITY-audited.
-- ============================================================================

-- Look up a user by email across all tenants. Used ONLY during login.
-- Returns the full row (including password_hash) so the backend can BCrypt-verify.
CREATE OR REPLACE FUNCTION app_find_user_for_login(p_email TEXT)
RETURNS TABLE (
    user_id        UUID,
    tenant_id      UUID,
    tenant_name    VARCHAR,
    tenant_active  BOOLEAN,
    name           VARCHAR,
    email          CITEXT,
    password_hash  TEXT,
    role           VARCHAR,
    is_active      BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT u.id, u.tenant_id, t.name, t.is_active,
           u.name, u.email, u.password_hash, u.role, u.is_active
    FROM users u
    JOIN tenants t ON t.id = u.tenant_id
    WHERE u.email = p_email::citext
    LIMIT 1
$$;

-- Mark last login timestamp without needing tenant context yet.
CREATE OR REPLACE FUNCTION app_touch_last_login(p_user_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    UPDATE users SET last_login_at = now() WHERE id = p_user_id
$$;

-- Look up a refresh token by its hash. Used during /api/auth/refresh, where
-- the backend doesn't yet know which tenant the request belongs to.
CREATE OR REPLACE FUNCTION app_find_refresh_token(p_hash TEXT)
RETURNS TABLE (
    user_id        UUID,
    tenant_id      UUID,
    expires_at     TIMESTAMPTZ,
    revoked_at     TIMESTAMPTZ,
    user_name      VARCHAR,
    user_email     CITEXT,
    user_role      VARCHAR,
    user_active    BOOLEAN,
    tenant_name    VARCHAR,
    tenant_active  BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT rt.user_id, rt.tenant_id, rt.expires_at, rt.revoked_at,
           u.name, u.email, u.role, u.is_active,
           t.name, t.is_active
    FROM refresh_tokens rt
    JOIN users u   ON u.id = rt.user_id
    JOIN tenants t ON t.id = rt.tenant_id
    WHERE rt.token_hash = p_hash
    LIMIT 1
$$;

-- Lock the functions down: revoke from PUBLIC, grant only to app role.
REVOKE ALL ON FUNCTION app_find_user_for_login(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_touch_last_login(UUID)     FROM PUBLIC;
REVOKE ALL ON FUNCTION app_find_refresh_token(TEXT)   FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION app_find_user_for_login(TEXT) TO solucao_app;
GRANT  EXECUTE ON FUNCTION app_touch_last_login(UUID)     TO solucao_app;
GRANT  EXECUTE ON FUNCTION app_find_refresh_token(TEXT)   TO solucao_app;
