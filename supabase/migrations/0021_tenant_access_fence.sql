-- Additive defense in depth. Review against staging before applying to production.
-- No application rows are deleted or transformed. Never rerun 0004/0005 to apply this.
begin;
do $$
declare target_table text;
begin
  foreach target_table in array array[
    'leads', 'projects', 'designs', 'settings', 'clients', 'call_sessions', 'call_logs',
    'lead_quotes', 'tenant_pipeline_stages', 'project_pipeline_history',
    'tenant_client_logos', 'tenant_testimonials', 'tenant_certifications', 'tenant_projects'
  ] loop
    if not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = target_table and c.column_name = 'tenant_id'
    ) then
      raise exception 'Missing tenant table/column: public.%.tenant_id; inspect migration history first', target_table;
    end if;
    execute format('alter table public.%I enable row level security', target_table);
    execute format('alter table public.%I force row level security', target_table);
    execute format('revoke all on public.%I from anon', target_table);
    execute format('drop policy if exists tenant_access_fence on public.%I', target_table);
    execute format(
      'create policy tenant_access_fence on public.%I as restrictive for all to authenticated using ((select auth.uid()) = tenant_id) with check ((select auth.uid()) = tenant_id)',
      target_table
    );
  end loop;
end $$;
commit;
