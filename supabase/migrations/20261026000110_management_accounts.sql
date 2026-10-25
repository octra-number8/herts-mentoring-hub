-- Active Provincial (management) accounts for assignment pickers.
-- role_assignments is readable only for one's own account (or admins), so a
-- user-level query cannot tell which other accounts are Provincial team members.
-- This returns names and role names only, and only to management users.
create or replace function public.management_accounts()
returns table (id uuid, display_name text, roles text)
language sql stable security definer set search_path = public, pg_temp as $$
  select ua.id, p.display_name, string_agg(distinct r.name, ', ')
    from public.user_accounts ua
    join public.persons p on p.id = ua.person_id
    join public.role_assignments ra on ra.account_id = ua.id and app.is_current(ra.starts_on, ra.ends_on)
    join public.roles r on r.id = ra.role_id
   where ua.org_id = app.current_org_id() and ua.status = 'active' and app.has_perm('hub.access_management')
   group by ua.id, p.display_name
  having bool_or(r.is_management)
   order by p.display_name
$$;
revoke execute on function public.management_accounts() from anon, public;
grant execute on function public.management_accounts() to authenticated;
