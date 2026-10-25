-- Communications (Resend), outbox, delivery events, notifications.

create table public.comm_preferences (
  person_id uuid primary key references public.persons(id) on delete cascade,
  org_id uuid not null references public.organisations(id),
  learning boolean not null default true,
  events boolean not null default true,
  news boolean not null default false,          -- optional/promotional: opt-in
  unsubscribed_all_at timestamptz,               -- does not stop essential operational email
  email_status text not null default 'ok' check (email_status in ('ok','bounced','complained','invalid')),
  email_status_at timestamptz,
  unsubscribe_token text not null unique default encode(gen_random_bytes(18), 'hex'),
  updated_at timestamptz not null default now()
);

create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  key text not null,
  name text not null,
  kind text not null check (kind in ('campaign','transactional')),
  subject text not null,
  body_markdown text not null,
  is_system boolean not null default false,
  updated_by uuid references public.user_accounts(id),
  updated_at timestamptz not null default now(),
  unique (org_id, key)
);

create table public.segments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  name text not null,
  definition jsonb not null,
  created_by uuid references public.user_accounts(id) default app.current_account_id(),
  shared boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  title text not null,
  subject text not null,
  preheader text,
  body_markdown text not null default '',
  template_id uuid references public.email_templates(id),
  category text not null default 'news' check (category in ('operational','learning','events','news')),
  scope text not null default 'allocated' check (scope in ('province','allocated')),
  audience jsonb not null default '{"filters":{},"include":[],"exclude":[]}'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  reply_to text,
  status text not null default 'draft' check (status in ('draft','pending_approval','approved','scheduled','sending','sent','cancelled','failed')),
  created_by uuid references public.user_accounts(id) default app.current_account_id(),
  submitted_at timestamptz,
  approved_by uuid references public.user_accounts(id),
  approved_at timestamptz,
  approval_note text,
  scheduled_for timestamptz,
  sent_at timestamptz,
  recipient_count int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger campaigns_touch before update on public.campaigns for each row execute function app.touch_updated_at();

create table public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  person_id uuid references public.persons(id),
  email citext not null,
  name text not null,
  status text not null default 'queued' check (status in ('queued','excluded','sent','delivered','bounced','failed','complained')),
  exclusion_reason text,
  provider_message_id text,
  sent_at timestamptz,
  delivered_at timestamptz,
  first_opened_at timestamptz,
  first_clicked_at timestamptz,
  open_count int not null default 0,
  click_count int not null default 0,
  unsubscribed_at timestamptz,
  error text,
  unique (campaign_id, email)
);
create index campaign_recipients_msg_idx on public.campaign_recipients(provider_message_id);

create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  to_email citext not null,
  to_person_id uuid references public.persons(id),
  subject text not null,
  html text not null,
  text_body text not null,
  category text not null check (category in ('security','operational','learning','events','news')),
  campaign_recipient_id uuid references public.campaign_recipients(id) on delete set null,
  idempotency_key text not null unique,
  status text not null default 'queued' check (status in ('queued','sending','sent','failed','cancelled','suppressed')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  provider_message_id text,
  attachments jsonb not null default '[]'::jsonb,
  reply_to text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index email_outbox_due_idx on public.email_outbox(status, next_attempt_at);

create table public.email_delivery_events (
  id bigint generated always as identity primary key,
  provider text not null default 'resend',
  provider_event_id text unique,
  provider_message_id text,
  type text not null,
  payload jsonb not null,
  occurred_at timestamptz not null default now(),
  processed_at timestamptz
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  account_id uuid not null references public.user_accounts(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  essential boolean not null default false,
  dedupe_key text,
  read_at timestamptz,
  emailed_at timestamptz,
  digested_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index notifications_dedupe on public.notifications(account_id, dedupe_key) where dedupe_key is not null;
create index notifications_account_idx on public.notifications(account_id, created_at desc);

create table public.notification_preferences (
  account_id uuid not null references public.user_accounts(id) on delete cascade,
  type text not null,
  channel text not null check (channel in ('in_app','email','daily','weekly','off')),
  primary key (account_id, type)
);

-- Create a notification for an account. Content must not include restricted text.
create or replace function app.notify(p_account uuid, p_type text, p_title text, p_body text, p_link text,
                                      p_essential boolean default false, p_dedupe text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_org uuid; v_channel text;
begin
  if p_account is null then return null; end if;
  select org_id into v_org from public.user_accounts where id = p_account and status in ('active','invited');
  if v_org is null then return null; end if;
  select channel into v_channel from public.notification_preferences where account_id = p_account and type = p_type;
  if v_channel = 'off' and not p_essential then return null; end if;
  insert into public.notifications(org_id, account_id, type, title, body, link, essential, dedupe_key)
  values (v_org, p_account, p_type, p_title, p_body, p_link, p_essential, p_dedupe)
  on conflict (account_id, dedupe_key) where dedupe_key is not null do nothing
  returning id into v_id;
  return v_id;
end $$;

create trigger campaigns_audit after insert or update or delete on public.campaigns for each row execute function app.audit_row();
create trigger email_templates_audit after insert or update or delete on public.email_templates for each row execute function app.audit_row();
create trigger comm_preferences_audit after update on public.comm_preferences for each row execute function app.audit_row();

alter table public.comm_preferences enable row level security;
alter table public.email_templates enable row level security;
alter table public.segments enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.email_outbox enable row level security;
alter table public.email_delivery_events enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;

create policy own_comm_prefs on public.comm_preferences for select to authenticated
  using (person_id = app.current_person_id() or (org_id = app.current_org_id() and app.has_perm('comms.use')));
create policy update_own_comm_prefs on public.comm_preferences for update to authenticated
  using (person_id = app.current_person_id())
  with check (person_id = app.current_person_id() and email_status = (select cp.email_status from public.comm_preferences cp where cp.person_id = app.current_person_id()));

create policy read_templates on public.email_templates for select to authenticated
  using (org_id = app.current_org_id() and app.has_perm('comms.use'));
create policy write_templates on public.email_templates for all to authenticated
  using (org_id = app.current_org_id() and app.has_perm('comms.templates'))
  with check (org_id = app.current_org_id() and app.has_perm('comms.templates'));

create policy read_segments on public.segments for select to authenticated
  using (org_id = app.current_org_id() and app.has_perm('comms.use') and (shared or created_by = app.current_account_id() or app.has_perm('comms.approve')));
create policy write_segments on public.segments for all to authenticated
  using (org_id = app.current_org_id() and app.has_perm('comms.use') and created_by = app.current_account_id())
  with check (org_id = app.current_org_id() and app.has_perm('comms.use') and created_by = app.current_account_id());

create policy read_campaigns on public.campaigns for select to authenticated
  using (org_id = app.current_org_id() and app.has_perm('comms.use') and (created_by = app.current_account_id() or app.has_perm('comms.approve')));
create policy insert_campaigns on public.campaigns for insert to authenticated
  with check (org_id = app.current_org_id() and created_by = app.current_account_id() and status = 'draft'
              and ((scope = 'allocated' and app.has_perm('comms.send.allocated')) or (scope = 'province' and app.has_perm('comms.send.province'))));
create policy update_draft_campaigns on public.campaigns for update to authenticated
  using (org_id = app.current_org_id() and created_by = app.current_account_id() and status = 'draft')
  with check (org_id = app.current_org_id() and status = 'draft'
              and ((scope = 'allocated' and app.has_perm('comms.send.allocated')) or (scope = 'province' and app.has_perm('comms.send.province'))));
-- Submission, approval and sending go through definer functions.

create policy read_recipients on public.campaign_recipients for select to authenticated
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and c.org_id = app.current_org_id()
                  and app.has_perm('comms.use') and (c.created_by = app.current_account_id() or app.has_perm('comms.approve'))));

create policy read_outbox on public.email_outbox for select to authenticated
  using (org_id = app.current_org_id() and app.has_perm('system.health'));

create policy own_notifications on public.notifications for select to authenticated
  using (account_id = app.current_account_id());
create policy mark_notifications on public.notifications for update to authenticated
  using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());

create policy own_notification_prefs on public.notification_preferences for all to authenticated
  using (account_id = app.current_account_id()) with check (account_id = app.current_account_id());
