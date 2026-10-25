-- Fixes for two events functions found by the events tests. Logic is unchanged.
--
-- 1. event_set_checkin(p_rotate => true) failed: gen_random_bytes lives in the
--    extensions schema, which is not on the function's search_path.
-- 2. calendar_feed_events failed on every valid token: "column reference id is
--    ambiguous" (the OUT parameter `id` clashes with calendar_feed_tokens.id).

create or replace function public.event_set_checkin(p_event uuid, p_open boolean, p_rotate boolean default false) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_secret text;
begin
  perform app.require(app.can_manage_event(p_event), 'Not permitted');
  update public.events set checkin_open = p_open,
         checkin_secret = case when p_rotate then encode(extensions.gen_random_bytes(16), 'hex') else checkin_secret end
   where id = p_event returning checkin_secret into v_secret;
  return v_secret;
end $$;

create or replace function public.calendar_feed_events(p_token_hash text)
returns table(id uuid, title text, description text, starts_at timestamptz, ends_at timestamptz, location text, status text, kind text)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare t record;
begin
  select ft.id as token_id, ft.org_id as token_org, ua.auth_user_id, ua.status as account_status into t
    from public.calendar_feed_tokens ft join public.user_accounts ua on ua.id = ft.account_id
   where ft.token_hash = p_token_hash and ft.revoked_at is null;
  if t.token_id is null or t.account_status <> 'active' then return; end if;
  update public.calendar_feed_tokens ft set last_used_at = now() where ft.id = t.token_id;
  -- Act as the token's owner for this statement so the normal visibility rules apply.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', t.auth_user_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  return query
    select e.id, e.title, e.description, e.starts_at, e.ends_at, e.location, e.status, e.kind
      from public.events e
     where e.org_id = t.token_org and e.starts_at > now() - interval '90 days' and e.status <> 'draft'
       and app.can_see_event(e.id)
       and (exists (select 1 from public.registrations r where r.event_id = e.id and r.person_id = app.current_person_id() and r.status in ('confirmed','attended'))
            or exists (select 1 from public.event_trainers tr where tr.event_id = e.id and tr.person_id = app.current_person_id())
            or (app.has_perm('events.read.internal') and e.visibility in ('internal','lodge_mentors')))
     order by e.starts_at;
end $$;

revoke execute on function public.event_set_checkin(uuid, boolean, boolean) from anon, public;
grant execute on function public.event_set_checkin(uuid, boolean, boolean) to authenticated;
revoke execute on function public.calendar_feed_events(text) from anon, public, authenticated;
grant execute on function public.calendar_feed_events(text) to service_role;
