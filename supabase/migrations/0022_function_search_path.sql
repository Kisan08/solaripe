-- Supabase Advisor: "Function Search Path Mutable" on public.set_tenant_id()
-- and public.set_tenant_id_from_client(). Neither is SECURITY DEFINER and
-- both only touch NEW.* and schema-qualified auth.uid()/public.clients, so
-- there's no known exploit path today — but an unset search_path means a
-- session that creates objects earlier in its own search_path could still
-- shadow an unqualified reference added here later without anyone
-- noticing. ALTER FUNCTION ... SET search_path pins it without touching
-- the function body, so behavior is unchanged; only name resolution is
-- locked down. Additive, no data change. Review before applying to
-- production, same as 0021.
begin;
alter function public.set_tenant_id() set search_path = public, pg_temp;
alter function public.set_tenant_id_from_client() set search_path = public, pg_temp;
commit;
