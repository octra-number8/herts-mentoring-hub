-- Events, training sessions, registrations, waiting lists, attendance, calendar feeds.

create table public.events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  title text not null,
  description text not null default '',
  kind text not null check (kind in ('workshop','online_training','training_day','mentoring_evening','presentation',
    'prov_meeting','apgmen_meeting','lodge_visit','new_mason_evening','narrated_ceremony','mentoring_lodge',
    'discover_freemasonry','provincial_activity','other')),
  is_training boolean not null default false,
  visibility text not null default 'internal' check (visibility in ('internal','lodge_mentors','invited','learners','public')),
  format text not null default 'in_person' check (format in ('in_person','online','hybrid')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  meeting_centre_id uuid references public.meeting_centres(id),
  lodge_id uuid references public.lodges(id),
  capacity int check (capacity is null or capacity > 0),
  waitlist_enabled boolean not null default true,
  registration_mode text not null default 'hub' check (registration_mode in ('none','hub','external')),
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  external_provider text check (external_provider in ('octra_lodge','other')),
  external_booking_url text,
  external_ref text,
  status text not null default 'draft' check (status in ('draft','published','cancelled','completed')),
  course_id uuid references public.courses(id),
  attendance_completes_course boolean not null default false,
  certificate_on_attendance boolean not null default false,
  feedback_enabled boolean not null default true,
  checkin_secret text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  checkin_open boolean not null default false,
  cancelled_reason text,
  created_by uuid references public.user_accounts(id) default app.current_account_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);
create index events_time_idx on public.events(org_id, starts_at);
create trigger events_touch before update on public.events for each row execute function app.touch_updated_at();

-- Joining details only for organisers and confirmed registrants.
create table public.event_joining_details (
  event_id uuid primary key references public.events(id) on delete cascade,
  online_url text,
  instructions text
);

create table public.event_trainers (
  event_id uuid not null references public.events(id) on delete cascade,
  person_id uuid not null references public.persons(id),
  display_name text not null,
  role text not null default 'trainer' check (role in ('trainer','presenter','host','support')),
  primary key (event_id, person_id)
);

create table public.event_invites (
  event_id uuid not null references public.events(id) on delete cascade,
  person_id uuid not null references public.persons(id) on delete cascade,
  invited_at timestamptz not null default now(),
  primary key (event_id, person_id)
);

create table public.event_resources (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null,
  document_id uuid,
  url text,
  audience text not null default 'presenter' check (audience in ('presenter','attendees')),
  position int not null default 0
);

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  event_id uuid not null references public.events(id) on delete cascade,
  person_id uuid not null references public.persons(id) on delete cascade,
  status text not null check (status in ('confirmed','waitlisted','cancelled','attended','no_show')),
  waitlist_position int,
  registered_at timestamptz not null default now(),
  cancelled_at timestamptz,
  checkin_code text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  checked_in_at timestamptz,
  checkin_method text check (checkin_method in ('qr_session','qr_personal','manual')),
  checked_in_by uuid references public.user_accounts(id),
  override_reason text,
  feedback_rating int check (feedback_rating between 1 and 5),
  feedback_comment text,
  feedback_at timestamptz,
  reminder_sent_at timestamptz,
  follow_up_sent_at timestamptz,
  unique (event_id, person_id)
);
create index registrations_event_idx on public.registrations(event_id, status);
create index registrations_person_idx on public.registrations(person_id);

-- References to bookings held in an external system (Octra-Lodge stays authoritative).
create table public.external_booking_refs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  event_id uuid not null references public.events(id) on delete cascade,
  provider text not null,
  external_booking_id text not null,
  person_id uuid references public.persons(id),
  external_status text,
  synced_at timestamptz not null default now(),
  unique (provider, external_booking_id)
);

create table public.calendar_feed_tokens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  account_id uuid not null references public.user_accounts(id) on delete cascade,
  token_hash text not null unique,
  label text not null default 'My calendar',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

-- ---------------------------------------------------------------------------
create or replace function app.is_lodge_mentor_now() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.lodge_appointments a
                  where a.person_id = app.current_person_id()
                    and a.office in ('lodge_mentor','assistant_lodge_mentor')
                    and app.is_current(a.starts_on, a.ends_on))
$$;

create or replace function app.can_see_event(p_event uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.events e
     where e.id = p_event and e.org_id = app.current_org_id()
       and (
         app.has_perm('events.manage')
         or exists (select 1 from public.event_trainers t where t.event_id = e.id and t.person_id = app.current_person_id())
         or exists (select 1 from public.registrations r where r.event_id = e.id and r.person_id = app.current_person_id())
         or (e.status in ('published','completed','cancelled') and (
               (e.visibility = 'internal' and app.has_perm('events.read.internal'))
            or (e.visibility = 'lodge_mentors' and (app.has_perm('events.read.internal') or app.is_lodge_mentor_now()))
            or (e.visibility = 'invited' and (app.has_perm('events.read.internal')
                  or exists (select 1 from public.event_invites i where i.event_id = e.id and i.person_id = app.current_person_id())))
            or (e.visibility = 'learners' and app.has_any_perm(array['academy.learn','events.read.internal']))
            or (e.visibility = 'public')))
       ))
$$;

create or replace function app.can_manage_event(p_event uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.events e where e.id = p_event and e.org_id = app.current_org_id()
                   and (app.has_perm('events.manage')
                        or (app.has_perm('events.checkin') and exists (select 1 from public.event_trainers t where t.event_id = e.id and t.person_id = app.current_person_id()))))
$$;

create trigger events_audit after insert or update or delete on public.events for each row execute function app.audit_row();
create trigger registrations_audit after insert or update or delete on public.registrations for each row execute function app.audit_row();

alter table public.events enable row level security;
alter table public.event_joining_details enable row level security;
alter table public.event_trainers enable row level security;
alter table public.event_invites enable row level security;
alter table public.event_resources enable row level security;
alter table public.registrations enable row level security;
alter table public.external_booking_refs enable row level security;
alter table public.calendar_feed_tokens enable row level security;

create policy read_events on public.events for select to authenticated using (app.can_see_event(id));
create policy write_events on public.events for all to authenticated
  using (org_id = app.current_org_id() and app.has_perm('events.manage'))
  with check (org_id = app.current_org_id() and app.has_perm('events.manage'));

create policy read_joining on public.event_joining_details for select to authenticated
  using (app.can_manage_event(event_id) or exists (select 1 from public.registrations r
          where r.event_id = event_joining_details.event_id and r.person_id = app.current_person_id() and r.status in ('confirmed','attended')));
create policy write_joining on public.event_joining_details for all to authenticated
  using (app.has_perm('events.manage')) with check (app.has_perm('events.manage'));

create policy read_trainers on public.event_trainers for select to authenticated using (app.can_see_event(event_id));
create policy write_trainers on public.event_trainers for all to authenticated
  using (app.has_perm('events.manage')) with check (app.has_perm('events.manage'));

create policy read_invites on public.event_invites for select to authenticated
  using (person_id = app.current_person_id() or app.has_perm('events.manage'));
create policy write_invites on public.event_invites for all to authenticated
  using (app.has_perm('events.manage')) with check (app.has_perm('events.manage'));

create policy read_resources on public.event_resources for select to authenticated
  using (app.can_manage_event(event_id) or (audience = 'attendees' and exists (select 1 from public.registrations r
          where r.event_id = event_resources.event_id and r.person_id = app.current_person_id() and r.status in ('confirmed','attended'))));
create policy write_resources on public.event_resources for all to authenticated
  using (app.has_perm('events.manage')) with check (app.has_perm('events.manage'));

-- Registrations change only through definer functions (capacity and waitlist are atomic).
create policy read_registrations on public.registrations for select to authenticated
  using (person_id = app.current_person_id() or app.can_manage_event(event_id));
create policy own_feedback on public.registrations for update to authenticated
  using (app.can_manage_event(event_id))
  with check (app.can_manage_event(event_id));

create policy read_external_refs on public.external_booking_refs for select to authenticated
  using (org_id = app.current_org_id() and app.has_perm('events.manage'));

create policy own_feed_tokens on public.calendar_feed_tokens for select to authenticated
  using (account_id = app.current_account_id());
create policy revoke_feed_tokens on public.calendar_feed_tokens for update to authenticated
  using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
