-- Member journeys, degree events, contacts, notes, tasks, visits, support requests and cases.

create table public.member_journeys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  person_id uuid not null references public.persons(id) on delete cascade,
  stage text not null default 'entered_apprentice' check (stage in ('enquirer','applicant','candidate','entered_apprentice','fellow_craft','master_mason','established')),
  royal_arch text not null default 'not_discussed' check (royal_arch in ('not_discussed','informed','interested','proposed','exalted','not_now')),
  journey_status text not null default 'active' check (journey_status in ('active','paused','closed')),
  personal_mentor_allocated text not null default 'unknown' check (personal_mentor_allocated in ('yes','no','unknown')),
  personal_mentor_confirmed_on date,
  personal_mentor_confirmed_by uuid references public.persons(id),
  personal_mentor_person_id uuid references public.persons(id),   -- optional, never required
  personal_mentor_review_on date,
  next_review_on date,
  learning_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person_id)
);
create trigger member_journeys_touch before update on public.member_journeys for each row execute function app.touch_updated_at();

create table public.degree_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  person_id uuid not null references public.persons(id) on delete cascade,
  lodge_id uuid references public.lodges(id),
  kind text not null check (kind in ('initiation','passing','raising','joining','exaltation','installation')),
  event_date date not null,
  source text not null default 'local' check (source in ('local','import')),
  import_batch_id uuid,
  created_at timestamptz not null default now(),
  unique (person_id, kind, event_date)
);
create index degree_events_person_idx on public.degree_events(person_id);
create index degree_events_lodge_date_idx on public.degree_events(lodge_id, event_date);

-- Explicit, audited access to individual records (cases, restricted notes, restricted persons).
create table public.access_grants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  entity_type text not null check (entity_type in ('case','note','person')),
  entity_id uuid not null,
  account_id uuid not null references public.user_accounts(id) on delete cascade,
  granted_by uuid references public.user_accounts(id),
  reason text not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index access_grants_lookup on public.access_grants(entity_type, entity_id, account_id);

create or replace function app.has_grant(p_type text, p_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.access_grants g
                  where g.entity_type = p_type and g.entity_id = p_id
                    and g.account_id = app.current_account_id()
                    and g.revoked_at is null and (g.expires_at is null or g.expires_at > now()))
$$;

-- ---------------------------------------------------------------------------
-- Support requests and cases
-- ---------------------------------------------------------------------------
create sequence public.case_reference_seq;

create table public.support_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  key text not null,
  label text not null,
  description text not null default '',
  default_due_days int not null default 14,
  active boolean not null default true,
  position int not null default 0,
  unique (org_id, key)
);

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  reference text not null unique,
  kind text not null default 'request' check (kind in ('request','confidential')),
  category_key text not null,
  title text not null,
  description text,
  lodge_id uuid references public.lodges(id),
  member_person_id uuid references public.persons(id),
  requester_person_id uuid references public.persons(id),
  requester_account_id uuid references public.user_accounts(id),
  owner_account_id uuid references public.user_accounts(id),
  status text not null default 'new' check (status in ('new','triage','assigned','in_progress','awaiting_response','escalated','resolved','closed','referred')),
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  due_on date,
  escalated_to_account_id uuid references public.user_accounts(id),
  referred_to text,             -- e.g. 'Provincial Grand Almoner (welfare procedure)'
  outcome text,
  source text not null default 'hub' check (source in ('hub','lodge_portal','email','telephone','meeting')),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cases_lodge_idx on public.cases(lodge_id);
create index cases_owner_idx on public.cases(owner_account_id) where status not in ('closed','resolved');
create trigger cases_touch before update on public.cases for each row execute function app.touch_updated_at();

create table public.case_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  case_id uuid not null references public.cases(id) on delete cascade,
  kind text not null check (kind in ('comment','status_change','assignment','escalation','action','referral','outcome','access')),
  body text,
  visible_to_requester boolean not null default false,
  data jsonb not null default '{}'::jsonb,
  created_by uuid references public.user_accounts(id),
  created_at timestamptz not null default now()
);
create index case_events_case_idx on public.case_events(case_id, created_at);

create or replace function app.can_read_case(p_case uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.cases c
     where c.id = p_case and c.org_id = app.current_org_id()
       and app.has_perm('hub.access_management')
       and (
         c.owner_account_id = app.current_account_id()
         or c.escalated_to_account_id = app.current_account_id()
         or app.has_grant('case', c.id)
         or (c.kind = 'confidential' and app.has_perm('cases.confidential.triage'))
         or (c.kind = 'request' and (
               app.has_perm('cases.read.all')
               or (c.lodge_id is not null and app.can_on_lodge('cases.read', c.lodge_id))))
       )
  )
$$;

create or replace function app.can_manage_case(p_case uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.cases c
     where c.id = p_case and c.org_id = app.current_org_id()
       and (
         (c.owner_account_id = app.current_account_id() and app.has_any_perm(array['cases.write.all','cases.write.allocated','cases.confidential.triage']))
         or app.has_grant('case', c.id) and app.has_any_perm(array['cases.write.all','cases.write.allocated'])
         or (c.kind = 'confidential' and app.has_perm('cases.confidential.triage'))
         or (c.kind = 'request' and (app.has_perm('cases.write.all')
               or (c.lodge_id is not null and app.can_on_lodge('cases.write', c.lodge_id))))
       )
  )
$$;

-- Reference numbers and default routing to the allocated APGMen (ordinary requests)
-- or the confidential triage queue (confidential concerns, never auto-routed).
create or replace function app.case_before_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner uuid; v_days int;
begin
  new.reference := case when new.kind = 'confidential' then 'CC-' else 'SR-' end
                   || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.case_reference_seq')::text, 4, '0');
  if new.kind = 'confidential' then
    new.status := 'triage';
    new.owner_account_id := null;
    new.lodge_id := new.lodge_id; -- may be recorded but never surfaces on Lodge views
  elsif new.owner_account_id is null and new.lodge_id is not null then
    select ua.id into v_owner
      from public.lodge_allocations la
      join public.user_accounts ua on ua.person_id = la.person_id and ua.status = 'active'
     where la.lodge_id = new.lodge_id and app.is_current(la.starts_on, la.ends_on)
     order by (la.kind = 'cover') desc, la.starts_on desc
     limit 1;
    new.owner_account_id := v_owner;
    if v_owner is not null and new.status = 'new' then new.status := 'assigned'; end if;
  end if;
  if new.due_on is null then
    select default_due_days into v_days from public.support_categories where org_id = new.org_id and key = new.category_key;
    new.due_on := current_date + coalesce(v_days, 14);
  end if;
  return new;
end $$;
create trigger cases_before_insert before insert on public.cases for each row execute function app.case_before_insert();

create or replace function app.case_status_change() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status is distinct from old.status then
    insert into public.case_events(org_id, case_id, kind, data, created_by)
    values (new.org_id, new.id, 'status_change', jsonb_build_object('from', old.status, 'to', new.status), app.current_account_id());
    if new.status in ('closed','resolved') and new.closed_at is null then new.closed_at := now(); end if;
    if new.status not in ('closed','resolved') then new.closed_at := null; end if;
  end if;
  if new.owner_account_id is distinct from old.owner_account_id then
    insert into public.case_events(org_id, case_id, kind, data, created_by)
    values (new.org_id, new.id, 'assignment', jsonb_build_object('from', old.owner_account_id, 'to', new.owner_account_id), app.current_account_id());
  end if;
  return new;
end $$;
create trigger cases_status_change before update on public.cases for each row execute function app.case_status_change();

-- ---------------------------------------------------------------------------
-- Contacts (quick interaction records)
-- ---------------------------------------------------------------------------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  lodge_id uuid references public.lodges(id),
  person_id uuid references public.persons(id),
  method text not null check (method in ('telephone','email','online_meeting','face_to_face','lodge_visit','other')),
  occurred_on date not null default current_date,
  summary text not null,
  outcome text,
  follow_up_on date,
  owner_account_id uuid references public.user_accounts(id),
  visibility text not null default 'ordinary' check (visibility in ('ordinary','team','leadership')),
  shared_with_lodge boolean not null default false,
  created_by uuid references public.user_accounts(id) default app.current_account_id(),
  created_at timestamptz not null default now(),
  check (lodge_id is not null or person_id is not null)
);
create index contacts_lodge_idx on public.contacts(lodge_id, occurred_on desc);
create index contacts_person_idx on public.contacts(person_id);

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  subject_type text not null check (subject_type in ('lodge','person','case','meeting','general')),
  subject_id uuid,
  lodge_id uuid references public.lodges(id),   -- denormalised for scoping
  visibility text not null default 'ordinary' check (visibility in ('ordinary','team','leadership','restricted')),
  body text not null,
  author_account_id uuid not null references public.user_accounts(id) default app.current_account_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index notes_subject_idx on public.notes(subject_type, subject_id);
create trigger notes_touch before update on public.notes for each row execute function app.touch_updated_at();

create table public.note_mentions (
  note_id uuid not null references public.notes(id) on delete cascade,
  account_id uuid not null references public.user_accounts(id) on delete cascade,
  primary key (note_id, account_id)
);

create or replace function app.can_read_note(p_note uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.notes n
     where n.id = p_note and n.org_id = app.current_org_id()
       and app.has_perm('hub.access_management')
       and (
         n.author_account_id = app.current_account_id()
         or app.has_grant('note', n.id)
         or case n.visibility
              when 'restricted' then app.has_perm('notes.restricted') and n.subject_type = 'case' and app.can_read_case(n.subject_id)
              when 'leadership' then app.has_perm('notes.leadership')
              when 'team' then app.has_perm('notes.team')
              else case n.subject_type
                     when 'lodge' then app.can_on_lodge('activity.read', n.subject_id)
                     when 'person' then app.can_on_person('members.read.detail', n.subject_id)
                     when 'case' then app.can_read_case(n.subject_id)
                     when 'meeting' then app.has_perm('team.use')
                     else app.has_perm('notes.team')
                   end
            end
       )
  )
$$;

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  title text not null,
  description text,
  owner_account_id uuid references public.user_accounts(id),
  created_by uuid references public.user_accounts(id) default app.current_account_id(),
  due_on date,
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  status text not null default 'open' check (status in ('open','in_progress','waiting','done','cancelled')),
  linked_type text check (linked_type in ('lodge','person','case','meeting','visit','event','import','document','course','contact')),
  linked_id uuid,
  lodge_id uuid references public.lodges(id),
  completed_at timestamptz,
  completed_by uuid references public.user_accounts(id),
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_owner_idx on public.tasks(owner_account_id, status, due_on);
create index tasks_linked_idx on public.tasks(linked_type, linked_id);
create trigger tasks_touch before update on public.tasks for each row execute function app.touch_updated_at();

create or replace function app.task_completion() returns trigger
language plpgsql as $$
begin
  if new.status = 'done' and (old.status is distinct from 'done') then
    new.completed_at := now(); new.completed_by := app.current_account_id();
  elsif new.status <> 'done' then
    new.completed_at := null; new.completed_by := null;
  end if;
  return new;
end $$;
create trigger tasks_completion before update on public.tasks for each row execute function app.task_completion();

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  task_id uuid not null references public.tasks(id) on delete cascade,
  body text not null,
  created_by uuid references public.user_accounts(id) default app.current_account_id(),
  created_at timestamptz not null default now()
);

create or replace function app.can_read_task(p_task uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.tasks t
     where t.id = p_task and t.org_id = app.current_org_id()
       and app.has_perm('tasks.use')
       and (
         t.owner_account_id = app.current_account_id()
         or t.created_by = app.current_account_id()
         or (t.linked_type = 'case' and app.can_read_case(t.linked_id))
         or (coalesce(t.linked_type, '') <> 'case' and (
               app.has_perm('tasks.manage_all')
               or (t.lodge_id is not null and app.can_on_lodge('activity.read', t.lodge_id))))
       )
  )
$$;

-- ---------------------------------------------------------------------------
-- Visits
-- ---------------------------------------------------------------------------
create table public.visits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  lodge_id uuid not null references public.lodges(id),
  planned_for timestamptz not null,
  purpose text not null,
  status text not null default 'planned' check (status in ('planned','completed','postponed','cancelled')),
  notes text,
  outcome text,
  follow_up text,
  calendar_event_id uuid,
  created_by uuid references public.user_accounts(id) default app.current_account_id(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index visits_lodge_idx on public.visits(lodge_id, planned_for desc);
create trigger visits_touch before update on public.visits for each row execute function app.touch_updated_at();

create table public.visit_participants (
  visit_id uuid not null references public.visits(id) on delete cascade,
  person_id uuid not null references public.persons(id),
  role text not null default 'attendee',
  primary key (visit_id, person_id)
);

-- ---------------------------------------------------------------------------
-- Audit triggers
-- ---------------------------------------------------------------------------
create trigger member_journeys_audit after insert or update or delete on public.member_journeys for each row execute function app.audit_row();
create trigger cases_audit after insert or update or delete on public.cases for each row execute function app.audit_row();
create trigger contacts_audit after insert or update or delete on public.contacts for each row execute function app.audit_row();
create trigger notes_audit after insert or update or delete on public.notes for each row execute function app.audit_row();
create trigger tasks_audit after insert or update or delete on public.tasks for each row execute function app.audit_row();
create trigger visits_audit after insert or update or delete on public.visits for each row execute function app.audit_row();
create trigger access_grants_audit after insert or update or delete on public.access_grants for each row execute function app.audit_row();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.member_journeys enable row level security;
alter table public.degree_events enable row level security;
alter table public.access_grants enable row level security;
alter table public.support_categories enable row level security;
alter table public.cases enable row level security;
alter table public.case_events enable row level security;
alter table public.contacts enable row level security;
alter table public.notes enable row level security;
alter table public.note_mentions enable row level security;
alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.visits enable row level security;
alter table public.visit_participants enable row level security;

-- Journeys are detailed mentoring records.
create policy read_journeys on public.member_journeys for select to authenticated
  using (org_id = app.current_org_id() and (
    app.can_on_person('members.read.detail', person_id)
    or exists (select 1 from app.person_lodge_ids(person_id) l where l in (select app.portal_lodge_ids()))
  ) and (not exists (select 1 from public.persons p where p.id = person_id and p.is_restricted)
         or app.has_perm('notes.leadership') or app.has_grant('person', person_id)));
create policy write_journeys on public.member_journeys for all to authenticated
  using (org_id = app.current_org_id() and app.can_on_person('members.write', person_id))
  with check (org_id = app.current_org_id() and app.can_on_person('members.write', person_id));

create policy read_degrees on public.degree_events for select to authenticated
  using (org_id = app.current_org_id() and (app.has_perm('members.read.basic') or lodge_id in (select app.portal_lodge_ids())));
create policy write_degrees on public.degree_events for all to authenticated
  using (org_id = app.current_org_id() and app.can_on_person('members.write', person_id))
  with check (org_id = app.current_org_id() and app.can_on_person('members.write', person_id));

create policy read_grants on public.access_grants for select to authenticated
  using (org_id = app.current_org_id() and (account_id = app.current_account_id() or app.has_perm('notes.leadership')));
create policy write_grants on public.access_grants for all to authenticated
  using (org_id = app.current_org_id() and (app.has_perm('notes.leadership') or app.has_perm('cases.confidential.triage')))
  with check (org_id = app.current_org_id() and (app.has_perm('notes.leadership') or app.has_perm('cases.confidential.triage')));

create policy read_categories on public.support_categories for select to authenticated
  using (org_id = app.current_org_id());
create policy write_categories on public.support_categories for all to authenticated
  using (org_id = app.current_org_id() and app.has_perm('admin.config'))
  with check (org_id = app.current_org_id() and app.has_perm('admin.config'));

create policy read_cases on public.cases for select to authenticated
  using (org_id = app.current_org_id() and (app.can_read_case(id) or requester_account_id = app.current_account_id()));
create policy insert_requests on public.cases for insert to authenticated
  with check (org_id = app.current_org_id() and (
    (kind = 'request' and (app.has_any_perm(array['cases.write.all','cases.write.allocated'])
                           or (lodge_id in (select app.portal_lodge_ids('create')) and requester_account_id = app.current_account_id())))
    or (kind = 'confidential' and app.has_perm('cases.confidential.submit') and requester_account_id = app.current_account_id())
  ));
create policy update_cases on public.cases for update to authenticated
  using (org_id = app.current_org_id() and app.can_manage_case(id))
  with check (org_id = app.current_org_id() and app.can_manage_case(id));

create policy read_case_events on public.case_events for select to authenticated
  using (org_id = app.current_org_id() and (
    app.can_read_case(case_id)
    or (visible_to_requester and exists (select 1 from public.cases c where c.id = case_id and c.requester_account_id = app.current_account_id()))));
create policy insert_case_events on public.case_events for insert to authenticated
  with check (org_id = app.current_org_id() and app.can_manage_case(case_id) and created_by = app.current_account_id());

create policy read_contacts on public.contacts for select to authenticated
  using (org_id = app.current_org_id() and (
    ((created_by = app.current_account_id() or owner_account_id = app.current_account_id()) and app.has_perm('hub.access_management'))
    or (shared_with_lodge and visibility = 'ordinary' and lodge_id in (select app.portal_lodge_ids()))
    or case visibility
         when 'leadership' then app.has_perm('notes.leadership')
         when 'team' then app.has_perm('notes.team') and (lodge_id is null or app.can_on_lodge('activity.read', lodge_id) or app.has_perm('lodges.read'))
         else (lodge_id is not null and app.can_on_lodge('activity.read', lodge_id))
           or (person_id is not null and app.can_on_person('members.read.detail', person_id))
           or (shared_with_lodge and lodge_id in (select app.portal_lodge_ids()))
       end));
create policy write_contacts on public.contacts for insert to authenticated
  with check (org_id = app.current_org_id() and (
    (lodge_id is not null and app.can_on_lodge('activity.write', lodge_id))
    or (lodge_id is null and person_id is not null and app.can_on_person('members.write', person_id))));
create policy update_contacts on public.contacts for update to authenticated
  using (org_id = app.current_org_id() and (created_by = app.current_account_id() or (lodge_id is not null and app.can_on_lodge('activity.write', lodge_id))))
  with check (org_id = app.current_org_id());

create policy read_notes on public.notes for select to authenticated
  using (org_id = app.current_org_id() and app.can_read_note(id));
create policy insert_notes on public.notes for insert to authenticated
  with check (org_id = app.current_org_id() and author_account_id = app.current_account_id() and (
    case visibility
      when 'leadership' then app.has_perm('notes.leadership')
      when 'team' then app.has_perm('notes.team')
      when 'restricted' then app.has_perm('notes.restricted') and subject_type = 'case' and app.can_manage_case(subject_id)
      else case subject_type
             when 'lodge' then app.can_on_lodge('activity.write', subject_id)
             when 'person' then app.can_on_person('members.write', subject_id)
             when 'case' then app.can_manage_case(subject_id)
             when 'meeting' then app.has_perm('team.use')
             else app.has_perm('notes.team')
           end
    end));
create policy update_notes on public.notes for update to authenticated
  using (org_id = app.current_org_id() and author_account_id = app.current_account_id())
  with check (org_id = app.current_org_id() and author_account_id = app.current_account_id());

create policy read_mentions on public.note_mentions for select to authenticated
  using (account_id = app.current_account_id() or app.can_read_note(note_id));
create policy write_mentions on public.note_mentions for insert to authenticated
  with check (exists (select 1 from public.notes n where n.id = note_id and n.author_account_id = app.current_account_id()));

create policy read_tasks on public.tasks for select to authenticated
  using (org_id = app.current_org_id() and app.can_read_task(id));
create policy insert_tasks on public.tasks for insert to authenticated
  with check (org_id = app.current_org_id() and app.has_perm('tasks.use')
              and (lodge_id is null or app.can_on_lodge('activity.write', lodge_id) or app.has_perm('tasks.manage_all'))
              and (coalesce(linked_type,'') <> 'case' or app.can_manage_case(linked_id)));
create policy update_tasks on public.tasks for update to authenticated
  using (org_id = app.current_org_id() and app.has_perm('tasks.use') and (
    owner_account_id = app.current_account_id() or created_by = app.current_account_id()
    or app.has_perm('tasks.manage_all')
    or (lodge_id is not null and app.can_on_lodge('activity.write', lodge_id))))
  with check (org_id = app.current_org_id());

create policy read_task_comments on public.task_comments for select to authenticated
  using (org_id = app.current_org_id() and app.can_read_task(task_id));
create policy insert_task_comments on public.task_comments for insert to authenticated
  with check (org_id = app.current_org_id() and app.can_read_task(task_id) and created_by = app.current_account_id());

create or replace function app.is_visit_participant(p_visit uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.visit_participants vp where vp.visit_id = p_visit and vp.person_id = app.current_person_id())
$$;
create or replace function app.visit_lodge(p_visit uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select lodge_id from public.visits where id = p_visit
$$;

create policy read_visits on public.visits for select to authenticated
  using (org_id = app.current_org_id() and (app.can_on_lodge('activity.read', lodge_id) or app.is_visit_participant(id)));
create policy write_visits on public.visits for all to authenticated
  using (org_id = app.current_org_id() and app.can_on_lodge('activity.write', lodge_id))
  with check (org_id = app.current_org_id() and app.can_on_lodge('activity.write', lodge_id));

create policy read_visit_participants on public.visit_participants for select to authenticated
  using (person_id = app.current_person_id() or app.can_on_lodge('activity.read', app.visit_lodge(visit_id)));
create policy write_visit_participants on public.visit_participants for all to authenticated
  using (app.can_on_lodge('activity.write', app.visit_lodge(visit_id)))
  with check (app.can_on_lodge('activity.write', app.visit_lodge(visit_id)));
