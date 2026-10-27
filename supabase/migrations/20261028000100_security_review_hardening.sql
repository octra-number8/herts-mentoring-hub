-- Security review, 27 October 2026 (docs/security/security-review-2026-10.md).
--  1. Accounts are changed only by definer functions and the system, never by a
--     direct update: a technical administrator could otherwise relink a
--     leadership account to a login they control.
--  2. Audit entries about mentoring and support records are readable only by
--     designated triage, so the audit log does not reveal confidential concerns
--     to technical administrators.
--  3. Only the operational retention policies (import rows, email history,
--     notifications) can be changed by configuration administrators; every other
--     policy, including people and closed cases, needs leadership.
--  4. Campaign attachments must come from the campaign's own folder (the system
--     emails them with the service role).
--  5. Learner evidence paths must stay in the learner's own folder.
--  6. Note and contact updates meet the same rules as creating them.
--  7. Draft campaigns stay with their creator.
--  7b. Unsubscribe tokens and stored email bodies are not readable through the API.
--  8. Defence in depth: no TRUNCATE/TRIGGER/REFERENCES for API roles, and app
--     helpers are not executable by PUBLIC.

-- 1. Accounts ------------------------------------------------------------------------
drop policy if exists accounts_write on public.user_accounts;
revoke insert, update, delete on public.user_accounts from authenticated, anon;

-- 2. Audit log ------------------------------------------------------------------------
create or replace function app.audit_entity_restricted(p_entity_type text) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select p_entity_type in ('cases','case_events','case','notes','note','contacts','contact_change_requests',
                           'member_journeys','visits','tasks','access_grants')
$$;
drop policy if exists audit_read on public.audit_events;
create policy audit_read on public.audit_events for select to authenticated
  using (org_id = app.current_org_id() and app.has_perm('admin.audit')
         and (not app.audit_entity_restricted(entity_type) or app.has_perm('cases.confidential.triage')));

-- 3. Retention ------------------------------------------------------------------------
drop policy if exists write_retention on public.retention_policies;
create policy write_retention on public.retention_policies for all to authenticated
  using (org_id = app.current_org_id() and app.has_perm('admin.config')
         and (entity_type in ('import_rows','email_outbox','notifications') or app.has_perm('cases.confidential.triage')))
  with check (org_id = app.current_org_id() and app.has_perm('admin.config')
              and (entity_type in ('import_rows','email_outbox','notifications') or app.has_perm('cases.confidential.triage')));

-- 4. Campaign attachments -------------------------------------------------------------
create or replace function app.check_campaign_attachments() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare a jsonb;
begin
  if jsonb_typeof(new.attachments) <> 'array' then raise exception 'Attachments must be a list' using errcode = '23514'; end if;
  for a in select * from jsonb_array_elements(new.attachments) loop
    if a ->> 'bucket' is distinct from 'comms-attachments'
       or coalesce(a ->> 'path', '') not like new.org_id::text || '/comms/' || new.id::text || '/%'
       or (a ->> 'path') like '%..%' then
      raise exception 'Attachments must be uploaded to this campaign' using errcode = '23514';
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists campaigns_attachments_check on public.campaigns;
create trigger campaigns_attachments_check before insert or update of attachments on public.campaigns
  for each row execute function app.check_campaign_attachments();

-- 5. Evidence paths -------------------------------------------------------------------
alter table public.external_learning drop constraint if exists external_learning_evidence_own_folder;
alter table public.external_learning add constraint external_learning_evidence_own_folder
  check (evidence_path is null or (evidence_path like person_id::text || '/%' and evidence_path not like '%..%')) not valid;
alter table public.external_learning validate constraint external_learning_evidence_own_folder;

-- 6. Notes and contacts ---------------------------------------------------------------
drop policy if exists update_notes on public.notes;
create policy update_notes on public.notes for update to authenticated
  using (org_id = app.current_org_id() and author_account_id = app.current_account_id())
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

drop policy if exists update_contacts on public.contacts;
create policy update_contacts on public.contacts for update to authenticated
  using (org_id = app.current_org_id() and (created_by = app.current_account_id() or (lodge_id is not null and app.can_on_lodge('activity.write', lodge_id))))
  with check (org_id = app.current_org_id() and (
    (lodge_id is not null and app.can_on_lodge('activity.write', lodge_id))
    or (lodge_id is null and person_id is not null and app.can_on_person('members.write', person_id))));

-- 7. Draft campaigns ------------------------------------------------------------------
drop policy if exists update_draft_campaigns on public.campaigns;
create policy update_draft_campaigns on public.campaigns for update to authenticated
  using (org_id = app.current_org_id() and created_by = app.current_account_id() and status = 'draft')
  with check (org_id = app.current_org_id() and created_by = app.current_account_id() and status = 'draft'
              and ((scope = 'allocated' and app.has_perm('comms.send.allocated')) or (scope = 'province' and app.has_perm('comms.send.province'))));

-- 7b. Unsubscribe tokens are a bearer secret: only the system reads them. --------------
-- Column grant: a column added to comm_preferences later must be added here to be readable.
revoke select on public.comm_preferences from authenticated, anon;
grant select (person_id, org_id, learning, events, news, unsubscribed_all_at, email_status, email_status_at, updated_at)
  on public.comm_preferences to authenticated;
-- Email bodies can carry support and task titles; System health needs only the metadata.
revoke select on public.email_outbox from authenticated, anon;
grant select (id, org_id, to_email, to_person_id, subject, category, campaign_recipient_id, idempotency_key, status, attempts,
              next_attempt_at, last_error, provider_message_id, reply_to, created_at, sent_at)
  on public.email_outbox to authenticated;

-- 8. Defence in depth -----------------------------------------------------------------
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;
-- Policies call app helpers as the signed-in user, so authenticated keeps them;
-- PUBLIC and anon lose them (the app schema is not exposed through the API).
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;
alter default privileges in schema app revoke execute on functions from public;
alter default privileges in schema app grant execute on functions to authenticated, service_role;
