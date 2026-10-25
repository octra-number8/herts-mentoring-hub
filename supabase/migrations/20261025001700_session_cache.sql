-- Performance: resolve the caller's identity, effective permissions and Lodge
-- scopes once per transaction instead of once per row per policy.
--
-- The cache is a transaction-local setting keyed by auth user and assurance
-- level, so it can never leak between requests or survive an identity change
-- (calendar feeds switch identity mid-transaction and are re-resolved).
-- The rules themselves are unchanged; only where they are evaluated moves.

create or replace function app.session_cache() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_key text := coalesce(auth.uid()::text, 'none') || '|' || coalesce(auth.jwt() ->> 'aal', '');
  v_raw text := current_setting('app.session_cache', true);
  v jsonb;
  ua record;
  v_mfa_ok boolean;
  v_granted text[];
  v_perms text[];
  v_portal jsonb := '{}'::jsonb;
  v_action text;
begin
  if v_raw is not null and v_raw <> '' then
    v := v_raw::jsonb;
    if v ->> 'key' = v_key then return v; end if;
  end if;

  select * into ua from public.user_accounts where auth_user_id = auth.uid() and status = 'active';
  if ua.id is null then
    v := jsonb_build_object('key', v_key, 'account_id', null, 'person_id', null, 'org_id', null,
                            'mfa_ok', false, 'perms', '[]'::jsonb, 'allocated', '[]'::jsonb, 'portal', '{}'::jsonb);
    perform set_config('app.session_cache', v::text, true);
    return v;
  end if;

  v_mfa_ok := not ua.mfa_required or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';

  select coalesce(array_agg(distinct k), '{}') into v_granted from (
    select rp.permission_key k from public.role_assignments ra join public.role_permissions rp on rp.role_id = ra.role_id
     where ra.account_id = ua.id and app.is_current(ra.starts_on, ra.ends_on)
    union
    select pg.permission_key from public.permission_grants pg where pg.account_id = ua.id and app.is_current(pg.starts_on, pg.ends_on)
  ) g;

  if v_mfa_ok then
    select coalesce(array_agg(p.key), '{}') into v_perms
      from public.permissions p
      join public.features f on f.key = p.feature_key
      join public.feature_settings fs on fs.feature_key = p.feature_key and fs.org_id = ua.org_id
     where p.key = any (v_granted)
       and fs.enabled and coalesce((fs.actions ->> p.action)::boolean, false)
       and (f.activation_mode = 'all_permitted' or exists (
             select 1 from public.feature_activations fa
              where fa.org_id = ua.org_id and fa.feature_key = p.feature_key and fa.active
                and coalesce((fa.actions ->> p.action)::boolean, false)
                and ((fa.scope_type = 'account' and fa.account_id = ua.id)
                  or (fa.scope_type = 'role' and fa.role_id in (select ra.role_id from public.role_assignments ra
                        where ra.account_id = ua.id and app.is_current(ra.starts_on, ra.ends_on))))));

    -- Lodge portal scope per action: current Lodge Mentor appointment, the portal
    -- permission held, feature action enabled, and activation for the account,
    -- one of its roles, or that Lodge.
    foreach v_action in array array['read','create','update','export'] loop
      v_portal := v_portal || jsonb_build_object(v_action, coalesce((
        select jsonb_agg(distinct ap.lodge_id)
          from public.lodge_appointments ap
          join public.feature_settings fs on fs.org_id = ua.org_id and fs.feature_key = 'lodge_portal'
         where ap.person_id = ua.person_id and ap.org_id = ua.org_id
           and ap.office in ('lodge_mentor','assistant_lodge_mentor')
           and app.is_current(ap.starts_on, ap.ends_on)
           and fs.enabled and coalesce((fs.actions ->> v_action)::boolean, false)
           and ('lodge_portal.' || v_action) = any (v_granted)
           and exists (select 1 from public.feature_activations fa
                        where fa.org_id = ua.org_id and fa.feature_key = 'lodge_portal' and fa.active
                          and coalesce((fa.actions ->> v_action)::boolean, false)
                          and ((fa.scope_type = 'account' and fa.account_id = ua.id)
                            or (fa.scope_type = 'lodge' and fa.lodge_id = ap.lodge_id)
                            or (fa.scope_type = 'role' and fa.role_id in (select ra.role_id from public.role_assignments ra
                                  where ra.account_id = ua.id and app.is_current(ra.starts_on, ra.ends_on)))))
      ), '[]'::jsonb));
    end loop;
  else
    v_perms := '{}';
  end if;

  v := jsonb_build_object(
    'key', v_key,
    'account_id', ua.id, 'person_id', ua.person_id, 'org_id', ua.org_id,
    'mfa_ok', v_mfa_ok,
    'perms', to_jsonb(v_perms),
    'allocated', case when v_perms && array['lodges.write.allocated','activity.write.allocated','members.read.detail.allocated','cases.read.allocated'] then
        coalesce((select jsonb_agg(distinct la.lodge_id) from public.lodge_allocations la
                   where la.person_id = ua.person_id and la.org_id = ua.org_id and app.is_current(la.starts_on, la.ends_on)), '[]'::jsonb)
      else '[]'::jsonb end,
    'portal', v_portal);
  perform set_config('app.session_cache', v::text, true);
  return v;
end $$;

-- Any write that can change someone's effective access clears the cache for the
-- rest of the transaction.
create or replace function app.clear_session_cache() returns trigger
language plpgsql as $$
begin
  perform set_config('app.session_cache', '', true);
  return null;
end $$;
create trigger role_assignments_cache after insert or update or delete on public.role_assignments for each statement execute function app.clear_session_cache();
create trigger permission_grants_cache after insert or update or delete on public.permission_grants for each statement execute function app.clear_session_cache();
create trigger feature_settings_cache after insert or update or delete on public.feature_settings for each statement execute function app.clear_session_cache();
create trigger feature_activations_cache after insert or update or delete on public.feature_activations for each statement execute function app.clear_session_cache();
create trigger lodge_allocations_cache after insert or update or delete on public.lodge_allocations for each statement execute function app.clear_session_cache();
create trigger lodge_appointments_cache after insert or update or delete on public.lodge_appointments for each statement execute function app.clear_session_cache();
create trigger user_accounts_cache after insert or update or delete on public.user_accounts for each statement execute function app.clear_session_cache();

-- Re-point the helpers at the cache. Signatures and semantics are unchanged.
create or replace function app.current_account_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select (app.session_cache() ->> 'account_id')::uuid
$$;
create or replace function app.current_person_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select (app.session_cache() ->> 'person_id')::uuid
$$;
create or replace function app.current_org_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select (app.session_cache() ->> 'org_id')::uuid
$$;
create or replace function app.mfa_satisfied() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((app.session_cache() ->> 'mfa_ok')::boolean, false)
$$;
create or replace function app.has_perm(p_key text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((app.session_cache() -> 'perms') ? p_key, false)
$$;
create or replace function app.has_any_perm(p_keys text[]) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((app.session_cache() -> 'perms') ?| p_keys, false)
$$;
create or replace function app.my_allocated_lodge_ids() returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select x::uuid from jsonb_array_elements_text(app.session_cache() -> 'allocated') x
$$;
create or replace function app.portal_lodge_ids(p_action text default 'read') returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select x::uuid from jsonb_array_elements_text(coalesce(app.session_cache() -> 'portal' -> p_action, '[]'::jsonb)) x
$$;
create or replace function app.can_on_lodge(p_base text, p_lodge uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select app.has_perm(p_base || '.all')
      or (app.has_perm(p_base || '.allocated') and (app.session_cache() -> 'allocated') ? p_lodge::text)
$$;
create or replace function app.in_portal_lodge(p_person uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_array_length(coalesce(app.session_cache() -> 'portal' -> 'read', '[]'::jsonb)) > 0 and (
    exists (select 1 from public.lodge_memberships m
             where m.person_id = p_person and m.left_on is null and m.lodge_id in (select app.portal_lodge_ids()))
    or exists (select 1 from public.lodge_appointments a
             where a.person_id = p_person and app.is_current(a.starts_on, a.ends_on) and a.lodge_id in (select app.portal_lodge_ids())))
$$;
create or replace function app.can_on_person(p_base text, p_person uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select app.has_perm(p_base || '.all')
      or (app.has_perm(p_base || '.allocated') and exists (
            select 1 from public.lodge_memberships m
             where m.person_id = p_person and m.left_on is null
               and (app.session_cache() -> 'allocated') ? m.lodge_id::text))
$$;

-- People the learning team may see: anyone with an account or Academy enrolment.
create or replace function app.is_learner(p_person uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.user_accounts ua where ua.person_id = p_person and ua.status in ('active','invited'))
      or exists (select 1 from public.enrolments e where e.person_id = p_person)
$$;
-- People event organisers may see: registrants, invitees and trainers.
create or replace function app.is_event_participant(p_person uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.registrations r where r.person_id = p_person)
      or exists (select 1 from public.event_invites i where i.person_id = p_person)
      or exists (select 1 from public.event_trainers t where t.person_id = p_person)
      or exists (select 1 from public.user_accounts ua where ua.person_id = p_person and ua.status = 'active')
$$;

grant execute on all functions in schema app to authenticated, service_role;
