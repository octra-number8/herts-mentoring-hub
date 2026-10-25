-- Effective session context for the application (navigation and UI only;
-- every read and write is still enforced by RLS and the definer functions).
create or replace function public.my_context() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when ua.id is null then null else jsonb_build_object(
    'account_id', ua.id,
    'person_id', ua.person_id,
    'org_id', ua.org_id,
    'status', ua.status,
    'mfa_required', ua.mfa_required,
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'display_name', p.display_name,
    'first_name', p.first_name,
    'email', p.email,
    'org', jsonb_build_object('name', o.name, 'short_name', o.short_name, 'slug', o.slug, 'settings', o.settings),
    'roles', coalesce((select jsonb_agg(distinct r.key) from public.role_assignments ra join public.roles r on r.id = ra.role_id
                        where ra.account_id = ua.id and app.is_current(ra.starts_on, ra.ends_on)), '[]'::jsonb),
    'permissions', coalesce((select jsonb_agg(p2.key order by p2.key) from public.permissions p2 where app.has_perm(p2.key)), '[]'::jsonb),
    'portal_lodge_ids', coalesce((select jsonb_agg(x) from app.portal_lodge_ids('read') x), '[]'::jsonb),
    'allocated_lodge_ids', coalesce((select jsonb_agg(x) from app.my_allocated_lodge_ids() x), '[]'::jsonb),
    'unread_notifications', (select count(*) from public.notifications n where n.account_id = ua.id and n.read_at is null)
  ) end
  from (select 1) d
  left join public.user_accounts ua on ua.auth_user_id = auth.uid() and ua.status = 'active'
  left join public.persons p on p.id = ua.person_id
  left join public.organisations o on o.id = ua.org_id
$$;
revoke execute on function public.my_context() from anon, public;
grant execute on function public.my_context() to authenticated;

-- Service-role only: set up a new organisation's defaults.
create or replace function public.admin_bootstrap_org(p_org uuid) returns void
language sql security definer set search_path = public, pg_temp as $$ select app.bootstrap_org(p_org) $$;
revoke execute on function public.admin_bootstrap_org(uuid) from anon, public, authenticated;
grant execute on function public.admin_bootstrap_org(uuid) to service_role;
