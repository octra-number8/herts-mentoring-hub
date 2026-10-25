-- Provincial team workspace: announcements, meetings, agendas, minutes, decisions.

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  title text not null,
  body text not null,
  audience text not null default 'team' check (audience in ('team','leadership')),
  pinned boolean not null default false,
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid references public.user_accounts(id) default app.current_account_id(),
  created_at timestamptz not null default now()
);

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  title text not null,
  kind text not null default 'team' check (kind in ('team','apgmen','leadership','working_group','other')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  online_url text,
  status text not null default 'scheduled' check (status in ('scheduled','held','cancelled')),
  minutes text,
  minutes_status text not null default 'none' check (minutes_status in ('none','draft','approved')),
  minutes_approved_by uuid references public.user_accounts(id),
  calendar_event_id uuid,
  created_by uuid references public.user_accounts(id) default app.current_account_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(minutes,''))) stored
);
create index meetings_search_idx on public.meetings using gin(search);
create trigger meetings_touch before update on public.meetings for each row execute function app.touch_updated_at();

create table public.meeting_agenda_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  position int not null default 0,
  title text not null,
  presenter_person_id uuid references public.persons(id),
  notes text,
  document_id uuid
);

create table public.meeting_attendees (
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  person_id uuid not null references public.persons(id),
  attendance text not null default 'invited' check (attendance in ('invited','attended','apologies','absent')),
  primary key (meeting_id, person_id)
);

create table public.meeting_decisions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  agenda_item_id uuid references public.meeting_agenda_items(id) on delete set null,
  decision text not null,
  recorded_by uuid references public.user_accounts(id) default app.current_account_id(),
  created_at timestamptz not null default now()
);

create or replace function app.can_read_meeting(p_meeting uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.meetings m where m.id = p_meeting and m.org_id = app.current_org_id()
                   and app.has_perm('team.use')
                   and (m.kind <> 'leadership' or app.has_perm('notes.leadership')
                        or exists (select 1 from public.meeting_attendees a where a.meeting_id = m.id and a.person_id = app.current_person_id())))
$$;

create trigger meetings_audit after insert or update or delete on public.meetings for each row execute function app.audit_row();
create trigger decisions_audit after insert or update or delete on public.meeting_decisions for each row execute function app.audit_row();

alter table public.announcements enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_agenda_items enable row level security;
alter table public.meeting_attendees enable row level security;
alter table public.meeting_decisions enable row level security;

create policy read_announcements on public.announcements for select to authenticated
  using (org_id = app.current_org_id() and app.has_perm('team.use') and (audience = 'team' or app.has_perm('notes.leadership')));
create policy write_announcements on public.announcements for all to authenticated
  using (org_id = app.current_org_id() and app.has_perm('team.announce'))
  with check (org_id = app.current_org_id() and app.has_perm('team.announce'));

create policy read_meetings on public.meetings for select to authenticated
  using (app.can_read_meeting(id));
create policy write_meetings on public.meetings for all to authenticated
  using (org_id = app.current_org_id() and app.has_perm('meetings.manage'))
  with check (org_id = app.current_org_id() and app.has_perm('meetings.manage'));

create policy read_agenda on public.meeting_agenda_items for select to authenticated using (app.can_read_meeting(meeting_id));
create policy write_agenda on public.meeting_agenda_items for all to authenticated
  using (app.has_perm('meetings.manage') and app.can_read_meeting(meeting_id))
  with check (app.has_perm('meetings.manage') and app.can_read_meeting(meeting_id));
create policy read_attendees on public.meeting_attendees for select to authenticated using (app.can_read_meeting(meeting_id));
create policy write_attendees on public.meeting_attendees for all to authenticated
  using (app.has_perm('meetings.manage') and app.can_read_meeting(meeting_id))
  with check (app.has_perm('meetings.manage') and app.can_read_meeting(meeting_id));
create policy read_decisions on public.meeting_decisions for select to authenticated using (app.can_read_meeting(meeting_id));
create policy write_decisions on public.meeting_decisions for all to authenticated
  using (app.has_perm('meetings.manage') and app.can_read_meeting(meeting_id))
  with check (app.has_perm('meetings.manage') and app.can_read_meeting(meeting_id));
