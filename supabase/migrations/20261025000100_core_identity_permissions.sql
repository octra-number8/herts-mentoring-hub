-- Core: organisations, people, accounts, roles, permissions, feature activation, audit.
-- Authentication accounts, person records, Masonic appointments and application
-- permissions are modelled separately (brief 2.D).

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists citext;

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- An effective-dated row is current when it started on or before today and
-- has not ended (ends_on is the last day inclusive).
create or replace function app.is_current(starts date, ends date, at_date date default current_date)
returns boolean language sql immutable as $$
  select coalesce(starts, '-infinity'::date) <= at_date and (ends is null or ends >= at_date)
$$;

-- ---------------------------------------------------------------------------
-- Organisations (Province). Built for Hertfordshire, not hard-coded to it.
-- ---------------------------------------------------------------------------
create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  short_name text not null,
  settings jsonb not null default '{}'::jsonb,
  branding jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger organisations_touch before update on public.organisations
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Persons: one record per individual. Never identified solely by email.
-- ---------------------------------------------------------------------------
create table public.persons (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  title text,                       -- Masonic or courtesy prefix, e.g. 'W Bro'
  first_name text not null,
  last_name text not null,
  display_name text generated always as (trim(coalesce(title || ' ', '') || first_name || ' ' || last_name)) stored,
  email citext,
  phone text,
  membership_number text,           -- upstream (Hermes/Adelphi) reference
  status text not null default 'active' check (status in ('active','resigned','ceased','deceased','excluded','unknown')),
  status_changed_on date,
  is_restricted boolean not null default false, -- individual record restriction
  anonymised_at timestamptz,
  source text not null default 'local' check (source in ('local','import','invitation')),
  local_corrections jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index persons_membership_number_uq on public.persons(org_id, membership_number) where membership_number is not null;
create index persons_org_idx on public.persons(org_id);
create index persons_email_idx on public.persons(org_id, email);
create index persons_name_trgm on public.persons using gin ((first_name || ' ' || last_name) gin_trgm_ops);
create trigger persons_touch before update on public.persons for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- User accounts: application login linked to exactly one person.
-- ---------------------------------------------------------------------------
create table public.user_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  person_id uuid not null references public.persons(id),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  status text not null default 'invited' check (status in ('invited','active','suspended','deactivated')),
  mfa_required boolean not null default false,
  last_sign_in_at timestamptz,
  status_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person_id)
);
create index user_accounts_org_idx on public.user_accounts(org_id);
create trigger user_accounts_touch before update on public.user_accounts for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Permission catalogue (global) and feature modules.
-- ---------------------------------------------------------------------------
create table public.features (
  key text primary key,
  name text not null,
  description text not null,
  activation_mode text not null check (activation_mode in ('all_permitted','activation_required'))
);

create table public.permissions (
  key text primary key,
  feature_key text not null references public.features(key),
  action text not null check (action in ('read','create','update','approve','export')),
  description text not null
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  key text not null,
  name text not null,
  description text not null default '',
  is_management boolean not null default false,  -- management roles require MFA
  is_system boolean not null default true,
  unique (org_id, key)
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  primary key (role_id, permission_key)
);

create table public.role_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  account_id uuid not null references public.user_accounts(id) on delete cascade,
  role_id uuid not null references public.roles(id),
  starts_on date not null default current_date,
  ends_on date,
  granted_by uuid references public.user_accounts(id),
  reason text,
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on - 1)
);
create index role_assignments_account_idx on public.role_assignments(account_id);

-- Individual permission grants: delegated access and audited overrides.
create table public.permission_grants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  account_id uuid not null references public.user_accounts(id) on delete cascade,
  permission_key text not null references public.permissions(key),
  starts_on date not null default current_date,
  ends_on date,
  is_override boolean not null default false,
  granted_by uuid references public.user_accounts(id),
  reason text not null,
  created_at timestamptz not null default now()
);
create index permission_grants_account_idx on public.permission_grants(account_id);

-- Organisation-level feature state. Actions toggle read/create/update/approve/export.
create table public.feature_settings (
  org_id uuid not null references public.organisations(id),
  feature_key text not null references public.features(key),
  enabled boolean not null default true,
  actions jsonb not null default '{"read":true,"create":true,"update":true,"approve":true,"export":true}'::jsonb,
  updated_by uuid references public.user_accounts(id),
  updated_at timestamptz not null default now(),
  primary key (org_id, feature_key)
);

-- Targeted activations for features that require activation (e.g. Lodge Mentor portal).
create table public.feature_activations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  feature_key text not null references public.features(key),
  scope_type text not null check (scope_type in ('account','lodge','role')),
  account_id uuid references public.user_accounts(id) on delete cascade,
  lodge_id uuid,      -- FK added once lodges exist
  role_id uuid references public.roles(id) on delete cascade,
  actions jsonb not null default '{"read":true,"create":false,"update":false,"approve":false,"export":false}'::jsonb,
  active boolean not null default true,
  activated_by uuid references public.user_accounts(id),
  reason text not null default '',
  created_at timestamptz not null default now(),
  deactivated_at timestamptz,
  check (
    (scope_type = 'account' and account_id is not null and lodge_id is null and role_id is null) or
    (scope_type = 'lodge' and lodge_id is not null and account_id is null and role_id is null) or
    (scope_type = 'role' and role_id is not null and account_id is null and lodge_id is null)
  )
);
create index feature_activations_lookup on public.feature_activations(org_id, feature_key) where active;

-- ---------------------------------------------------------------------------
-- Invitations (invitation-only account creation).
-- ---------------------------------------------------------------------------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  person_id uuid not null references public.persons(id),
  email citext not null,
  role_keys text[] not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  invited_by uuid references public.user_accounts(id),
  message text,
  created_at timestamptz not null default now()
);
create index invitations_person_idx on public.invitations(person_id);

-- ---------------------------------------------------------------------------
-- Audit (append-only)
-- ---------------------------------------------------------------------------
create table public.audit_events (
  id bigint generated always as identity primary key,
  org_id uuid references public.organisations(id),
  actor_account_id uuid,
  actor_auth_id uuid,
  action text not null,
  entity_type text,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index audit_events_entity_idx on public.audit_events(entity_type, entity_id);
create index audit_events_org_time_idx on public.audit_events(org_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Session helpers (security definer so policies can call them without recursion)
-- ---------------------------------------------------------------------------
create or replace function app.current_account_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select id from public.user_accounts where auth_user_id = auth.uid() and status = 'active'
$$;

create or replace function app.current_person_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select person_id from public.user_accounts where auth_user_id = auth.uid() and status = 'active'
$$;

create or replace function app.current_org_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select org_id from public.user_accounts where auth_user_id = auth.uid() and status = 'active'
$$;

-- True when the session satisfies the account's MFA requirement.
create or replace function app.mfa_satisfied() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select not ua.mfa_required or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
       from public.user_accounts ua where ua.auth_user_id = auth.uid() and ua.status = 'active'),
    false)
$$;

-- Permission keys the current account holds through roles or individual grants
-- (before feature gating).
create or replace function app.granted_permissions() returns setof text
language sql stable security definer set search_path = public, pg_temp as $$
  select rp.permission_key
    from public.role_assignments ra
    join public.role_permissions rp on rp.role_id = ra.role_id
   where ra.account_id = app.current_account_id()
     and app.is_current(ra.starts_on, ra.ends_on)
  union
  select pg.permission_key
    from public.permission_grants pg
   where pg.account_id = app.current_account_id()
     and app.is_current(pg.starts_on, pg.ends_on)
$$;

-- Whether a feature action is enabled for the org (gates only, never grants).
create or replace function app.feature_action_enabled(p_feature text, p_action text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select fs.enabled and coalesce((fs.actions ->> p_action)::boolean, false)
       from public.feature_settings fs
      where fs.org_id = app.current_org_id() and fs.feature_key = p_feature),
    false)
$$;

-- Account- or role-level activation for activation_required features.
-- Lodge-level activation is resolved by app.portal_lodge_ids().
create or replace function app.feature_activated_for_me(p_feature text, p_action text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.feature_activations fa
     where fa.org_id = app.current_org_id()
       and fa.feature_key = p_feature
       and fa.active
       and coalesce((fa.actions ->> p_action)::boolean, false)
       and (
         (fa.scope_type = 'account' and fa.account_id = app.current_account_id()) or
         (fa.scope_type = 'role' and fa.role_id in (
            select ra.role_id from public.role_assignments ra
             where ra.account_id = app.current_account_id() and app.is_current(ra.starts_on, ra.ends_on)))
       )
  )
$$;

-- The central permission check used by every RLS policy.
-- granted (role or grant) AND MFA satisfied AND feature enabled AND
-- (feature is generally available OR activated for this account/role).
create or replace function app.has_perm(p_key text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select app.mfa_satisfied()
       and app.feature_action_enabled(p.feature_key, p.action)
       and (f.activation_mode = 'all_permitted' or app.feature_activated_for_me(p.feature_key, p.action))
       and exists (select 1 from app.granted_permissions() g where g = p.key)
      from public.permissions p
      join public.features f on f.key = p.feature_key
     where p.key = p_key
  ), false)
$$;

create or replace function app.has_any_perm(p_keys text[]) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from unnest(p_keys) k where app.has_perm(k))
$$;

-- Audit writer callable from triggers and RPCs.
create or replace function app.audit(p_action text, p_entity_type text, p_entity_id text, p_details jsonb default '{}'::jsonb, p_org uuid default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.audit_events(org_id, actor_account_id, actor_auth_id, action, entity_type, entity_id, details)
  values (coalesce(p_org, app.current_org_id()), app.current_account_id(), auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'::jsonb));
end $$;

-- Generic row-change audit trigger. Content columns are recorded as "changed"
-- without values so that restricted text never lands in the audit log.
create or replace function app.audit_row() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_redact text[] := array['body','summary','description','details','narrative','outcome','content','minutes','notes','token_hash','raw','normalized','body_html','body_text','comment','response','answers'];
begin
  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key in ('updated_at') then continue; end if;
      if (v_old -> v_key) is distinct from (v_new -> v_key) then
        if v_key = any(v_redact) then
          v_changes := v_changes || jsonb_build_object(v_key, 'changed');
        else
          v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('from', v_old -> v_key, 'to', v_new -> v_key));
        end if;
      end if;
    end loop;
    if v_changes = '{}'::jsonb then return new; end if;
  end if;
  insert into public.audit_events(org_id, actor_account_id, actor_auth_id, action, entity_type, entity_id, details)
  values (
    nullif(v_row ->> 'org_id', '')::uuid,
    app.current_account_id(), auth.uid(),
    lower(tg_op), tg_table_name, v_row ->> 'id',
    case when tg_op = 'UPDATE' then jsonb_build_object('changes', v_changes) else '{}'::jsonb end
  );
  return coalesce(new, old);
end $$;

create trigger persons_audit after insert or update or delete on public.persons for each row execute function app.audit_row();
create trigger user_accounts_audit after insert or update or delete on public.user_accounts for each row execute function app.audit_row();
create trigger role_assignments_audit after insert or update or delete on public.role_assignments for each row execute function app.audit_row();
create trigger permission_grants_audit after insert or update or delete on public.permission_grants for each row execute function app.audit_row();
create trigger feature_settings_audit after insert or update or delete on public.feature_settings for each row execute function app.audit_row();
create trigger feature_activations_audit after insert or update or delete on public.feature_activations for each row execute function app.audit_row();
create trigger invitations_audit after insert or update on public.invitations for each row execute function app.audit_row();

-- Privileged accounts must use MFA: set automatically when a management role is assigned.
create or replace function app.sync_mfa_requirement() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_account uuid := coalesce(new.account_id, old.account_id);
begin
  update public.user_accounts ua
     set mfa_required = exists (
       select 1 from public.role_assignments ra join public.roles r on r.id = ra.role_id
        where ra.account_id = v_account and r.is_management and app.is_current(ra.starts_on, ra.ends_on))
       or exists (
       select 1 from public.permission_grants pg
        where pg.account_id = v_account and app.is_current(pg.starts_on, pg.ends_on)
          and pg.permission_key like 'admin.%')
   where ua.id = v_account
     and ua.mfa_required is distinct from (
       exists (select 1 from public.role_assignments ra join public.roles r on r.id = ra.role_id
                where ra.account_id = v_account and r.is_management and app.is_current(ra.starts_on, ra.ends_on))
       or exists (select 1 from public.permission_grants pg
                where pg.account_id = v_account and app.is_current(pg.starts_on, pg.ends_on)
                  and pg.permission_key like 'admin.%'));
  return coalesce(new, old);
end $$;
create trigger role_assignments_mfa after insert or update or delete on public.role_assignments for each row execute function app.sync_mfa_requirement();
create trigger permission_grants_mfa after insert or update or delete on public.permission_grants for each row execute function app.sync_mfa_requirement();


-- Portal scope for persons is resolved once lodges exist (redefined in the lodges migration).
create or replace function app.in_portal_lodge(p_person uuid) returns boolean
language sql stable as $$ select false $$;
create or replace function app.is_learner(p_person uuid) returns boolean
language sql stable as $$ select false $$;
create or replace function app.is_event_participant(p_person uuid) returns boolean
language sql stable as $$ select false $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.organisations enable row level security;
alter table public.persons enable row level security;
alter table public.user_accounts enable row level security;
alter table public.features enable row level security;
alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.role_assignments enable row level security;
alter table public.permission_grants enable row level security;
alter table public.feature_settings enable row level security;
alter table public.feature_activations enable row level security;
alter table public.invitations enable row level security;
alter table public.audit_events enable row level security;

create policy org_read on public.organisations for select to authenticated
  using (id = app.current_org_id());
create policy org_update on public.organisations for update to authenticated
  using (id = app.current_org_id() and app.has_perm('admin.config'))
  with check (id = app.current_org_id());

create policy catalogue_read on public.features for select to authenticated using (true);
create policy catalogue_read on public.permissions for select to authenticated using (true);

create policy roles_read on public.roles for select to authenticated
  using (org_id = app.current_org_id());
create policy role_permissions_read on public.role_permissions for select to authenticated
  using (exists (select 1 from public.roles r where r.id = role_id and r.org_id = app.current_org_id()));
create policy role_permissions_write on public.role_permissions for all to authenticated
  using (app.has_perm('admin.roles') and exists (select 1 from public.roles r where r.id = role_id and r.org_id = app.current_org_id()))
  with check (app.has_perm('admin.roles') and exists (select 1 from public.roles r where r.id = role_id and r.org_id = app.current_org_id()));

-- Persons: own record always; others need membership permissions.
-- Detailed mentoring data lives in other tables with stricter policies.
create policy persons_read on public.persons for select to authenticated
  using (org_id = app.current_org_id() and (
    id = app.current_person_id()
    or (app.has_perm('members.read.basic') and (not is_restricted or app.has_perm('notes.leadership')))
    or (not is_restricted and app.in_portal_lodge(id))
    or (app.has_perm('learning.records.read') and app.is_learner(id))
    or (app.has_perm('events.manage') and app.is_event_participant(id))
  ));
create policy persons_insert on public.persons for insert to authenticated
  with check (org_id = app.current_org_id() and app.has_any_perm(array['members.write.all','members.write.allocated','admin.users']));
create policy persons_update on public.persons for update to authenticated
  using (org_id = app.current_org_id() and app.has_any_perm(array['members.write.all','admin.users']))
  with check (org_id = app.current_org_id());

create policy accounts_read on public.user_accounts for select to authenticated
  using (org_id = app.current_org_id() and (person_id = app.current_person_id() or app.has_any_perm(array['admin.users','hub.access_management'])));
create policy accounts_write on public.user_accounts for update to authenticated
  using (org_id = app.current_org_id() and app.has_perm('admin.users'))
  with check (org_id = app.current_org_id());

create policy role_assignments_read on public.role_assignments for select to authenticated
  using (org_id = app.current_org_id() and (account_id = app.current_account_id() or app.has_any_perm(array['admin.users','admin.roles'])));
create policy role_assignments_write on public.role_assignments for all to authenticated
  using (org_id = app.current_org_id() and app.has_perm('admin.roles'))
  with check (org_id = app.current_org_id() and app.has_perm('admin.roles'));

create policy grants_read on public.permission_grants for select to authenticated
  using (org_id = app.current_org_id() and (account_id = app.current_account_id() or app.has_perm('admin.roles')));
create policy grants_write on public.permission_grants for all to authenticated
  using (org_id = app.current_org_id() and app.has_perm('admin.roles'))
  with check (org_id = app.current_org_id() and app.has_perm('admin.roles'));

create policy feature_settings_read on public.feature_settings for select to authenticated
  using (org_id = app.current_org_id());
create policy feature_settings_write on public.feature_settings for update to authenticated
  using (org_id = app.current_org_id() and app.has_perm('admin.features'))
  with check (org_id = app.current_org_id());

create policy feature_activations_read on public.feature_activations for select to authenticated
  using (org_id = app.current_org_id() and (account_id = app.current_account_id() or app.has_perm('admin.features')));
create policy feature_activations_write on public.feature_activations for all to authenticated
  using (org_id = app.current_org_id() and app.has_perm('admin.features'))
  with check (org_id = app.current_org_id() and app.has_perm('admin.features'));

create policy invitations_read on public.invitations for select to authenticated
  using (org_id = app.current_org_id() and app.has_perm('admin.users'));

create policy audit_read on public.audit_events for select to authenticated
  using (org_id = app.current_org_id() and app.has_perm('admin.audit'));
-- No insert/update/delete policies: audit rows are written only by definer functions.

grant execute on all functions in schema app to authenticated, service_role;
