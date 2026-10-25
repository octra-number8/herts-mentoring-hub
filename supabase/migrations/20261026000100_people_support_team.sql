-- Members, support and team workspace: small additions used by those modules.
--
-- 1. Local corrections to a member's contact details. Hermes/Adelphi stays
--    authoritative, but the Hub may hold a locally corrected value with a reason.
--    Any field present in persons.local_corrections is skipped by import_commit.
--    persons_update only allows members.write.all, so allocated Assistants record
--    corrections through this function, which checks scope itself.
-- 2. Agenda items may link a document by URL as well as by id.

create or replace function public.person_record_correction(p_person uuid, p_field text, p_value text, p_reason text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid; v_restricted boolean;
  v_value text := nullif(trim(coalesce(p_value, '')), '');
begin
  select org_id, is_restricted into v_org, v_restricted from public.persons where id = p_person and org_id = app.current_org_id();
  perform app.require(v_org is not null, 'Member not found');
  perform app.require(not v_restricted or app.has_perm('notes.leadership') or app.has_grant('person', p_person), 'Member not found');
  perform app.require(app.can_on_person('members.write', p_person), 'You can only correct details for members of Lodges allocated to you');
  perform app.require(p_field in ('title', 'first_name', 'last_name', 'email', 'phone'), 'That detail cannot be corrected here');
  perform app.require(length(trim(coalesce(p_reason, ''))) >= 3, 'Record the reason for the correction');
  perform app.require(p_field not in ('first_name', 'last_name') or v_value is not null, 'A name cannot be left blank');
  perform app.require(p_field <> 'email' or v_value is null or v_value ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$', 'Enter a valid email address');

  update public.persons set
    title      = case when p_field = 'title' then v_value else title end,
    first_name = case when p_field = 'first_name' then v_value else first_name end,
    last_name  = case when p_field = 'last_name' then v_value else last_name end,
    email      = case when p_field = 'email' then v_value::citext else email end,
    phone      = case when p_field = 'phone' then v_value else phone end,
    local_corrections = coalesce(local_corrections, '{}'::jsonb) || jsonb_build_object(p_field, jsonb_build_object(
      'value', v_value, 'reason', trim(p_reason), 'by', app.current_account_id(), 'at', now()))
  where id = p_person;
end $$;

-- Remove a local correction so the next membership import may update the field again.
-- The current value is left as it is.
create or replace function public.person_clear_correction(p_person uuid, p_field text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid; v_restricted boolean;
begin
  select org_id, is_restricted into v_org, v_restricted from public.persons where id = p_person and org_id = app.current_org_id();
  perform app.require(v_org is not null, 'Member not found');
  perform app.require(not v_restricted or app.has_perm('notes.leadership') or app.has_grant('person', p_person), 'Member not found');
  perform app.require(app.can_on_person('members.write', p_person), 'You can only change details for members of Lodges allocated to you');
  update public.persons set local_corrections = local_corrections - p_field where id = p_person;
end $$;

revoke execute on function public.person_record_correction(uuid, text, text, text) from anon, public;
revoke execute on function public.person_clear_correction(uuid, text) from anon, public;
grant execute on function public.person_record_correction(uuid, text, text, text) to authenticated;
grant execute on function public.person_clear_correction(uuid, text) to authenticated;

alter table public.meeting_agenda_items add column if not exists document_url text
  check (document_url is null or document_url ~* '^https?://');
