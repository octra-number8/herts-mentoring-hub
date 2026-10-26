-- Self-registration for members held from an approved membership import, accounts
-- that follow membership status, and Lodge-level learning progress.

-- ===========================================================================
-- Self-registration (/join). Called only by the application's service role.
-- A member enters the email address held for him; if it identifies exactly one
-- current member, an activation link (an ordinary invitation, valid 24 hours)
-- is created for a Learner account. The page shows the same message whatever
-- the outcome, so the outcome never reaches the person asking.
-- ===========================================================================
create or replace function public.request_self_registration(p_org uuid, p_email text, p_token_hash text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_email text := lower(trim(coalesce(p_email, ''))); v_person record; v_account record; v_matches int; v_inv uuid; v_roles text[];
begin
  perform app.require(length(coalesce(p_token_hash, '')) = 64, 'Invalid invitation token');
  select count(*) into v_matches from public.persons p
   where p.org_id = p_org and p.email = v_email and p.status = 'active' and p.anonymised_at is null
     and exists (select 1 from public.lodge_memberships lm where lm.person_id = p.id and lm.left_on is null);
  -- No current member, or an address shared by more than one (the team sets those up by invitation).
  if v_matches <> 1 then return jsonb_build_object('outcome', case when v_matches = 0 then 'no_match' else 'shared_email' end); end if;

  select p.* into v_person from public.persons p
   where p.org_id = p_org and p.email = v_email and p.status = 'active' and p.anonymised_at is null
     and exists (select 1 from public.lodge_memberships lm where lm.person_id = p.id and lm.left_on is null);
  select * into v_account from public.user_accounts where person_id = v_person.id;

  if v_account.id is not null and v_account.status = 'active' then
    return jsonb_build_object('outcome', 'has_account', 'person_id', v_person.id, 'email', v_email);
  end if;
  if v_account.id is not null and v_account.status <> 'invited' then
    return jsonb_build_object('outcome', 'unavailable');
  end if;
  -- One link per member every five minutes.
  if exists (select 1 from public.invitations where person_id = v_person.id and invited_by is null
              and created_at > now() - interval '5 minutes' and accepted_at is null and revoked_at is null) then
    return jsonb_build_object('outcome', 'throttled');
  end if;

  if v_account.id is null then
    insert into public.user_accounts(org_id, person_id, status) values (p_org, v_person.id, 'invited') returning * into v_account;
    insert into public.role_assignments(org_id, account_id, role_id, reason)
    select p_org, v_account.id, r.id, 'Self-registration' from public.roles r where r.org_id = p_org and r.key = 'learner';
  end if;
  select coalesce(array_agg(distinct r.key), array['learner']) into v_roles
    from public.role_assignments ra join public.roles r on r.id = ra.role_id
   where ra.account_id = v_account.id and app.is_current(ra.starts_on, ra.ends_on);

  update public.invitations set revoked_at = now() where person_id = v_person.id and accepted_at is null and revoked_at is null;
  insert into public.invitations(org_id, person_id, email, role_keys, token_hash, expires_at)
  values (p_org, v_person.id, v_email, v_roles, p_token_hash, now() + interval '24 hours') returning id into v_inv;
  perform app.audit('invitation.self_requested', 'invitation', v_inv::text, jsonb_build_object('person_id', v_person.id), p_org);
  return jsonb_build_object('outcome', 'invited', 'invitation_id', v_inv, 'person_id', v_person.id, 'email', v_email, 'roles', v_roles);
end $$;
revoke all on function public.request_self_registration(uuid, text, text) from anon, authenticated, public;
grant execute on function public.request_self_registration(uuid, text, text) to service_role;

-- ===========================================================================
-- Accounts follow membership. When an import (or the team) records that a
-- member has resigned, ceased, been excluded or died, his account is suspended
-- and open links are withdrawn. If he is recorded as active again, an account
-- suspended this way is restored. Learning records are kept throughout.
-- ===========================================================================
create or replace function app.sync_account_with_membership() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status in ('resigned','ceased','deceased','excluded') then
    update public.user_accounts set status = 'suspended', status_reason = 'Membership ended (' || new.status || ')'
     where person_id = new.id and status in ('active','invited');
    update public.invitations set revoked_at = now() where person_id = new.id and accepted_at is null and revoked_at is null;
  elsif new.status = 'active' then
    update public.user_accounts set status = case when auth_user_id is null then 'invited' else 'active' end, status_reason = null
     where person_id = new.id and status = 'suspended' and status_reason like 'Membership ended (%';
  end if;
  return null;
end $$;
create trigger persons_account_sync after update of status on public.persons
  for each row when (new.status is distinct from old.status) execute function app.sync_account_with_membership();

-- ===========================================================================
-- Lodge learning: each current member of a Lodge, whether he has activated his
-- account, and his Academy courses (status, progress and completion only, never
-- answers, attempts or reflections). Visible to learning administrators, to
-- those who may read member detail for the Lodge (APGMen for allocated Lodges)
-- and to the Lodge's Lodge Mentors through the activated Lodge portal.
-- ===========================================================================
create or replace function app.can_read_lodge_learning(p_lodge uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select app.has_perm('learning.records.read')
      or app.can_on_lodge('members.read.detail', p_lodge)
      or p_lodge in (select app.portal_lodge_ids('read'))
$$;

create or replace function public.lodge_learning(p_lodge uuid)
returns table (person_id uuid, display_name text, account_status text, last_sign_in_at timestamptz, courses jsonb)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require(app.can_read_lodge_learning(p_lodge), 'Not permitted to see learning for this Lodge');
  return query
  select p.id, p.display_name, ua.status, ua.last_sign_in_at,
         coalesce((select jsonb_agg(jsonb_build_object(
                    'course_id', e.course_id, 'title', c.title, 'status', e.status, 'completed_at', e.completed_at,
                    'lessons_completed', (select count(*) from public.lesson_progress lp where lp.enrolment_id = e.id),
                    'lessons_required', (select count(*) from public.lessons ls join public.course_modules cm on cm.id = ls.module_id
                                          where cm.version_id = e.course_version_id and ls.required))
                    order by c.title)
                     from public.enrolments e join public.courses c on c.id = e.course_id
                    where e.person_id = p.id and e.status <> 'withdrawn'), '[]'::jsonb)
    from public.persons p
    left join public.user_accounts ua on ua.person_id = p.id
   where p.org_id = app.current_org_id() and p.status = 'active' and p.anonymised_at is null
     and (not p.is_restricted or app.has_perm('notes.leadership'))
     and exists (select 1 from public.lodge_memberships lm where lm.person_id = p.id and lm.lodge_id = p_lodge and lm.left_on is null)
   order by p.last_name, p.first_name;
end $$;
revoke all on function app.can_read_lodge_learning(uuid) from anon, public;
revoke all on function public.lodge_learning(uuid) from anon, public;
grant execute on function app.can_read_lodge_learning(uuid) to authenticated;
grant execute on function public.lodge_learning(uuid) to authenticated;
