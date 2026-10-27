-- Owner decisions, 27 October 2026 (docs/privacy/owner-checklist.md).
--  1. Live editing of published courses is for administrators only (admin.config),
--     not every author, even while the setting is on.
--  2. News and updates are sent by default, with an easy way to opt out (in every
--     email and under Account, Notifications). Existing choices are not changed.

-- 1. Live editing -------------------------------------------------------------------
create or replace function app.academy_live_editing() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select app.has_perm('admin.config')
     and coalesce((select (settings->'academy'->>'live_editing')::boolean from public.organisations where id = app.current_org_id()), false)
$$;

-- 2. News default -------------------------------------------------------------------
alter table public.comm_preferences alter column news set default true;
