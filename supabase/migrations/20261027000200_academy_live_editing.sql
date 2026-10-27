-- Live editing. While the organisation setting academy.live_editing is on, authors
-- may edit published course versions in place, without a new version and
-- approval. It is meant for the period before members have access; switch it off
-- once they do, so that changes go through review again.

create or replace function app.academy_live_editing() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select (settings->'academy'->>'live_editing')::boolean from public.organisations where id = app.current_org_id()), false)
$$;

create or replace function app.can_edit_version(p_version uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.course_versions v
                  where v.id = p_version and v.org_id = app.current_org_id() and app.has_perm('academy.author')
                    and (v.status = 'draft' or (v.status = 'published' and app.academy_live_editing())))
$$;

drop policy update_versions on public.course_versions;
create policy update_versions on public.course_versions for update to authenticated
  using (org_id = app.current_org_id() and app.has_perm('academy.author')
         and (status = 'draft' or (status = 'published' and app.academy_live_editing())))
  with check (org_id = app.current_org_id() and (status = 'draft' or (status = 'published' and app.academy_live_editing())));

-- Status only ever changes through academy_transition_version(), never by a
-- direct update, so live editing cannot publish a draft without approval.
create or replace function app.guard_version_status() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status and current_user not in ('postgres','service_role','supabase_admin') then
    raise exception using errcode = '42501', message = 'Course versions change status through the approval workflow';
  end if;
  return new;
end $$;
create trigger course_versions_status_guard before update on public.course_versions for each row execute function app.guard_version_status();

-- A live edit to the published version's title or summary shows in the catalogue.
create or replace function app.sync_published_course_details() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.courses set title = new.title, summary = new.summary where published_version_id = new.id;
  return null;
end $$;
create trigger course_versions_sync_published after update of title, summary on public.course_versions
  for each row when (new.status = 'published' and (new.title, new.summary) is distinct from (old.title, old.summary))
  execute function app.sync_published_course_details();

revoke all on function app.academy_live_editing() from anon, public;
grant execute on function app.academy_live_editing() to authenticated;
