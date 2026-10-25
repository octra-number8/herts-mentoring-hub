-- Business functions: allocations, appointments, cases, accounts, communications, documents.

-- Account currently linked to a person (active only).
create or replace function app.account_of(p_person uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select id from public.user_accounts where person_id = p_person and status = 'active'
$$;

-- Does a (different) account currently hold a permission through roles or grants?
-- Used to validate allocations and routing; never used for the caller's own access.
create or replace function app.account_holds(p_account uuid, p_perm text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.role_assignments ra join public.role_permissions rp on rp.role_id = ra.role_id
                  where ra.account_id = p_account and rp.permission_key = p_perm and app.is_current(ra.starts_on, ra.ends_on))
      or exists (select 1 from public.permission_grants g
                  where g.account_id = p_account and g.permission_key = p_perm and app.is_current(g.starts_on, g.ends_on))
$$;

create or replace function app.allocated_lodges_of(p_person uuid, p_at date default current_date) returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select la.lodge_id from public.lodge_allocations la
   where la.person_id = p_person and app.is_current(la.starts_on, la.ends_on, p_at)
     and app.account_holds(app.account_of(p_person), 'lodges.write.allocated')
$$;

create or replace function app.allocated_apgmen_account(p_lodge uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select ua.id from public.lodge_allocations la
    join public.user_accounts ua on ua.person_id = la.person_id and ua.status = 'active'
   where la.lodge_id = p_lodge and app.is_current(la.starts_on, la.ends_on)
     and app.account_holds(ua.id, 'lodges.write.allocated')
   order by (la.kind = 'cover') desc, la.starts_on desc limit 1
$$;

-- ===========================================================================
-- Allocations
-- ===========================================================================
create or replace function public.allocate_lodge(p_lodge uuid, p_person uuid, p_kind text default 'primary',
  p_starts date default current_date, p_ends date default null, p_reason text default null, p_transfer_open_work boolean default true)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid; v_prev record; v_id uuid; v_new_account uuid; v_area uuid; v_tasks int := 0; v_cases int := 0;
begin
  perform app.require(app.has_perm('allocations.manage'), 'Not permitted to manage allocations');
  select org_id into v_org from public.lodges where id = p_lodge and org_id = app.current_org_id();
  perform app.require(v_org is not null, 'Lodge not found');
  perform app.require(p_kind in ('primary','cover'), 'Invalid allocation type');
  v_new_account := app.account_of(p_person);
  perform app.require(v_new_account is not null and app.account_holds(v_new_account, 'lodges.write.allocated'),
                      'Lodges can only be allocated to someone who currently holds an Assistant Provincial Grand Mentor role');
  perform app.require(p_kind = 'primary' or p_ends is not null, 'Temporary cover needs an end date');
  select area_id into v_area from public.provincial_appointments
   where person_id = p_person and office = 'apgmen' and app.is_current(starts_on, ends_on) limit 1;

  if p_kind = 'primary' then
    select * into v_prev from public.lodge_allocations where lodge_id = p_lodge and kind = 'primary' and ends_on is null for update;
    if v_prev.id is not null then
      perform app.require(v_prev.person_id <> p_person, 'This Lodge is already allocated to that person');
      update public.lodge_allocations set ends_on = greatest(p_starts - 1, v_prev.starts_on - 1) where id = v_prev.id;
    end if;
  end if;

  insert into public.lodge_allocations(org_id, lodge_id, person_id, area_id, kind, starts_on, ends_on, reason, recorded_by)
  values (v_org, p_lodge, p_person, v_area, p_kind, p_starts, p_ends, p_reason, app.current_account_id())
  returning id into v_id;

  if p_kind = 'primary' and p_transfer_open_work and v_prev.id is not null then
    update public.tasks set owner_account_id = v_new_account
     where lodge_id = p_lodge and status in ('open','in_progress','waiting')
       and owner_account_id = (select id from public.user_accounts where person_id = v_prev.person_id);
    get diagnostics v_tasks = row_count;
    update public.cases set owner_account_id = v_new_account
     where lodge_id = p_lodge and kind = 'request' and status not in ('closed','resolved')
       and owner_account_id = (select id from public.user_accounts where person_id = v_prev.person_id);
    get diagnostics v_cases = row_count;
  end if;

  perform app.notify(v_new_account, 'allocation', 'Lodge allocated to you',
    (select name || ' No. ' || number from public.lodges where id = p_lodge) ||
      case when p_kind = 'cover' then ' (temporary cover until ' || to_char(p_ends, 'DD Mon YYYY') || ')' else '' end,
    '/lodges/' || p_lodge, false, 'allocation:' || v_id);
  perform app.emit(v_org, 'lodge.reallocated', 'lodge', p_lodge,
    jsonb_build_object('allocation_id', v_id, 'kind', p_kind, 'to_person', p_person, 'from_person', v_prev.person_id,
                       'tasks_transferred', v_tasks, 'cases_transferred', v_cases));
  return v_id;
end $$;

-- p_effective: the first day the allocation no longer applies.
create or replace function public.end_allocation(p_allocation uuid, p_effective date default current_date) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require(app.has_perm('allocations.manage'), 'Not permitted to manage allocations');
  update public.lodge_allocations set ends_on = greatest(p_effective - 1, starts_on - 1)
   where id = p_allocation and org_id = app.current_org_id() and (ends_on is null or ends_on >= p_effective);
end $$;

-- An Assistant leaving the appointment: end roles and allocations together so no
-- stale access remains. Open work is left for reallocation and reported back.
-- p_effective: the first day the appointment no longer applies (default: now).
create or replace function public.end_provincial_appointment(p_person uuid, p_effective date default current_date, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_account uuid; v_lodges int; v_roles int;
begin
  perform app.require(app.has_perm('allocations.manage') and app.has_perm('admin.roles'), 'Not permitted');
  select id into v_account from public.user_accounts where person_id = p_person and org_id = app.current_org_id();
  update public.provincial_appointments set ends_on = greatest(p_effective - 1, starts_on - 1) where person_id = p_person and ends_on is null and org_id = app.current_org_id();
  update public.lodge_allocations set ends_on = greatest(p_effective - 1, starts_on - 1)
   where person_id = p_person and org_id = app.current_org_id() and (ends_on is null or ends_on >= p_effective);
  get diagnostics v_lodges = row_count;
  update public.role_assignments ra set ends_on = greatest(p_effective - 1, ra.starts_on - 1), reason = coalesce(p_reason, ra.reason)
    from public.roles r
   where r.id = ra.role_id and ra.account_id = v_account and r.is_management and (ra.ends_on is null or ra.ends_on >= p_effective);
  get diagnostics v_roles = row_count;
  perform app.audit('provincial_appointment.ended', 'person', p_person::text, jsonb_build_object('lodges', v_lodges, 'roles', v_roles, 'reason', p_reason));
  return jsonb_build_object('allocations_ended', v_lodges, 'roles_ended', v_roles,
    'open_tasks', (select count(*) from public.tasks where owner_account_id = v_account and status in ('open','in_progress','waiting')),
    'open_cases', (select count(*) from public.cases where owner_account_id = v_account and status not in ('closed','resolved')));
end $$;

create or replace function public.transfer_open_work(p_from_account uuid, p_to_account uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tasks int; v_cases int;
begin
  perform app.require(app.has_perm('allocations.manage') or app.has_perm('tasks.manage_all'), 'Not permitted');
  perform app.require(exists (select 1 from public.user_accounts where id = p_to_account and org_id = app.current_org_id() and status = 'active'), 'Recipient account is not active');
  update public.tasks set owner_account_id = p_to_account
   where owner_account_id = p_from_account and org_id = app.current_org_id() and status in ('open','in_progress','waiting');
  get diagnostics v_tasks = row_count;
  update public.cases set owner_account_id = p_to_account
   where owner_account_id = p_from_account and org_id = app.current_org_id() and kind = 'request' and status not in ('closed','resolved');
  get diagnostics v_cases = row_count;
  perform app.audit('work.transferred', 'user_account', p_from_account::text, jsonb_build_object('to', p_to_account, 'tasks', v_tasks, 'cases', v_cases, 'reason', p_reason));
  perform app.notify(p_to_account, 'transfer', 'Work transferred to you', v_tasks || ' tasks and ' || v_cases || ' support requests', '/tasks', false, null);
  return jsonb_build_object('tasks', v_tasks, 'cases', v_cases);
end $$;

-- ===========================================================================
-- Lodge appointments (e.g. a new Lodge Mentor)
-- ===========================================================================
create or replace function public.record_lodge_appointment(p_lodge uuid, p_office text, p_person uuid,
  p_starts date default current_date, p_confirmed boolean default true) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid; v_prev record; v_id uuid; v_apgmen uuid; v_prev_account uuid; v_moved int := 0;
begin
  select org_id into v_org from public.lodges where id = p_lodge and org_id = app.current_org_id();
  perform app.require(v_org is not null, 'Lodge not found');
  perform app.require(app.can_on_lodge('lodges.write', p_lodge), 'Not permitted to update this Lodge');
  perform app.require(p_person is null or exists (select 1 from public.persons where id = p_person and org_id = v_org), 'Unknown person');

  select * into v_prev from public.lodge_appointments
   where lodge_id = p_lodge and office = p_office and ends_on is null order by starts_on desc limit 1 for update;
  if v_prev.id is not null then
    perform app.require(v_prev.person_id is distinct from p_person, 'That person already holds this office');
    update public.lodge_appointments set ends_on = greatest(p_starts - 1, v_prev.starts_on - 1) where id = v_prev.id;
  end if;
  insert into public.lodge_appointments(org_id, lodge_id, office, person_id, confirmed, starts_on, recorded_by)
  values (v_org, p_lodge, p_office, p_person, p_confirmed, p_starts, app.current_account_id())
  returning id into v_id;

  if p_office = 'lodge_mentor' then
    v_apgmen := app.allocated_apgmen_account(p_lodge);
    -- Open work held by the previous Lodge Mentor for this Lodge moves to the allocated APGMen.
    if v_prev.person_id is not null and v_apgmen is not null then
      select id into v_prev_account from public.user_accounts where person_id = v_prev.person_id;
      update public.tasks set owner_account_id = v_apgmen
       where lodge_id = p_lodge and owner_account_id = v_prev_account and status in ('open','in_progress','waiting');
      get diagnostics v_moved = row_count;
    end if;
    perform app.notify(v_apgmen, 'lodge_mentor_change', 'Lodge Mentor change recorded',
      (select name || ' No. ' || number from public.lodges where id = p_lodge), '/lodges/' || p_lodge, false, 'lm-change:' || v_id);
    perform app.emit(v_org, 'lodge.mentor_changed', 'lodge', p_lodge,
      jsonb_build_object('appointment_id', v_id, 'previous_person', v_prev.person_id, 'new_person', p_person, 'tasks_moved', v_moved));
  end if;
  return v_id;
end $$;

-- ===========================================================================
-- Cases
-- ===========================================================================
create or replace function public.case_escalate(p_case uuid, p_to_account uuid, p_note text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare c record;
begin
  perform app.require(app.can_manage_case(p_case), 'Not permitted');
  select * into c from public.cases where id = p_case for update;
  perform app.require(exists (select 1 from public.user_accounts where id = p_to_account and org_id = c.org_id and status = 'active'), 'Unknown recipient');
  perform app.require(c.kind = 'request' or app.account_holds(p_to_account, 'cases.confidential.triage'),
                      'Confidential concerns can only be escalated to designated Provincial leadership');
  update public.cases set status = 'escalated', escalated_to_account_id = p_to_account where id = p_case;
  insert into public.case_events(org_id, case_id, kind, body, data, created_by)
  values (c.org_id, p_case, 'escalation', p_note, jsonb_build_object('to', p_to_account), app.current_account_id());
  perform app.notify(p_to_account, 'case_escalated', 'Support request escalated to you', c.reference, '/support/' || p_case, true, 'escalate:' || p_case || ':' || p_to_account);
  perform app.emit(c.org_id, 'case.escalated', 'case', p_case, jsonb_build_object('to', p_to_account));
end $$;

-- Triage of a confidential concern by designated leadership: assign, or refer
-- to an existing authorised procedure (e.g. welfare, safeguarding) and close here.
create or replace function public.case_triage(p_case uuid, p_action text, p_owner uuid default null, p_referred_to text default null, p_note text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare c record;
begin
  select * into c from public.cases where id = p_case and org_id = app.current_org_id() for update;
  perform app.require(c.kind = 'confidential' and app.has_perm('cases.confidential.triage'), 'Not permitted');
  if p_action = 'assign' then
    perform app.require(p_owner is not null, 'Choose who should handle this concern');
    perform app.require(app.account_holds(p_owner, 'hub.access_management'), 'Confidential concerns can only be assigned to Provincial team members');
    update public.cases set owner_account_id = p_owner, status = 'assigned' where id = p_case;
    insert into public.access_grants(org_id, entity_type, entity_id, account_id, granted_by, reason)
    values (c.org_id, 'case', p_case, p_owner, app.current_account_id(), coalesce(p_note, 'Assigned at triage'));
    perform app.notify(p_owner, 'case_assigned', 'A confidential concern has been assigned to you', c.reference, '/support/' || p_case, true, 'triage:' || p_case);
  elsif p_action = 'refer' then
    perform app.require(length(trim(coalesce(p_referred_to,''))) > 0, 'Record where the concern was referred');
    update public.cases set status = 'referred', referred_to = p_referred_to, closed_at = now() where id = p_case;
  elsif p_action = 'close' then
    update public.cases set status = 'closed', outcome = coalesce(p_note, outcome) where id = p_case;
  else
    raise exception using errcode = 'P0001', message = 'Unknown triage action';
  end if;
  insert into public.case_events(org_id, case_id, kind, body, data, created_by)
  values (c.org_id, p_case, case p_action when 'refer' then 'referral' when 'assign' then 'assignment' else 'outcome' end,
          p_note, jsonb_build_object('action', p_action, 'owner', p_owner, 'referred_to', p_referred_to), app.current_account_id());
end $$;

create or replace function public.case_grant_access(p_case uuid, p_account uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare c record;
begin
  select * into c from public.cases where id = p_case and org_id = app.current_org_id();
  perform app.require(c.id is not null and (
    (c.kind = 'confidential' and app.has_perm('cases.confidential.triage')) or (c.kind = 'request' and app.can_manage_case(p_case))), 'Not permitted');
  perform app.require(length(trim(coalesce(p_reason,''))) >= 5, 'Record the reason for granting access');
  insert into public.access_grants(org_id, entity_type, entity_id, account_id, granted_by, reason)
  values (c.org_id, 'case', p_case, p_account, app.current_account_id(), p_reason);
  insert into public.case_events(org_id, case_id, kind, body, data, created_by)
  values (c.org_id, p_case, 'access', p_reason, jsonb_build_object('granted_to', p_account), app.current_account_id());
end $$;

-- Record access to sensitive records (called when a confidential case or restricted note is opened).
create or replace function public.log_sensitive_access(p_entity_type text, p_entity_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require(app.current_account_id() is not null, 'Not signed in');
  if (p_entity_type = 'case' and app.can_read_case(p_entity_id)) or (p_entity_type = 'note' and app.can_read_note(p_entity_id))
     or (p_entity_type = 'person') then
    perform app.audit('sensitive.viewed', p_entity_type, p_entity_id::text);
  end if;
end $$;

-- ===========================================================================
-- Accounts
-- ===========================================================================
create or replace function public.record_sign_in() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_account uuid;
begin
  select id into v_account from public.user_accounts where auth_user_id = auth.uid();
  if v_account is null then return; end if;
  update public.user_accounts set last_sign_in_at = now() where id = v_account;
  perform app.audit('auth.sign_in', 'user_account', v_account::text, jsonb_build_object('aal', auth.jwt() ->> 'aal'),
                    (select org_id from public.user_accounts where id = v_account));
end $$;

create or replace function public.account_set_status(p_account uuid, p_status text, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v record;
begin
  perform app.require(app.has_perm('admin.users'), 'Not permitted');
  perform app.require(p_status in ('active','suspended','deactivated'), 'Invalid status');
  select * into v from public.user_accounts where id = p_account and org_id = app.current_org_id() for update;
  perform app.require(v.id is not null, 'Account not found');
  perform app.require(v.id <> app.current_account_id(), 'You cannot change the status of your own account');
  perform app.require(v.status <> 'invited' or p_status <> 'active', 'Invited accounts become active when the invitation is accepted');
  update public.user_accounts set status = p_status, status_reason = p_reason where id = p_account;
  if p_status = 'deactivated' then
    update public.role_assignments set ends_on = greatest(current_date - 1, starts_on - 1)
     where account_id = p_account and (ends_on is null or ends_on >= current_date);
    update public.permission_grants set ends_on = greatest(current_date - 1, starts_on - 1)
     where account_id = p_account and (ends_on is null or ends_on >= current_date);
    update public.feature_activations set active = false, deactivated_at = now() where account_id = p_account and active;
  end if;
  perform app.audit('account.' || p_status, 'user_account', p_account::text, jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.feature_set_activation(p_feature text, p_scope text, p_target uuid, p_actions jsonb, p_active boolean, p_reason text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_org uuid := app.current_org_id();
begin
  perform app.require(app.has_perm('admin.features'), 'Not permitted to change feature activation');
  perform app.require(length(trim(coalesce(p_reason,''))) >= 5, 'Record the reason for this change');
  if p_active then
    insert into public.feature_activations(org_id, feature_key, scope_type, account_id, lodge_id, role_id, actions, activated_by, reason)
    values (v_org, p_feature, p_scope,
            case when p_scope = 'account' then p_target end,
            case when p_scope = 'lodge' then p_target end,
            case when p_scope = 'role' then p_target end,
            coalesce(p_actions, '{"read":true}'::jsonb), app.current_account_id(), p_reason)
    returning id into v_id;
  else
    update public.feature_activations set active = false, deactivated_at = now()
     where org_id = v_org and feature_key = p_feature and scope_type = p_scope and active
       and coalesce(account_id, lodge_id, role_id) = p_target;
  end if;
  perform app.audit('feature.' || case when p_active then 'activated' else 'deactivated' end, 'feature', p_feature,
                    jsonb_build_object('scope', p_scope, 'target', p_target, 'actions', p_actions, 'reason', p_reason));
  return v_id;
end $$;

-- ===========================================================================
-- Communications
-- ===========================================================================

-- Resolve a campaign's audience. Allocated-scope campaigns are limited to the
-- creator's allocated Lodges whoever runs the preview.
create or replace function app.campaign_audience(p_campaign uuid)
returns table(person_id uuid, email citext, name text, excluded_reason text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare c record; f jsonb; v_creator_person uuid;
begin
  select * into c from public.campaigns where id = p_campaign;
  f := coalesce(c.audience -> 'filters', '{}'::jsonb);
  select person_id into v_creator_person from public.user_accounts where id = c.created_by;
  return query
  with lodge_scope as (
    select l.id from public.lodges l
     where l.org_id = c.org_id
       and (c.scope = 'province' or l.id in (select app.allocated_lodges_of(v_creator_person)))
       and (not f ? 'lodge_ids' or l.id = any (array(select jsonb_array_elements_text(f->'lodge_ids'))::uuid[]))
       and (not f ? 'area_ids' or exists (select 1 from public.lodge_allocations la where la.lodge_id = l.id
              and app.is_current(la.starts_on, la.ends_on) and la.area_id = any (array(select jsonb_array_elements_text(f->'area_ids'))::uuid[])))
  ),
  base as (
    select distinct p.id
      from public.persons p
     where p.org_id = c.org_id
       and (
         -- members of in-scope Lodges
         exists (select 1 from public.lodge_memberships m where m.person_id = p.id and m.left_on is null and m.lodge_id in (select id from lodge_scope))
         -- office holders in in-scope Lodges
         or exists (select 1 from public.lodge_appointments a where a.person_id = p.id and app.is_current(a.starts_on, a.ends_on) and a.lodge_id in (select id from lodge_scope))
         -- province scope may also reach Provincial team members and learners without a Lodge link
         or (c.scope = 'province' and not (f ? 'lodge_ids' or f ? 'area_ids') and exists (select 1 from public.user_accounts ua where ua.person_id = p.id and ua.status = 'active'))
       )
       and (not f ? 'offices' or exists (select 1 from public.lodge_appointments a where a.person_id = p.id and app.is_current(a.starts_on, a.ends_on)
              and a.office = any (array(select jsonb_array_elements_text(f->'offices'))) and a.lodge_id in (select id from lodge_scope)))
       and (not f ? 'roles' or exists (select 1 from public.user_accounts ua join public.role_assignments ra on ra.account_id = ua.id
              join public.roles r on r.id = ra.role_id where ua.person_id = p.id and app.is_current(ra.starts_on, ra.ends_on)
              and r.key = any (array(select jsonb_array_elements_text(f->'roles')))))
       and (not f ? 'stages' or exists (select 1 from public.member_journeys j where j.person_id = p.id
              and j.stage = any (array(select jsonb_array_elements_text(f->'stages')))))
       and (not f ? 'initiated_from' or exists (select 1 from public.degree_events d where d.person_id = p.id and d.kind = 'initiation'
              and d.event_date >= (f->>'initiated_from')::date and d.event_date <= coalesce((f->>'initiated_to')::date, current_date)))
       and (not f ? 'enrolled_course_id' or exists (select 1 from public.enrolments e where e.person_id = p.id and e.course_id = (f->>'enrolled_course_id')::uuid and e.status <> 'withdrawn'))
       and (not f ? 'completed_course_id' or exists (select 1 from public.enrolments e where e.person_id = p.id and e.course_id = (f->>'completed_course_id')::uuid and e.status = 'completed'))
       and (not f ? 'not_completed_course_id' or not exists (select 1 from public.enrolments e where e.person_id = p.id and e.course_id = (f->>'not_completed_course_id')::uuid and e.status = 'completed'))
       and (not f ? 'event_id' or exists (select 1 from public.registrations r where r.person_id = p.id and r.event_id = (f->>'event_id')::uuid
              and r.status = any (coalesce(array(select jsonb_array_elements_text(f->'event_statuses')), array['confirmed','attended']))))
  ),
  candidates as (
    select p.id from base b join public.persons p on p.id = b.id
    union
    -- manual inclusions still respect scope for allocated campaigns
    select p.id from public.persons p
     where p.org_id = c.org_id and p.id = any (array(select jsonb_array_elements_text(coalesce(c.audience->'include','[]'::jsonb)))::uuid[])
       and (c.scope = 'province' or exists (select 1 from public.lodge_memberships m where m.person_id = p.id and m.left_on is null
             and m.lodge_id in (select app.allocated_lodges_of(v_creator_person))))
  ),
  evaluated as (
    select p.id as person_id, p.email, p.display_name as name,
      case
        when p.id = any (array(select jsonb_array_elements_text(coalesce(c.audience->'exclude','[]'::jsonb)))::uuid[]) then 'Manually excluded'
        when p.email is null then 'No email address'
        when p.status <> 'active' then 'Membership not active'
        when p.anonymised_at is not null then 'Record anonymised'
        when cp.email_status in ('bounced','complained','invalid') then 'Email undeliverable (' || cp.email_status || ')'
        when c.category <> 'operational' and cp.unsubscribed_all_at is not null then 'Unsubscribed'
        when c.category = 'learning' and cp.learning = false then 'Preference: no learning emails'
        when c.category = 'events' and cp.events = false then 'Preference: no event emails'
        when c.category = 'news' and coalesce(cp.news, false) = false then 'Not opted in to news'
        else null end as excluded_reason,
      row_number() over (partition by lower(p.email::text) order by p.created_at) as rn
    from candidates x join public.persons p on p.id = x.id
    left join public.comm_preferences cp on cp.person_id = p.id
  )
  select e.person_id, e.email, e.name,
         case when e.excluded_reason is null and e.rn > 1 then 'Duplicate email address' else e.excluded_reason end
    from evaluated e;
end $$;

create or replace function public.campaign_preview_audience(p_campaign uuid)
returns table(person_id uuid, email citext, name text, excluded_reason text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  perform app.require(exists (select 1 from public.campaigns c where c.id = p_campaign and c.org_id = app.current_org_id()
    and app.has_perm('comms.use') and (c.created_by = app.current_account_id() or app.has_perm('comms.approve'))), 'Not permitted');
  return query select a.person_id, a.email, a.name, a.excluded_reason from app.campaign_audience(p_campaign) a order by a.excluded_reason nulls first, a.name;
end $$;

create or replace function app.campaign_needs_approval(c public.campaigns) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select case when c.scope = 'province' then true
              else coalesce((select (settings->'comms'->>'allocated_requires_approval')::boolean from public.organisations where id = c.org_id), false) end
$$;

create or replace function app.snapshot_recipients(p_campaign uuid) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare v int;
begin
  delete from public.campaign_recipients where campaign_id = p_campaign;
  insert into public.campaign_recipients(campaign_id, person_id, email, name, status, exclusion_reason)
  select p_campaign, a.person_id, coalesce(a.email, 'no-email+' || a.person_id || '@invalid'), a.name,
         case when a.excluded_reason is null then 'queued' else 'excluded' end, a.excluded_reason
    from app.campaign_audience(p_campaign) a
  on conflict (campaign_id, email) do nothing;
  select count(*) into v from public.campaign_recipients where campaign_id = p_campaign and status = 'queued';
  update public.campaigns set recipient_count = v where id = p_campaign;
  return v;
end $$;

create or replace function public.campaign_submit(p_campaign uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.campaigns; v_count int; v_approvers uuid;
begin
  select * into c from public.campaigns where id = p_campaign and org_id = app.current_org_id() for update;
  perform app.require(c.id is not null and c.created_by = app.current_account_id(), 'Not permitted');
  perform app.require(c.status = 'draft', 'Only drafts can be submitted');
  perform app.require(length(trim(c.subject)) > 0 and length(trim(c.body_markdown)) > 0, 'Add a subject and message first');
  perform app.require((c.scope = 'allocated' and app.has_perm('comms.send.allocated')) or (c.scope = 'province' and app.has_perm('comms.send.province')), 'Not permitted to send to this audience');
  v_count := app.snapshot_recipients(p_campaign);
  perform app.require(v_count > 0, 'The audience has no eligible recipients');
  if app.campaign_needs_approval(c) then
    update public.campaigns set status = 'pending_approval', submitted_at = now() where id = p_campaign;
    for v_approvers in
      select ra.account_id from public.role_assignments ra join public.role_permissions rp on rp.role_id = ra.role_id
       where rp.permission_key = 'comms.approve' and app.is_current(ra.starts_on, ra.ends_on) and ra.org_id = c.org_id and ra.account_id <> c.created_by
    loop
      perform app.notify(v_approvers, 'approval', 'Email campaign awaiting approval', c.title, '/communications/' || p_campaign, false, 'campaign-approval:' || p_campaign);
    end loop;
    perform app.emit(c.org_id, 'approval.required', 'campaign', p_campaign, jsonb_build_object('kind','campaign','title', c.title));
    return 'pending_approval';
  end if;
  update public.campaigns set status = case when scheduled_for > now() then 'scheduled' else 'approved' end,
         submitted_at = now(), approved_by = app.current_account_id(), approved_at = now() where id = p_campaign;
  perform app.audit('campaign.approved', 'campaign', p_campaign::text, jsonb_build_object('recipients', v_count, 'self', true));
  return 'approved';
end $$;

create or replace function public.campaign_decide(p_campaign uuid, p_approve boolean, p_note text default null) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.campaigns; v_count int; v_self_ok boolean;
begin
  select * into c from public.campaigns where id = p_campaign and org_id = app.current_org_id() for update;
  perform app.require(c.id is not null and app.has_perm('comms.approve'), 'Not permitted to approve communications');
  perform app.require(c.status = 'pending_approval', 'This campaign is not awaiting approval');
  v_self_ok := coalesce((select (settings->'comms'->>'allow_self_approval')::boolean from public.organisations where id = c.org_id), true);
  perform app.require(c.created_by <> app.current_account_id() or v_self_ok, 'Another approver must approve this campaign');
  if not p_approve then
    update public.campaigns set status = 'draft', approval_note = p_note where id = p_campaign;
    perform app.notify(c.created_by, 'approval', 'Campaign returned for changes', c.title, '/communications/' || p_campaign, false, null);
    perform app.audit('campaign.returned', 'campaign', p_campaign::text, jsonb_build_object('note', p_note));
    return 'draft';
  end if;
  v_count := app.snapshot_recipients(p_campaign);
  perform app.require(v_count > 0, 'The audience has no eligible recipients');
  update public.campaigns set status = case when scheduled_for > now() then 'scheduled' else 'approved' end,
         approved_by = app.current_account_id(), approved_at = now(), approval_note = p_note where id = p_campaign;
  perform app.notify(c.created_by, 'approval', 'Campaign approved', c.title, '/communications/' || p_campaign, false, null);
  perform app.audit('campaign.approved', 'campaign', p_campaign::text, jsonb_build_object('recipients', v_count, 'note', p_note));
  return 'approved';
end $$;

create or replace function public.campaign_cancel(p_campaign uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.campaigns;
begin
  select * into c from public.campaigns where id = p_campaign and org_id = app.current_org_id() for update;
  perform app.require(c.id is not null and (c.created_by = app.current_account_id() or app.has_perm('comms.approve')), 'Not permitted');
  perform app.require(c.status in ('draft','pending_approval','approved','scheduled'), 'This campaign can no longer be cancelled');
  update public.campaigns set status = 'cancelled' where id = p_campaign;
  update public.email_outbox set status = 'cancelled'
   where status = 'queued' and campaign_recipient_id in (select id from public.campaign_recipients where campaign_id = p_campaign);
end $$;

-- Public unsubscribe by token (no sign-in). Operational messages continue.
create or replace function public.unsubscribe_by_token(p_token text, p_scope text default 'all') returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.comm_preferences
     set unsubscribed_all_at = case when p_scope = 'all' then now() else unsubscribed_all_at end,
         news = case when p_scope in ('all','news') then false else news end,
         learning = case when p_scope = 'learning' then false else learning end,
         events = case when p_scope = 'events' then false else events end,
         updated_at = now()
   where unsubscribe_token = p_token;
  if found then
    update public.campaign_recipients set unsubscribed_at = now()
     where person_id = (select person_id from public.comm_preferences where unsubscribe_token = p_token) and unsubscribed_at is null
       and sent_at > now() - interval '60 days';
  end if;
  return found;
end $$;

-- ===========================================================================
-- Documents and knowledge
-- ===========================================================================
-- Draft -> Review -> Approved -> Published -> Superseded -> Archived
create or replace function public.document_transition_version(p_version uuid, p_to text, p_note text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v record; d record; v_holder uuid;
begin
  select * into v from public.document_versions where id = p_version and org_id = app.current_org_id() for update;
  perform app.require(v.id is not null, 'Version not found');
  select * into d from public.documents where id = v.document_id;
  perform app.require(app.can_read_classification(d.classification), 'Not permitted');
  if v.status = 'draft' and p_to = 'review' then
    perform app.require(app.has_perm('docs.manage'), 'Not permitted');
    perform app.require(v.storage_path is not null, 'Upload the file before submitting for review');
    update public.document_versions set status = 'review', submitted_at = now() where id = v.id;
    perform app.emit(v.org_id, 'approval.required', 'document_version', v.id, jsonb_build_object('kind','document','title', d.title));
  elsif v.status = 'review' and p_to = 'draft' then
    perform app.require(app.has_any_perm(array['docs.approve','docs.manage']), 'Not permitted');
    update public.document_versions set status = 'draft', review_note = p_note where id = v.id;
  elsif v.status = 'review' and p_to = 'approved' then
    perform app.require(app.has_perm('docs.approve'), 'Only an approver can approve documents');
    update public.document_versions set status = 'approved', approved_by = app.current_account_id(), approved_at = now(), review_note = p_note where id = v.id;
  elsif v.status = 'approved' and p_to = 'published' then
    perform app.require(app.has_perm('docs.approve'), 'Only an approver can publish documents');
    update public.document_versions set status = 'superseded' where document_id = v.document_id and status = 'published';
    update public.document_versions set status = 'published', published_by = app.current_account_id(), published_at = now() where id = v.id;
    perform app.allow_guarded();
    update public.documents set current_version_id = v.id where id = v.document_id;
    perform app.emit(v.org_id, 'document.published', 'document', v.document_id, jsonb_build_object('version_id', v.id, 'requires_ack', d.requires_ack));
  elsif p_to = 'archived' and v.status in ('published','superseded','approved') then
    perform app.require(app.has_perm('docs.approve'), 'Not permitted');
    update public.document_versions set status = 'archived' where id = v.id;
    if v.status = 'published' then
      perform app.allow_guarded();
      update public.documents set current_version_id = null where id = v.document_id;
    end if;
  else
    raise exception using errcode = 'P0001', message = format('Cannot move a %s version to %s', v.status, p_to);
  end if;
  perform app.audit('document_version.' || p_to, 'document_version', v.id::text, jsonb_build_object('note', p_note));
end $$;

create or replace function public.document_acknowledge(p_version uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require(app.can_read_doc_version(p_version), 'Document not found');
  perform app.require(exists (select 1 from public.document_versions where id = p_version and status = 'published'), 'Only the current issue can be acknowledged');
  insert into public.document_acknowledgements(document_version_id, person_id) values (p_version, app.current_person_id()) on conflict do nothing;
end $$;

create or replace function public.knowledge_publish(p_article uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare a record;
begin
  select * into a from public.knowledge_articles where id = p_article and org_id = app.current_org_id() for update;
  perform app.require(a.id is not null and app.has_perm('docs.approve'), 'Only an approver can publish articles');
  perform app.require(a.kind <> 'example' or a.anonymisation_confirmed, 'Confirm the example has been anonymised before publishing');
  update public.knowledge_articles set status = 'published', approved_by = app.current_account_id(), published_at = now() where id = p_article;
end $$;
