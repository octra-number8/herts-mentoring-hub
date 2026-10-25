-- Lodges, meeting centres, appointments (effective-dated), APGMen areas and allocations.

create table public.meeting_centres (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  name text not null,
  address text,
  town text,
  postcode text,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  name text not null,
  code text not null,
  description text,
  active boolean not null default true,
  unique (org_id, code)
);

-- Configurable operational mentoring statuses (describe a position, not quality).
create table public.mentoring_statuses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  key text not null,
  label text not null,
  description text not null default '',
  position int not null default 0,
  is_closed boolean not null default false,
  active boolean not null default true,
  unique (org_id, key)
);

create table public.lodges (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  name text not null,
  number int not null,
  meeting_centre_id uuid references public.meeting_centres(id),
  meeting_pattern text,
  installation_month int check (installation_month between 1 and 12),
  installation_note text,
  status text not null default 'active' check (status in ('active','in_abeyance','amalgamated','erased','consecrating')),
  website text,
  email citext,
  membership_count int,                 -- latest imported summary
  membership_count_on date,
  mentoring_status_id uuid references public.mentoring_statuses(id),
  mentoring_status_changed_at timestamptz,
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, number)
);
create index lodges_name_trgm on public.lodges using gin (name gin_trgm_ops);
create trigger lodges_touch before update on public.lodges for each row execute function app.touch_updated_at();

alter table public.feature_activations
  add constraint feature_activations_lodge_fk foreign key (lodge_id) references public.lodges(id) on delete cascade;

-- Masonic appointments within a Lodge. History preserved with effective dates.
create table public.lodge_appointments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  lodge_id uuid not null references public.lodges(id) on delete cascade,
  office text not null check (office in ('worshipful_master','secretary','lodge_mentor','assistant_lodge_mentor','membership_officer','almoner','director_of_ceremonies','royal_arch_representative','charity_steward')),
  person_id uuid references public.persons(id),     -- null records a known vacancy
  confirmed boolean not null default true,
  starts_on date not null default current_date,
  ends_on date,
  source text not null default 'local' check (source in ('local','import','lodge_proposal')),
  recorded_by uuid references public.user_accounts(id),
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on - 1)
);
create index lodge_appointments_lodge_idx on public.lodge_appointments(lodge_id, office);
create index lodge_appointments_person_idx on public.lodge_appointments(person_id);

-- Provincial appointments held by people (distinct from app permissions).
create table public.provincial_appointments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  person_id uuid not null references public.persons(id),
  office text not null check (office in ('prov_grand_mentor','deputy_prov_grand_mentor','apgmen','prov_team','other')),
  title text,
  area_id uuid references public.areas(id),
  starts_on date not null default current_date,
  ends_on date,
  created_at timestamptz not null default now()
);

-- Allocation of a Lodge to an Assistant Provincial Grand Mentor (primary or temporary cover).
create table public.lodge_allocations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  lodge_id uuid not null references public.lodges(id) on delete cascade,
  person_id uuid not null references public.persons(id),
  area_id uuid references public.areas(id),
  kind text not null default 'primary' check (kind in ('primary','cover')),
  starts_on date not null default current_date,
  ends_on date,
  reason text,
  recorded_by uuid references public.user_accounts(id),
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on - 1)
);
create index lodge_allocations_lodge_idx on public.lodge_allocations(lodge_id);
create index lodge_allocations_person_idx on public.lodge_allocations(person_id);
-- One current primary allocation per Lodge.
create unique index lodge_allocations_one_open_primary on public.lodge_allocations(lodge_id) where kind = 'primary' and ends_on is null;

create table public.lodge_memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  person_id uuid not null references public.persons(id) on delete cascade,
  lodge_id uuid not null references public.lodges(id),
  is_primary boolean not null default false,
  joined_on date,
  join_type text check (join_type in ('initiated','joined','rejoined','founder')),
  left_on date,
  leaving_reason text check (leaving_reason in ('resigned','ceased','excluded','deceased','transferred','other')),
  source text not null default 'local',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person_id, lodge_id, joined_on)
);
create index lodge_memberships_lodge_idx on public.lodge_memberships(lodge_id);
create trigger lodge_memberships_touch before update on public.lodge_memberships for each row execute function app.touch_updated_at();

-- Light-touch mentoring arrangements, one per Lodge.
create table public.lodge_mentoring_profiles (
  lodge_id uuid primary key references public.lodges(id) on delete cascade,
  org_id uuid not null references public.organisations(id),
  personal_mentors_for_new_members text not null default 'unknown' check (personal_mentors_for_new_members in ('yes','no','partly','unknown')),
  arrangements text,
  guidance_used text,
  training_requirements text,
  improvement_opportunities text,
  good_practice text,
  last_review_on date,
  next_review_on date,
  updated_by uuid references public.user_accounts(id),
  updated_at timestamptz not null default now()
);

create table public.lodge_reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  lodge_id uuid not null references public.lodges(id) on delete cascade,
  review_date date not null default current_date,
  reviewed_by uuid references public.persons(id),
  lodge_mentor_in_place text check (lodge_mentor_in_place in ('yes','no','unknown')),
  personal_mentors_in_place text check (personal_mentors_in_place in ('yes','no','partly','unknown')),
  what_is_working text,
  support_wanted text,
  training_needs text,
  next_review_on date,
  created_at timestamptz not null default now()
);

create table public.lodge_status_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  lodge_id uuid not null references public.lodges(id) on delete cascade,
  status_id uuid not null references public.mentoring_statuses(id),
  previous_status_id uuid references public.mentoring_statuses(id),
  note text,
  changed_by uuid references public.user_accounts(id),
  changed_at timestamptz not null default now()
);
create index lodge_status_history_lodge_idx on public.lodge_status_history(lodge_id, changed_at desc);

-- Lodge information change proposals (future Lodge Mentor portal).
create table public.lodge_change_proposals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  lodge_id uuid not null references public.lodges(id) on delete cascade,
  proposed_by uuid not null references public.user_accounts(id),
  changes jsonb not null,
  note text,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','withdrawn')),
  decided_by uuid references public.user_accounts(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Scope helpers
-- ---------------------------------------------------------------------------

-- Lodges currently allocated to me. Allocation only counts while I still hold a
-- permission that uses allocations, so stale allocations confer nothing.
create or replace function app.my_allocated_lodge_ids() returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select la.lodge_id from public.lodge_allocations la
   where la.person_id = app.current_person_id()
     and la.org_id = app.current_org_id()
     and app.is_current(la.starts_on, la.ends_on)
     and app.has_any_perm(array['lodges.write.allocated','activity.write.allocated','members.read.detail.allocated','cases.read.allocated'])
$$;

-- Lodges available to me through the (activation-gated) Lodge Mentor portal:
-- I must hold a current Lodge Mentor / Assistant Lodge Mentor appointment there,
-- hold the portal permission, and the portal must be activated for me or that Lodge.
create or replace function app.portal_lodge_ids(p_action text default 'read') returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select distinct ap.lodge_id
    from public.lodge_appointments ap
   where ap.person_id = app.current_person_id()
     and ap.org_id = app.current_org_id()
     and ap.office in ('lodge_mentor','assistant_lodge_mentor')
     and app.is_current(ap.starts_on, ap.ends_on)
     and app.mfa_satisfied()
     and app.feature_action_enabled('lodge_portal', p_action)
     and exists (select 1 from app.granted_permissions() g where g = 'lodge_portal.' || p_action)
     and (
       app.feature_activated_for_me('lodge_portal', p_action)
       or exists (select 1 from public.feature_activations fa
                   where fa.org_id = ap.org_id and fa.feature_key = 'lodge_portal' and fa.active
                     and fa.scope_type = 'lodge' and fa.lodge_id = ap.lodge_id
                     and coalesce((fa.actions ->> p_action)::boolean, false))
     )
$$;

-- Permission on a specific Lodge for a base capability, e.g. 'activity.write'
-- resolves to '<base>.all' or ('<base>.allocated' and allocated to me).
create or replace function app.can_on_lodge(p_base text, p_lodge uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select app.has_perm(p_base || '.all')
      or (app.has_perm(p_base || '.allocated') and p_lodge in (select app.my_allocated_lodge_ids()))
$$;

-- Primary Lodge of a person (current membership).
create or replace function app.person_lodge_ids(p_person uuid) returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select lodge_id from public.lodge_memberships where person_id = p_person and left_on is null
$$;

create or replace function app.in_portal_lodge(p_person uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.lodge_memberships m
                  where m.person_id = p_person and m.left_on is null and m.lodge_id in (select app.portal_lodge_ids()))
      or exists (select 1 from public.lodge_appointments a
                  where a.person_id = p_person and app.is_current(a.starts_on, a.ends_on) and a.lodge_id in (select app.portal_lodge_ids()))
$$;

create or replace function app.can_on_person(p_base text, p_person uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select app.has_perm(p_base || '.all')
      or (app.has_perm(p_base || '.allocated') and exists (
            select 1 from app.person_lodge_ids(p_person) l where l in (select app.my_allocated_lodge_ids())))
$$;

-- ---------------------------------------------------------------------------
-- Audit triggers
-- ---------------------------------------------------------------------------
create trigger lodges_audit after insert or update or delete on public.lodges for each row execute function app.audit_row();
create trigger lodge_appointments_audit after insert or update or delete on public.lodge_appointments for each row execute function app.audit_row();
create trigger lodge_allocations_audit after insert or update or delete on public.lodge_allocations for each row execute function app.audit_row();
create trigger lodge_memberships_audit after insert or update or delete on public.lodge_memberships for each row execute function app.audit_row();
create trigger mentoring_statuses_audit after insert or update or delete on public.mentoring_statuses for each row execute function app.audit_row();
create trigger provincial_appointments_audit after insert or update or delete on public.provincial_appointments for each row execute function app.audit_row();

-- Keep status history whenever a Lodge's mentoring status changes.
create or replace function app.record_lodge_status() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.mentoring_status_id is distinct from old.mentoring_status_id and new.mentoring_status_id is not null then
    insert into public.lodge_status_history(org_id, lodge_id, status_id, previous_status_id, changed_by)
    values (new.org_id, new.id, new.mentoring_status_id, old.mentoring_status_id, app.current_account_id());
    new.mentoring_status_changed_at := now();
  end if;
  return new;
end $$;
create trigger lodges_status_history before update on public.lodges for each row execute function app.record_lodge_status();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.meeting_centres enable row level security;
alter table public.areas enable row level security;
alter table public.mentoring_statuses enable row level security;
alter table public.lodges enable row level security;
alter table public.lodge_appointments enable row level security;
alter table public.provincial_appointments enable row level security;
alter table public.lodge_allocations enable row level security;
alter table public.lodge_memberships enable row level security;
alter table public.lodge_mentoring_profiles enable row level security;
alter table public.lodge_reviews enable row level security;
alter table public.lodge_status_history enable row level security;
alter table public.lodge_change_proposals enable row level security;

-- Ordinary Lodge information: province-wide for lodges.read, or my portal Lodges.
create policy read_mc on public.meeting_centres for select to authenticated
  using (org_id = app.current_org_id() and (app.has_perm('lodges.read') or exists (select 1 from public.lodges l where l.meeting_centre_id = meeting_centres.id and l.id in (select app.portal_lodge_ids()))));
create policy write_mc on public.meeting_centres for all to authenticated
  using (org_id = app.current_org_id() and app.has_perm('lodges.write.all'))
  with check (org_id = app.current_org_id() and app.has_perm('lodges.write.all'));

create policy read_areas on public.areas for select to authenticated
  using (org_id = app.current_org_id() and app.has_perm('lodges.read'));
create policy write_areas on public.areas for all to authenticated
  using (org_id = app.current_org_id() and app.has_perm('allocations.manage'))
  with check (org_id = app.current_org_id() and app.has_perm('allocations.manage'));

create policy read_statuses on public.mentoring_statuses for select to authenticated
  using (org_id = app.current_org_id() and (app.has_perm('lodges.read') or exists (select 1 from app.portal_lodge_ids())));
create policy write_statuses on public.mentoring_statuses for all to authenticated
  using (org_id = app.current_org_id() and app.has_perm('admin.config'))
  with check (org_id = app.current_org_id() and app.has_perm('admin.config'));

create policy read_lodges on public.lodges for select to authenticated
  using (org_id = app.current_org_id() and (app.has_perm('lodges.read') or id in (select app.portal_lodge_ids())));
create policy insert_lodges on public.lodges for insert to authenticated
  with check (org_id = app.current_org_id() and app.has_perm('lodges.write.all'));
create policy update_lodges on public.lodges for update to authenticated
  using (org_id = app.current_org_id() and app.can_on_lodge('lodges.write', id))
  with check (org_id = app.current_org_id());

create policy read_appointments on public.lodge_appointments for select to authenticated
  using (org_id = app.current_org_id() and (app.has_perm('lodges.read') or lodge_id in (select app.portal_lodge_ids())));
create policy write_appointments on public.lodge_appointments for all to authenticated
  using (org_id = app.current_org_id() and app.can_on_lodge('lodges.write', lodge_id))
  with check (org_id = app.current_org_id() and app.can_on_lodge('lodges.write', lodge_id));

create policy read_prov_appointments on public.provincial_appointments for select to authenticated
  using (org_id = app.current_org_id() and (app.has_perm('hub.access_management') or person_id = app.current_person_id()));
create policy write_prov_appointments on public.provincial_appointments for all to authenticated
  using (org_id = app.current_org_id() and app.has_perm('allocations.manage'))
  with check (org_id = app.current_org_id() and app.has_perm('allocations.manage'));

create policy read_allocations on public.lodge_allocations for select to authenticated
  using (org_id = app.current_org_id() and app.has_perm('lodges.read'));
create policy write_allocations on public.lodge_allocations for all to authenticated
  using (org_id = app.current_org_id() and app.has_perm('allocations.manage'))
  with check (org_id = app.current_org_id() and app.has_perm('allocations.manage'));

-- Memberships are basic membership information.
create policy read_memberships on public.lodge_memberships for select to authenticated
  using (org_id = app.current_org_id() and (
    person_id = app.current_person_id()
    or app.has_perm('members.read.basic')
    or lodge_id in (select app.portal_lodge_ids())));
create policy write_memberships on public.lodge_memberships for all to authenticated
  using (org_id = app.current_org_id() and app.can_on_lodge('members.write', lodge_id))
  with check (org_id = app.current_org_id() and app.can_on_lodge('members.write', lodge_id));

create policy read_profiles on public.lodge_mentoring_profiles for select to authenticated
  using (org_id = app.current_org_id() and (app.has_perm('lodges.read') or lodge_id in (select app.portal_lodge_ids())));
create policy write_profiles on public.lodge_mentoring_profiles for all to authenticated
  using (org_id = app.current_org_id() and app.can_on_lodge('lodges.write', lodge_id))
  with check (org_id = app.current_org_id() and app.can_on_lodge('lodges.write', lodge_id));

create policy read_reviews on public.lodge_reviews for select to authenticated
  using (org_id = app.current_org_id() and (app.can_on_lodge('activity.read', lodge_id) or lodge_id in (select app.portal_lodge_ids())));
create policy write_reviews on public.lodge_reviews for all to authenticated
  using (org_id = app.current_org_id() and app.can_on_lodge('activity.write', lodge_id))
  with check (org_id = app.current_org_id() and app.can_on_lodge('activity.write', lodge_id));

create policy read_status_history on public.lodge_status_history for select to authenticated
  using (org_id = app.current_org_id() and app.has_perm('lodges.read'));

create policy read_proposals on public.lodge_change_proposals for select to authenticated
  using (org_id = app.current_org_id() and (app.can_on_lodge('lodges.write', lodge_id) or proposed_by = app.current_account_id()));
create policy create_proposals on public.lodge_change_proposals for insert to authenticated
  with check (org_id = app.current_org_id() and proposed_by = app.current_account_id()
              and lodge_id in (select app.portal_lodge_ids('update')));
create policy decide_proposals on public.lodge_change_proposals for update to authenticated
  using (org_id = app.current_org_id() and app.can_on_lodge('lodges.write', lodge_id))
  with check (org_id = app.current_org_id());
