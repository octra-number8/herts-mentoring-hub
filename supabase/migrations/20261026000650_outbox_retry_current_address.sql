-- Retrying a failed email sends it to the person's current address (it may have
-- been corrected since the failure), and clears any bounce suppression only when
-- the address actually changed.
create or replace function public.outbox_retry(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare o record; v_email citext;
begin
  perform app.require(app.has_perm('system.health'), 'Not permitted');
  select * into o from public.email_outbox where id = p_id and org_id = app.current_org_id() for update;
  perform app.require(o.id is not null and o.status = 'failed', 'Only a failed email can be retried');
  if o.to_person_id is not null then
    select email into v_email from public.persons where id = o.to_person_id;
  end if;
  update public.email_outbox set status = 'queued', next_attempt_at = now(), attempts = 0,
         to_email = coalesce(v_email, to_email)
   where id = p_id;
  if v_email is not null and v_email is distinct from o.to_email then
    update public.comm_preferences set email_status = 'ok', email_status_at = now() where person_id = o.to_person_id and email_status <> 'ok';
  end if;
  perform app.audit('email.retried', 'email_outbox', p_id::text, jsonb_build_object('address_updated', v_email is distinct from o.to_email));
end $$;
revoke execute on function public.outbox_retry(uuid) from anon, public;
grant execute on function public.outbox_retry(uuid) to authenticated;
