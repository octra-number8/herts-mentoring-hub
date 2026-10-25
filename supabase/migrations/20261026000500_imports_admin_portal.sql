-- Imports staging, invitations, workflow run control, health recovery and the
-- Lodge Mentor portal write scope. Everything privileged is a definer function
-- with its own permission check; nothing here widens what a learner can see.

-- ===========================================================================
-- Imports: staging and cancellation
-- ===========================================================================

-- Store the reconciled rows produced by the import pipeline (src/server/imports)
-- and mark the batch validated. Decisions start as proposed by the pipeline;
-- the user resolves the rest before an approver commits.
create or replace function public.import_stage(p_batch uuid, p_rows jsonb, p_stats jsonb, p_template uuid default null, p_scope uuid[] default '{}')
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare b record; v_count int;
begin
  perform app.require(app.has_perm('imports.run'), 'Not permitted to run imports');
  select * into b from public.import_batches where id = p_batch and org_id = app.current_org_id() for update;
  perform app.require(b.id is not null, 'Import not found');
  perform app.require(b.status in ('uploaded','validated'), 'This import has already been approved or closed');
  perform app.require(jsonb_typeof(p_rows) = 'array', 'Rows must be a list');
  delete from public.import_rows where batch_id = p_batch;
  insert into public.import_rows(batch_id, row_no, raw, data, errors, outcome, matched_person_id, candidate_person_ids, diff, decision, decision_person_id)
  select p_batch, (r->>'row_no')::int, coalesce(r->'raw','{}'::jsonb), coalesce(r->'data','{}'::jsonb), coalesce(r->'errors','[]'::jsonb),
         r->>'outcome', nullif(r->>'matched_person_id','')::uuid,
         coalesce(array(select jsonb_array_elements_text(coalesce(r->'candidate_person_ids','[]'::jsonb))::uuid), '{}'),
         coalesce(r->'diff','{}'::jsonb), coalesce(r->>'decision','pending'), nullif(r->>'decision_person_id','')::uuid
    from jsonb_array_elements(p_rows) r;
  get diagnostics v_count = row_count;
  -- Matched or candidate persons must belong to this organisation.
  perform app.require(not exists (
    select 1 from public.import_rows ir
     where ir.batch_id = p_batch
       and exists (select 1 from unnest(array_append(ir.candidate_person_ids, ir.matched_person_id)) x(pid)
                    join public.persons p on p.id = x.pid where p.org_id <> b.org_id)), 'Rows refer to records outside this organisation');
  update public.import_batches
     set status = 'validated', stats = coalesce(p_stats, '{}'::jsonb), template_id = coalesce(p_template, template_id),
         scope_lodge_ids = coalesce(p_scope, '{}')
   where id = p_batch;
  perform app.audit('import.staged', 'import_batch', p_batch::text, jsonb_build_object('rows', v_count, 'stats', p_stats));
  return v_count;
end $$;

create or replace function public.import_cancel(p_batch uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require(app.has_perm('imports.run'), 'Not permitted to run imports');
  update public.import_batches set status = 'cancelled'
   where id = p_batch and org_id = app.current_org_id() and status in ('uploaded','validated');
  perform app.require(found, 'Only an import that has not been committed can be cancelled');
  perform app.audit('import.cancelled', 'import_batch', p_batch::text, '{}'::jsonb);
end $$;

-- ===========================================================================
-- Invitations (invitation-only accounts). The raw token never reaches the
-- database: callers pass its sha256 hex.
-- ===========================================================================
create or replace function app.leadership_role_keys() returns text[]
language sql immutable as $$ select array['prov_grand_mentor','deputy_prov_grand_mentor','tech_admin'] $$;

create or replace function public.admin_create_invitation(
  p_person uuid, p_title text, p_first text, p_last text, p_email text, p_roles text[], p_token_hash text, p_message text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid := app.current_org_id(); v_person uuid := p_person; v_account record; v_inv uuid; v_role record; v_acc uuid;
begin
  perform app.require(app.has_perm('admin.users'), 'Not permitted to invite users');
  perform app.require(coalesce(array_length(p_roles, 1), 0) > 0, 'Choose at least one role');
  perform app.require(p_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$', 'Enter a valid email address');
  perform app.require(length(coalesce(p_token_hash, '')) = 64, 'Invalid invitation token');
  perform app.require(not (p_roles && app.leadership_role_keys()) or app.has_perm('admin.roles'),
                      'Only someone who can assign roles may invite Provincial leadership or technical administrators');
  perform app.require((select count(*) from public.roles where org_id = v_org and key = any(p_roles)) = array_length(p_roles, 1), 'Unknown role');

  if v_person is null then
    perform app.require(length(trim(coalesce(p_first,''))) > 0 and length(trim(coalesce(p_last,''))) > 0, 'Enter the first and last name');
    insert into public.persons(org_id, title, first_name, last_name, email, source)
    values (v_org, nullif(trim(p_title),''), trim(p_first), trim(p_last), lower(p_email), 'invitation') returning id into v_person;
    insert into public.comm_preferences(person_id, org_id) values (v_person, v_org) on conflict do nothing;
  else
    perform app.require(exists (select 1 from public.persons where id = v_person and org_id = v_org), 'Person not found');
    update public.persons set email = lower(p_email) where id = v_person and email is null;
  end if;

  select * into v_account from public.user_accounts where person_id = v_person;
  if v_account.id is not null then
    perform app.require(v_account.status = 'invited', 'This person already has an account. Manage it from their account page.');
    v_acc := v_account.id;
    update public.invitations set revoked_at = now() where person_id = v_person and accepted_at is null and revoked_at is null;
  else
    insert into public.user_accounts(org_id, person_id, status) values (v_org, v_person, 'invited') returning id into v_acc;
  end if;

  for v_role in select id, key from public.roles where org_id = v_org and key = any(p_roles) loop
    if not exists (select 1 from public.role_assignments ra where ra.account_id = v_acc and ra.role_id = v_role.id and app.is_current(ra.starts_on, ra.ends_on)) then
      insert into public.role_assignments(org_id, account_id, role_id, granted_by, reason)
      values (v_org, v_acc, v_role.id, app.current_account_id(), 'Invitation');
    end if;
  end loop;

  insert into public.invitations(org_id, person_id, email, role_keys, token_hash, expires_at, invited_by, message)
  values (v_org, v_person, lower(p_email), p_roles, p_token_hash, now() + interval '7 days', app.current_account_id(), nullif(trim(p_message),''))
  returning id into v_inv;
  perform app.audit('invitation.created', 'invitation', v_inv::text, jsonb_build_object('person_id', v_person, 'roles', p_roles));
  return jsonb_build_object('invitation_id', v_inv, 'person_id', v_person, 'account_id', v_acc);
end $$;

create or replace function public.admin_resend_invitation(p_invitation uuid, p_token_hash text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v record; v_new uuid;
begin
  perform app.require(app.has_perm('admin.users'), 'Not permitted to invite users');
  perform app.require(length(coalesce(p_token_hash, '')) = 64, 'Invalid invitation token');
  select * into v from public.invitations where id = p_invitation and org_id = app.current_org_id() for update;
  perform app.require(v.id is not null, 'Invitation not found');
  perform app.require(v.accepted_at is null, 'This invitation has already been accepted');
  perform app.require(exists (select 1 from public.user_accounts where person_id = v.person_id and status = 'invited'), 'The account is no longer awaiting activation');
  update public.invitations set revoked_at = now() where person_id = v.person_id and accepted_at is null and revoked_at is null;
  insert into public.invitations(org_id, person_id, email, role_keys, token_hash, expires_at, invited_by, message)
  values (v.org_id, v.person_id, v.email, v.role_keys, p_token_hash, now() + interval '7 days', app.current_account_id(), v.message)
  returning id into v_new;
  perform app.audit('invitation.resent', 'invitation', v_new::text, jsonb_build_object('previous', p_invitation));
  return jsonb_build_object('invitation_id', v_new, 'person_id', v.person_id, 'email', v.email);
end $$;

create or replace function public.admin_revoke_invitation(p_invitation uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require(app.has_perm('admin.users'), 'Not permitted to manage invitations');
  update public.invitations set revoked_at = now()
   where id = p_invitation and org_id = app.current_org_id() and accepted_at is null and revoked_at is null;
  perform app.require(found, 'This invitation is no longer open');
  perform app.audit('invitation.revoked', 'invitation', p_invitation::text, '{}'::jsonb);
end $$;

-- Account administrators need to see who they are managing (identity only:
-- names and contact details, never mentoring records, which keep their own policies).
create policy persons_read_admin_users on public.persons for select to authenticated
  using (org_id = app.current_org_id() and app.has_perm('admin.users') and not is_restricted);

-- ===========================================================================
-- Workflow runs: approval, cancellation and retry
-- ===========================================================================
create or replace function public.workflow_run_decide(p_run uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require(app.has_perm('workflows.manage'), 'Not permitted to manage workflows');
  update public.workflow_runs
     set status = case when p_approve then 'pending' else 'cancelled' end,
         approved_by = case when p_approve then app.current_account_id() end,
         next_attempt_at = now(),
         finished_at = case when p_approve then null else now() end
   where id = p_run and org_id = app.current_org_id() and status = 'pending_approval';
  perform app.require(found, 'This run is not waiting for approval');
  perform app.audit(case when p_approve then 'workflow_run.approved' else 'workflow_run.cancelled' end, 'workflow_run', p_run::text, '{}'::jsonb);
end $$;

create or replace function public.workflow_run_retry(p_run uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require(app.has_any_perm(array['workflows.manage','system.health']), 'Not permitted');
  update public.workflow_runs set status = 'pending', attempts = 0, next_attempt_at = now(), error = null, finished_at = null
   where id = p_run and org_id = app.current_org_id() and status = 'failed';
  perform app.require(found, 'Only a failed run can be retried');
  perform app.audit('workflow_run.retried', 'workflow_run', p_run::text, '{}'::jsonb);
end $$;

-- ===========================================================================
-- System health recovery
-- ===========================================================================
create or replace function public.integration_failure_resolve(p_failure uuid, p_retry boolean) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare f record; v_result text := 'resolved';
begin
  perform app.require(app.has_perm('system.health'), 'Not permitted');
  select * into f from public.integration_failures where id = p_failure and org_id = app.current_org_id() and resolved_at is null for update;
  perform app.require(f.id is not null, 'This failure is already resolved');
  if p_retry then
    perform app.require(f.retryable, 'This failure cannot be retried');
    if f.context ? 'run_id' then
      update public.workflow_runs set status = 'pending', attempts = 0, next_attempt_at = now(), error = null, finished_at = null
       where id = (f.context->>'run_id')::uuid and org_id = f.org_id and status = 'failed';
      v_result := 'workflow run queued';
    elsif f.context ? 'event_id' then
      update public.domain_events set attempts = 0, last_error = null
       where id = (f.context->>'event_id')::uuid and org_id = f.org_id and processed_at is null;
      v_result := 'event queued';
    elsif f.context ? 'outbox_id' then
      update public.email_outbox set status = 'queued', attempts = 0, next_attempt_at = now()
       where id = (f.context->>'outbox_id')::uuid and org_id = f.org_id and status = 'failed';
      v_result := 'email queued';
    else
      v_result := 'resolved (nothing to retry automatically)';
    end if;
  end if;
  update public.integration_failures set resolved_at = now(), resolved_by = app.current_account_id() where id = p_failure;
  perform app.audit('integration_failure.' || case when p_retry then 'retried' else 'resolved' end, 'integration_failure', p_failure::text,
                    jsonb_build_object('integration', f.integration_key, 'result', v_result));
  return v_result;
end $$;

create or replace function public.outbox_retry(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require(app.has_perm('system.health'), 'Not permitted');
  update public.email_outbox set status = 'queued', next_attempt_at = now(), attempts = 0
   where id = p_id and org_id = app.current_org_id() and status = 'failed';
  perform app.require(found, 'Only a failed email can be retried');
  perform app.audit('email.retried', 'email_outbox', p_id::text, '{}'::jsonb);
end $$;

-- ===========================================================================
-- Lodge Mentor portal
-- ===========================================================================

-- The caller's portal Lodges per action (navigation and early refusals only).
create or replace function public.my_portal_scope() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(app.session_cache() -> 'portal', '{}'::jsonb)
$$;

-- Portal users with the 'update' action may maintain the approved mentoring
-- arrangements of their own portal Lodges, and nothing else.
create policy portal_insert_profiles on public.lodge_mentoring_profiles for insert to authenticated
  with check (org_id = app.current_org_id() and lodge_id in (select app.portal_lodge_ids('update')));
create policy portal_update_profiles on public.lodge_mentoring_profiles for update to authenticated
  using (org_id = app.current_org_id() and lodge_id in (select app.portal_lodge_ids('update')))
  with check (org_id = app.current_org_id() and lodge_id in (select app.portal_lodge_ids('update')));

-- ===========================================================================
-- Grants
-- ===========================================================================
revoke execute on function public.import_stage(uuid, jsonb, jsonb, uuid, uuid[]) from anon, public;
revoke execute on function public.import_cancel(uuid) from anon, public;
revoke execute on function public.admin_create_invitation(uuid, text, text, text, text, text[], text, text) from anon, public;
revoke execute on function public.admin_resend_invitation(uuid, text) from anon, public;
revoke execute on function public.admin_revoke_invitation(uuid) from anon, public;
revoke execute on function public.workflow_run_decide(uuid, boolean) from anon, public;
revoke execute on function public.workflow_run_retry(uuid) from anon, public;
revoke execute on function public.integration_failure_resolve(uuid, boolean) from anon, public;
revoke execute on function public.outbox_retry(uuid) from anon, public;
revoke execute on function public.my_portal_scope() from anon, public;
grant execute on function public.import_stage(uuid, jsonb, jsonb, uuid, uuid[]) to authenticated;
grant execute on function public.import_cancel(uuid) to authenticated;
grant execute on function public.admin_create_invitation(uuid, text, text, text, text, text[], text, text) to authenticated;
grant execute on function public.admin_resend_invitation(uuid, text) to authenticated;
grant execute on function public.admin_revoke_invitation(uuid) to authenticated;
grant execute on function public.workflow_run_decide(uuid, boolean) to authenticated;
grant execute on function public.workflow_run_retry(uuid) to authenticated;
grant execute on function public.integration_failure_resolve(uuid, boolean) to authenticated;
grant execute on function public.outbox_retry(uuid) to authenticated;
grant execute on function public.my_portal_scope() to authenticated;
revoke execute on function app.leadership_role_keys() from public, anon;
grant execute on function app.leadership_role_keys() to authenticated, service_role;
