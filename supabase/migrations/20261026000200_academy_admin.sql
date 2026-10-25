-- Academy administration helpers.
-- Learning administrators (learning.records.read) do not hold lodges.read or
-- members.read.basic, so Lodge, area and role context for learning records is
-- provided by these definer functions, which return only learning-related rows.

-- Searchable learning records with Lodge, area and role context.
create or replace function public.academy_learning_records(
  p_lodge uuid default null, p_area uuid default null, p_role text default null, p_course uuid default null,
  p_status text default null, p_from date default null, p_to date default null, p_q text default null,
  p_person uuid default null, p_limit int default 2000)
returns table (
  enrolment_id uuid, person_id uuid, display_name text, course_id uuid, course_title text, version_no int,
  status text, source text, enrolled_at timestamptz, completed_at timestamptz, due_on date,
  lessons_completed int, lessons_required int, lodge_id uuid, lodge_name text, lodge_number int,
  area_id uuid, area_name text, roles text[])
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require(app.has_perm('learning.records.read'), 'Not permitted to read learning records');
  return query
  with base as (
    select e.*, p.display_name as pname,
           (select lm.lodge_id from public.lodge_memberships lm where lm.person_id = e.person_id and lm.left_on is null
             order by lm.is_primary desc, lm.joined_on limit 1) as lid,
           (select coalesce(array_agg(distinct r.key order by r.key), '{}') from public.user_accounts ua
              join public.role_assignments ra on ra.account_id = ua.id
              join public.roles r on r.id = ra.role_id
             where ua.person_id = e.person_id and app.is_current(ra.starts_on, ra.ends_on)) as rkeys
      from public.enrolments e
      join public.persons p on p.id = e.person_id
     where e.org_id = app.current_org_id()
       and (not p.is_restricted or app.has_perm('notes.leadership'))
       and (p_person is null or e.person_id = p_person)
       and (p_course is null or e.course_id = p_course)
       and (p_status is null or e.status = p_status)
       and (p_from is null or coalesce(e.completed_at, e.enrolled_at)::date >= p_from)
       and (p_to is null or coalesce(e.completed_at, e.enrolled_at)::date <= p_to)
       and (p_q is null or p.display_name ilike '%' || p_q || '%')
  )
  select b.id, b.person_id, b.pname, b.course_id, c.title, cv.version_no, b.status, b.source, b.enrolled_at, b.completed_at, b.due_on,
         (select count(*)::int from public.lesson_progress lp where lp.enrolment_id = b.id),
         (select count(*)::int from public.lessons ls join public.course_modules cm on cm.id = ls.module_id
           where cm.version_id = b.course_version_id and ls.required),
         l.id, l.name, l.number, a.id, a.name, b.rkeys
    from base b
    join public.courses c on c.id = b.course_id
    join public.course_versions cv on cv.id = b.course_version_id
    left join public.lodges l on l.id = b.lid
    left join lateral (
      select ar.id, ar.name from public.lodge_allocations la join public.areas ar on ar.id = la.area_id
       where la.lodge_id = l.id and la.kind = 'primary' and app.is_current(la.starts_on, la.ends_on)
       order by la.starts_on desc limit 1) a on true
   where (p_lodge is null or l.id = p_lodge)
     and (p_area is null or a.id = p_area)
     and (p_role is null or p_role = any(b.rkeys))
   order by coalesce(b.completed_at, b.enrolled_at) desc
   limit greatest(1, least(coalesce(p_limit, 2000), 5000));
end $$;

-- Options for the learning record filters (Lodges, areas, roles).
create or replace function public.academy_learning_filters() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require(app.has_perm('learning.records.read'), 'Not permitted to read learning records');
  return jsonb_build_object(
    'lodges', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'number', number) order by number)
                          from public.lodges where org_id = app.current_org_id() and status = 'active'), '[]'::jsonb),
    'areas', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by code)
                         from public.areas where org_id = app.current_org_id() and active), '[]'::jsonb),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'name', name) order by name)
                         from public.roles where org_id = app.current_org_id()), '[]'::jsonb));
end $$;

-- One learner's context for the individual learning record: Lodge, roles and
-- training attendance. Never includes reflections or management notes.
create or replace function public.academy_learner_context(p_person uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_person record;
begin
  perform app.require(app.has_perm('learning.records.read'), 'Not permitted to read learning records');
  select * into v_person from public.persons where id = p_person and org_id = app.current_org_id();
  perform app.require(v_person.id is not null and app.is_learner(p_person)
                      and (not v_person.is_restricted or app.has_perm('notes.leadership')), 'Learner not found');
  return jsonb_build_object(
    'display_name', v_person.display_name,
    'lodge', (select jsonb_build_object('name', l.name, 'number', l.number) from public.lodge_memberships lm join public.lodges l on l.id = lm.lodge_id
               where lm.person_id = p_person and lm.left_on is null order by lm.is_primary desc limit 1),
    'roles', coalesce((select jsonb_agg(distinct r.name) from public.user_accounts ua join public.role_assignments ra on ra.account_id = ua.id
                        join public.roles r on r.id = ra.role_id where ua.person_id = p_person and app.is_current(ra.starts_on, ra.ends_on)), '[]'::jsonb),
    'attendance', coalesce((select jsonb_agg(jsonb_build_object('event_id', e.id, 'title', e.title, 'starts_at', e.starts_at, 'status', r.status) order by e.starts_at desc)
                              from public.registrations r join public.events e on e.id = r.event_id
                             where r.person_id = p_person and e.is_training and r.status in ('confirmed','attended','no_show','waitlisted')), '[]'::jsonb));
end $$;

revoke all on function public.academy_learning_records(uuid, uuid, text, uuid, text, date, date, text, uuid, int) from anon, public;
revoke all on function public.academy_learning_filters() from anon, public;
revoke all on function public.academy_learner_context(uuid) from anon, public;
grant execute on function public.academy_learning_records(uuid, uuid, text, uuid, text, date, date, text, uuid, int) to authenticated;
grant execute on function public.academy_learning_filters() to authenticated;
grant execute on function public.academy_learner_context(uuid) to authenticated;
