-- Membership imports, domain events, workflows, integrations, reports, saved views, retention.

-- ---------------------------------------------------------------------------
-- Imports (Hermes / Adelphi / Portal reports). Upload -> Identify -> Validate ->
-- Match -> Preview -> Resolve -> Approve -> Commit -> Audit.
-- ---------------------------------------------------------------------------
create table public.import_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  name text not null,
  source text not null check (source in ('hermes','adelphi','portal','other')),
  report_kind text not null default 'membership' check (report_kind in ('membership','officers','degrees','lodges')),
  mapping jsonb not null,           -- { "Source column": "target_field" }
  header_signature text[],          -- used to identify report format
  options jsonb not null default '{}'::jsonb,
  created_by uuid references public.user_accounts(id) default app.current_account_id(),
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  template_id uuid references public.import_templates(id),
  source text not null,
  file_name text not null,
  storage_path text,
  status text not null default 'uploaded' check (status in ('uploaded','validated','approved','committing','committed','failed','cancelled')),
  is_partial boolean not null default true,     -- partial reports never imply departures
  scope_lodge_ids uuid[] not null default '{}',
  stats jsonb not null default '{}'::jsonb,
  uploaded_by uuid references public.user_accounts(id) default app.current_account_id(),
  approved_by uuid references public.user_accounts(id),
  approved_at timestamptz,
  committed_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create table public.import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  row_no int not null,
  raw jsonb not null,
  data jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  outcome text not null check (outcome in ('new','update','unchanged','duplicate','conflict','invalid','possible_removal')),
  matched_person_id uuid references public.persons(id),
  candidate_person_ids uuid[] not null default '{}',
  diff jsonb not null default '{}'::jsonb,
  decision text not null default 'pending' check (decision in ('pending','accept','skip','merge','create_new')),
  decision_person_id uuid references public.persons(id),
  decided_by uuid references public.user_accounts(id),
  applied_at timestamptz,
  unique (batch_id, row_no)
);
create index import_rows_batch_idx on public.import_rows(batch_id, outcome);

-- ---------------------------------------------------------------------------
-- Domain events (transactional outbox) and workflows
-- ---------------------------------------------------------------------------
create table public.domain_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  type text not null,
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  actor_account_id uuid,
  occurred_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts int not null default 0,
  last_error text
);
create index domain_events_pending_idx on public.domain_events(processed_at, occurred_at) where processed_at is null;

create or replace function app.emit(p_org uuid, p_type text, p_entity_type text, p_entity_id uuid, p_payload jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  insert into public.domain_events(org_id, type, entity_type, entity_id, payload, actor_account_id)
  values (p_org, p_type, p_entity_type, p_entity_id, coalesce(p_payload,'{}'::jsonb), app.current_account_id())
  returning id into v_id;
  return v_id;
end $$;

create table public.workflows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  name text not null,
  description text not null default '',
  trigger_key text not null,
  conditions jsonb not null default '[]'::jsonb,   -- [{ "field": "...", "op": "eq", "value": ... }]
  actions jsonb not null default '[]'::jsonb,      -- [{ "type": "create_task", "params": {...} }]
  enabled boolean not null default false,
  requires_approval boolean not null default false,
  is_system boolean not null default false,
  created_by uuid references public.user_accounts(id) default app.current_account_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger workflows_touch before update on public.workflows for each row execute function app.touch_updated_at();

create table public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  domain_event_id uuid references public.domain_events(id),
  idempotency_key text not null unique,
  dry_run boolean not null default false,
  status text not null default 'pending' check (status in ('pending','pending_approval','running','succeeded','failed','skipped','cancelled')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  results jsonb not null default '[]'::jsonb,
  error text,
  approved_by uuid references public.user_accounts(id),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index workflow_runs_due_idx on public.workflow_runs(status, next_attempt_at);

-- ---------------------------------------------------------------------------
-- Integrations and failures
-- ---------------------------------------------------------------------------
create table public.integrations (
  org_id uuid not null references public.organisations(id),
  key text not null check (key in ('resend','octra_lodge','membership_feed','calendar')),
  status text not null default 'not_configured' check (status in ('not_configured','simulated','active','error','disabled')),
  config jsonb not null default '{}'::jsonb,       -- never secrets
  notes text,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (org_id, key)
);

create table public.integration_failures (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  integration_key text not null,
  operation text not null,
  message text not null,
  context jsonb not null default '{}'::jsonb,
  retryable boolean not null default true,
  occurred_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.user_accounts(id)
);

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
create table public.saved_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  owner_account_id uuid not null references public.user_accounts(id) default app.current_account_id(),
  name text not null,
  dataset text not null,
  config jsonb not null,
  shared boolean not null default false,
  schedule text not null default 'none' check (schedule in ('none','weekly','monthly','quarterly')),
  last_run_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.report_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  kind text not null check (kind in ('quarterly','period','scheduled')),
  period_start date not null,
  period_end date not null,
  data jsonb not null,
  created_by uuid references public.user_accounts(id) default app.current_account_id(),
  created_at timestamptz not null default now()
);

create table public.quarterly_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  year int not null,
  quarter int not null check (quarter between 1 and 4),
  status text not null default 'draft' check (status in ('draft','review','approved','published')),
  snapshot_id uuid references public.report_snapshots(id),
  narrative jsonb not null default '{}'::jsonb,
  observations text,
  generated_by uuid references public.user_accounts(id) default app.current_account_id(),
  generated_at timestamptz not null default now(),
  approved_by uuid references public.user_accounts(id),
  approved_at timestamptz,
  published_at timestamptz,
  unique (org_id, year, quarter)
);

create table public.saved_views (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  account_id uuid not null references public.user_accounts(id) on delete cascade default app.current_account_id(),
  page text not null,
  name text not null,
  filters jsonb not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Retention
-- ---------------------------------------------------------------------------
create table public.retention_policies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  entity_type text not null check (entity_type in ('persons_departed','contacts','notes','cases_closed','import_rows','email_outbox','notifications','audit_events')),
  retain_months int not null check (retain_months > 0),
  action text not null check (action in ('anonymise','delete','archive')),
  basis text not null,
  enabled boolean not null default false,
  unique (org_id, entity_type)
);
create table public.retention_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  policy_id uuid references public.retention_policies(id),
  dry_run boolean not null,
  affected int not null,
  details jsonb not null default '{}'::jsonb,
  run_by uuid references public.user_accounts(id),
  run_at timestamptz not null default now()
);

create trigger import_batches_audit after insert or update on public.import_batches for each row execute function app.audit_row();
create trigger workflows_audit after insert or update or delete on public.workflows for each row execute function app.audit_row();
create trigger workflow_runs_audit after insert or update on public.workflow_runs for each row execute function app.audit_row();
create trigger integrations_audit after insert or update on public.integrations for each row execute function app.audit_row();
create trigger quarterly_reports_audit after insert or update on public.quarterly_reports for each row execute function app.audit_row();
create trigger retention_policies_audit after insert or update or delete on public.retention_policies for each row execute function app.audit_row();

alter table public.import_templates enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;
alter table public.domain_events enable row level security;
alter table public.workflows enable row level security;
alter table public.workflow_runs enable row level security;
alter table public.integrations enable row level security;
alter table public.integration_failures enable row level security;
alter table public.saved_reports enable row level security;
alter table public.report_snapshots enable row level security;
alter table public.quarterly_reports enable row level security;
alter table public.saved_views enable row level security;
alter table public.retention_policies enable row level security;
alter table public.retention_runs enable row level security;

create policy imports_templates on public.import_templates for all to authenticated
  using (org_id = app.current_org_id() and app.has_perm('imports.run'))
  with check (org_id = app.current_org_id() and app.has_perm('imports.run'));
create policy imports_batches_read on public.import_batches for select to authenticated
  using (org_id = app.current_org_id() and app.has_perm('imports.run'));
create policy imports_batches_insert on public.import_batches for insert to authenticated
  with check (org_id = app.current_org_id() and app.has_perm('imports.run') and status = 'uploaded');
create policy imports_rows_read on public.import_rows for select to authenticated
  using (exists (select 1 from public.import_batches b where b.id = batch_id and b.org_id = app.current_org_id() and app.has_perm('imports.run')));
create policy imports_rows_decide on public.import_rows for update to authenticated
  using (exists (select 1 from public.import_batches b where b.id = batch_id and b.status = 'validated' and b.org_id = app.current_org_id() and app.has_perm('imports.run')))
  with check (exists (select 1 from public.import_batches b where b.id = batch_id and b.status = 'validated'));

create policy read_domain_events on public.domain_events for select to authenticated
  using (org_id = app.current_org_id() and app.has_perm('system.health'));

create policy read_workflows on public.workflows for select to authenticated
  using (org_id = app.current_org_id() and app.has_any_perm(array['workflows.manage','system.health']));
create policy write_workflows on public.workflows for all to authenticated
  using (org_id = app.current_org_id() and app.has_perm('workflows.manage'))
  with check (org_id = app.current_org_id() and app.has_perm('workflows.manage'));
create policy read_workflow_runs on public.workflow_runs for select to authenticated
  using (org_id = app.current_org_id() and app.has_any_perm(array['workflows.manage','system.health']));

create policy read_integrations on public.integrations for select to authenticated
  using (org_id = app.current_org_id() and app.has_any_perm(array['system.health','admin.config']));
create policy write_integrations on public.integrations for update to authenticated
  using (org_id = app.current_org_id() and app.has_perm('admin.config'))
  with check (org_id = app.current_org_id());
create policy read_failures on public.integration_failures for select to authenticated
  using (org_id = app.current_org_id() and app.has_perm('system.health'));
create policy resolve_failures on public.integration_failures for update to authenticated
  using (org_id = app.current_org_id() and app.has_perm('system.health'))
  with check (org_id = app.current_org_id());

create policy own_saved_reports on public.saved_reports for select to authenticated
  using (org_id = app.current_org_id() and app.has_perm('reports.read') and (owner_account_id = app.current_account_id() or shared));
create policy write_saved_reports on public.saved_reports for all to authenticated
  using (org_id = app.current_org_id() and owner_account_id = app.current_account_id())
  with check (org_id = app.current_org_id() and owner_account_id = app.current_account_id() and app.has_perm('reports.read'));

create policy read_snapshots on public.report_snapshots for select to authenticated
  using (org_id = app.current_org_id() and app.has_perm('reports.quarterly'));
create policy read_quarterly on public.quarterly_reports for select to authenticated
  using (org_id = app.current_org_id() and app.has_perm('reports.quarterly'));
create policy update_quarterly on public.quarterly_reports for update to authenticated
  using (org_id = app.current_org_id() and app.has_perm('reports.quarterly') and status in ('draft','review'))
  with check (org_id = app.current_org_id() and status in ('draft','review'));

create policy own_views on public.saved_views for all to authenticated
  using (account_id = app.current_account_id())
  with check (account_id = app.current_account_id() and org_id = app.current_org_id());

create policy read_retention on public.retention_policies for select to authenticated
  using (org_id = app.current_org_id() and app.has_any_perm(array['admin.config','system.health']));
create policy write_retention on public.retention_policies for all to authenticated
  using (org_id = app.current_org_id() and app.has_perm('admin.config'))
  with check (org_id = app.current_org_id() and app.has_perm('admin.config'));
create policy read_retention_runs on public.retention_runs for select to authenticated
  using (org_id = app.current_org_id() and app.has_any_perm(array['admin.config','system.health']));
