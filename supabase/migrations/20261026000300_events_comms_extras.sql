-- Events, calendar, communications and account extras.
--  1. Users may create their own calendar feed tokens (only the sha256 hash is stored).
--  2. A dedicated private bucket for campaign attachments (the documents bucket is
--     limited to docs.manage and to files linked to document versions).
--  3. Contact detail change requests: members ask, the Provincial team updates the record.

-- 1. Calendar feed tokens -------------------------------------------------------
create policy create_feed_tokens on public.calendar_feed_tokens for insert to authenticated
  with check (account_id = app.current_account_id() and org_id = app.current_org_id()
              and token_hash ~ '^[0-9a-f]{64}$' and revoked_at is null);

-- 2. Campaign attachments ---------------------------------------------------------
-- Path: <org_id>/comms/<campaign_id>/<file name>
insert into storage.buckets(id, name, public, file_size_limit) values ('comms-attachments', 'comms-attachments', false, 10485760)
on conflict (id) do nothing;

create or replace function app.can_edit_campaign_files(p_name text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select (storage.foldername(p_name))[1] = app.current_org_id()::text
     and (storage.foldername(p_name))[2] = 'comms'
     and exists (select 1 from public.campaigns c
                  where c.id::text = (storage.foldername(p_name))[3]
                    and c.org_id = app.current_org_id()
                    and c.created_by = app.current_account_id()
                    and c.status = 'draft'
                    and app.has_perm('comms.use'))
$$;

create or replace function app.can_read_campaign_files(p_name text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select (storage.foldername(p_name))[1] = app.current_org_id()::text
     and (storage.foldername(p_name))[2] = 'comms'
     and exists (select 1 from public.campaigns c
                  where c.id::text = (storage.foldername(p_name))[3]
                    and c.org_id = app.current_org_id()
                    and app.has_perm('comms.use')
                    and (c.created_by = app.current_account_id() or app.has_perm('comms.approve')))
$$;

revoke execute on function app.can_edit_campaign_files(text) from public, anon;
revoke execute on function app.can_read_campaign_files(text) from public, anon;
grant execute on function app.can_edit_campaign_files(text) to authenticated, service_role;
grant execute on function app.can_read_campaign_files(text) to authenticated, service_role;

create policy comms_attachments_read on storage.objects for select to authenticated
  using (bucket_id = 'comms-attachments' and app.can_read_campaign_files(name));
create policy comms_attachments_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'comms-attachments' and app.can_edit_campaign_files(name));
create policy comms_attachments_delete on storage.objects for delete to authenticated
  using (bucket_id = 'comms-attachments' and app.can_edit_campaign_files(name));

-- 3. Contact detail change requests ----------------------------------------------
create table public.contact_change_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  person_id uuid not null references public.persons(id) on delete cascade,
  details text not null check (length(trim(details)) between 3 and 2000),
  status text not null default 'open' check (status in ('open','done','declined')),
  created_at timestamptz not null default now(),
  handled_by uuid references public.user_accounts(id),
  handled_at timestamptz,
  handled_note text
);
create index contact_change_requests_person_idx on public.contact_change_requests(person_id, created_at desc);
create trigger contact_change_requests_audit after insert or update or delete on public.contact_change_requests
  for each row execute function app.audit_row();

alter table public.contact_change_requests enable row level security;

create policy read_contact_requests on public.contact_change_requests for select to authenticated
  using (org_id = app.current_org_id()
         and (person_id = app.current_person_id() or app.has_any_perm(array['members.write.all','admin.users'])));
create policy handle_contact_requests on public.contact_change_requests for update to authenticated
  using (org_id = app.current_org_id() and app.has_any_perm(array['members.write.all','admin.users']))
  with check (org_id = app.current_org_id() and app.has_any_perm(array['members.write.all','admin.users']));
-- Inserts go through account_request_contact_change().

create or replace function public.account_request_contact_change(p_details text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_org uuid; v_person uuid; v_name text; v_acc uuid; v_recent int;
begin
  v_person := app.current_person_id();
  v_org := app.current_org_id();
  perform app.require(v_person is not null and app.current_account_id() is not null, 'Please sign in');
  perform app.require(length(trim(coalesce(p_details, ''))) between 3 and 2000, 'Please describe the change (up to 2000 characters)');
  select count(*) into v_recent from public.contact_change_requests
   where person_id = v_person and created_at > now() - interval '1 hour';
  perform app.require(v_recent < 5, 'You have sent several requests recently. The Provincial team will be in touch.');
  insert into public.contact_change_requests(org_id, person_id, details) values (v_org, v_person, trim(p_details))
  returning id into v_id;
  select display_name into v_name from public.persons where id = v_person;
  for v_acc in
    select distinct ra.account_id from public.role_assignments ra
      join public.role_permissions rp on rp.role_id = ra.role_id
      join public.user_accounts ua on ua.id = ra.account_id
     where rp.permission_key = 'members.write.all' and app.is_current(ra.starts_on, ra.ends_on)
       and ra.org_id = v_org and ua.status = 'active' and ua.person_id <> v_person
  loop
    perform app.notify(v_acc, 'details_change', 'Contact details change requested',
                       coalesce(v_name, 'A member') || ' has asked for their contact details to be updated.',
                       '/members/' || v_person, false, 'details-change:' || v_id || ':' || v_acc);
  end loop;
  perform app.audit('person.contact_change_requested', 'person', v_person::text, jsonb_build_object('request_id', v_id));
  return v_id;
end $$;

revoke execute on function public.account_request_contact_change(text) from anon, public;
grant execute on function public.account_request_contact_change(text) to authenticated;
