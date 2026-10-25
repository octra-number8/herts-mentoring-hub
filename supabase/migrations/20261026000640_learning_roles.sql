-- Each learner's main Hub role, for learning reports grouped by role (brief 21.3).
-- Only for those who may read learning records.
create or replace function public.learning_person_roles() returns table(person_id uuid, role_name text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  perform app.require(app.has_any_perm(array['learning.records.read']), 'Not permitted');
  return query
  select distinct on (ua.person_id) ua.person_id, r.name
    from public.user_accounts ua
    join public.role_assignments ra on ra.account_id = ua.id and app.is_current(ra.starts_on, ra.ends_on)
    join public.roles r on r.id = ra.role_id
   where ua.org_id = app.current_org_id()
   order by ua.person_id, array_position(array['prov_grand_mentor','deputy_prov_grand_mentor','apgmen','learning_lead','prov_team','lodge_mentor','personal_mentor','ld_contributor','learner','tech_admin'], r.key);
end $$;
revoke execute on function public.learning_person_roles() from anon, public;
grant execute on function public.learning_person_roles() to authenticated;
