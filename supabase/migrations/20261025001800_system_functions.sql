-- Service-role entry points used by background jobs. Not callable by users.

create or replace function app.generate_quarterly(p_org uuid, p_year int, p_quarter int) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_start date; v_end date; v_snap uuid; v_id uuid; v_existing record;
begin
  perform app.require(p_quarter between 1 and 4, 'Invalid quarter');
  v_start := make_date(p_year, (p_quarter - 1) * 3 + 1, 1);
  v_end := (v_start + interval '3 months' - interval '1 day')::date;
  select * into v_existing from public.quarterly_reports where org_id = p_org and year = p_year and quarter = p_quarter for update;
  perform app.require(v_existing.id is null or v_existing.status in ('draft','review'), 'This quarter''s report has been approved and cannot be regenerated');
  insert into public.report_snapshots(org_id, kind, period_start, period_end, data)
  values (p_org, 'quarterly', v_start, v_end, app.report_period_data(p_org, v_start, v_end)
            || jsonb_build_object('previous', app.report_period_data(p_org, (v_start - interval '3 months')::date, (v_start - interval '1 day')::date)))
  returning id into v_snap;
  insert into public.quarterly_reports(org_id, year, quarter, status, snapshot_id)
  values (p_org, p_year, p_quarter, 'draft', v_snap)
  on conflict (org_id, year, quarter) do update set snapshot_id = excluded.snapshot_id, generated_at = now(), generated_by = app.current_account_id()
  returning id into v_id;
  perform app.audit('quarterly_report.generated', 'quarterly_report', v_id::text, jsonb_build_object('year', p_year, 'quarter', p_quarter), p_org);
  return v_id;
end $$;

create or replace function public.report_generate_quarterly(p_year int, p_quarter int) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require(app.has_perm('reports.quarterly'), 'Not permitted');
  return app.generate_quarterly(app.current_org_id(), p_year, p_quarter);
end $$;

create or replace function public.admin_generate_quarterly(p_org uuid, p_year int, p_quarter int) returns uuid
language sql security definer set search_path = public, pg_temp as $$ select app.generate_quarterly(p_org, p_year, p_quarter) $$;

create or replace function public.admin_report_period_data(p_org uuid, p_start date, p_end date) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$ select app.report_period_data(p_org, p_start, p_end) $$;

create or replace function public.admin_notify(p_account uuid, p_type text, p_title text, p_body text default null, p_link text default null, p_dedupe text default null, p_essential boolean default false)
returns uuid language sql security definer set search_path = public, pg_temp as $$
  select app.notify(p_account, p_type, p_title, p_body, p_link, p_essential, p_dedupe)
$$;

-- Period data for the caller's own organisation (reports module, permission-checked).
create or replace function public.report_period_data(p_start date, p_end date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require(app.has_any_perm(array['reports.read','reports.quarterly']), 'Not permitted');
  return app.report_period_data(app.current_org_id(), p_start, p_end);
end $$;

revoke execute on function public.admin_generate_quarterly(uuid, int, int) from anon, public, authenticated;
revoke execute on function public.admin_report_period_data(uuid, date, date) from anon, public, authenticated;
revoke execute on function public.admin_notify(uuid, text, text, text, text, text, boolean) from anon, public, authenticated;
grant execute on function public.admin_generate_quarterly(uuid, int, int) to service_role;
grant execute on function public.admin_report_period_data(uuid, date, date) to service_role;
grant execute on function public.admin_notify(uuid, text, text, text, text, text, boolean) to service_role;
revoke execute on function public.report_period_data(date, date) from anon, public;
grant execute on function public.report_period_data(date, date) to authenticated;

-- Exports are always audited (who, what, how many, which filters).
create or replace function public.log_export(p_dataset text, p_format text, p_rows int, p_filters jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require(app.current_account_id() is not null, 'Not signed in');
  perform app.audit('export', 'dataset', p_dataset, jsonb_build_object('format', p_format, 'rows', p_rows, 'filters', p_filters - 'person'));
end $$;
revoke execute on function public.log_export(text, text, int, jsonb) from anon, public;
grant execute on function public.log_export(text, text, int, jsonb) to authenticated;
