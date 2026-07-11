-- ============================================================================
-- Application role
-- The backend connects as `solucao_app` (NOT superuser, NOT BYPASSRLS).
-- RLS only filters non-privileged users — connecting as the admin role
-- bypasses every policy, which would defeat multi-tenant isolation.
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'solucao_app') THEN
        CREATE ROLE solucao_app LOGIN PASSWORD 'solucao_dev_pwd'
            NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION
            NOBYPASSRLS;
    END IF;
END $$;

GRANT CONNECT ON DATABASE solucao TO solucao_app;
GRANT USAGE ON SCHEMA public TO solucao_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO solucao_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO solucao_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO solucao_app;

-- Apply same grants to future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO solucao_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO solucao_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO solucao_app;

-- Allow the app role to set the session var
GRANT SET ON PARAMETER app.current_tenant_id TO solucao_app;
