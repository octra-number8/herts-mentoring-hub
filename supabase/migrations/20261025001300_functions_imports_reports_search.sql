-- Business functions: import commit, reporting datasets, quarterly report, search,
-- calendar feeds, retention, notification triggers. Ends by revoking anon access.

-- ===========================================================================
-- Notification triggers (never include restricted content)
-- ===========================================================================
create or replace function app.notify_task() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.owner_account_id is not null and new.owner_account_id is distinct from app.current_account_id()
     and (tg_op = 'INSERT' or new.owner_account_id is distinct from old.owner_account_id) then
    perform app.notify(new.owner_account_id, 'task_assigned', 'Task assigned to you',
      case when new.linked_type = 'case' then 'A support request task' else new.title end,
      '/tasks/' || new.id, false, 'task:' || new.id || ':' || new.owner_account_id);
  end if;
  return new;
end $$;
create trigger tasks_notify after insert or update of owner_account_id on public.tasks for each row execute function app.notify_task();

create or replace function app.notify_case() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_acc uuid;
begin
  if new.kind = 'confidential' then
    for v_acc in select ra.account_id from public.role_assignments ra join public.role_permissions rp on rp.role_id = ra.role_id
                  where ra.org_id = new.org_id and rp.permission_key = 'cases.confidential.triage' and app.is_current(ra.starts_on, ra.ends_on)
    loop
      perform app.notify(v_acc, 'confidential_concern', 'A confidential concern has been received', new.reference,
                         '/support/' || new.id, true, 'cc:' || new.id);
    end loop;
  elsif new.owner_account_id is not null and new.owner_account_id is distinct from app.current_account_id() then
    perform app.notify(new.owner_account_id, 'support_request', 'New support request', new.reference || ' ' || new.title,
                       '/support/' || new.id, false, 'case:' || new.id || ':' || new.owner_account_id);
  end if;
  perform app.emit(new.org_id, 'case.created', 'case', new.id, jsonb_build_object('kind', new.kind, 'lodge_id', case when new.kind = 'request' then new.lodge_id end, 'category', new.category_key));
  return new;
end $$;
create trigger cases_notify after insert on public.cases for each row execute function app.notify_case();

create or replace function app.notify_case_owner_change() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.owner_account_id is distinct from old.owner_account_id and new.owner_account_id is not null
     and new.owner_account_id is distinct from app.current_account_id() and new.kind = 'request' then
    perform app.notify(new.owner_account_id, 'support_request', 'Support request assigned to you', new.reference || ' ' || new.title,
                       '/support/' || new.id, false, 'case:' || new.id || ':' || new.owner_account_id);
  end if;
  return new;
end $$;
create trigger cases_notify_owner after update of owner_account_id on public.cases for each row execute function app.notify_case_owner_change();

create or replace function app.notify_mention() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- The mention notifies but grants nothing: the note is still governed by its own access rules.
  perform app.notify(new.account_id, 'mention', 'You were mentioned in a note', null,
                     (select case subject_type when 'lodge' then '/lodges/' || subject_id when 'case' then '/support/' || subject_id
                              when 'person' then '/members/' || subject_id when 'meeting' then '/team/meetings/' || subject_id else '/team' end
                        from public.notes where id = new.note_id), false, 'mention:' || new.note_id || ':' || new.account_id);
  return new;
end $$;
create trigger note_mentions_notify after insert on public.note_mentions for each row execute function app.notify_mention();

-- ===========================================================================
-- Import commit
-- ===========================================================================
create or replace function app.stage_rank(p text) returns int language sql immutable as $$
  select case p when 'enquirer' then 0 when 'applicant' then 1 when 'candidate' then 2 when 'entered_apprentice' then 3
                when 'fellow_craft' then 4 when 'master_mason' then 5 when 'established' then 6 else -1 end
$$;

create or replace function public.import_commit(p_batch uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  b record; r record; d jsonb; v_person uuid; v_lodge uuid; v_org uuid;
  v_auth text[]; v_field text; v_corr jsonb; v_set jsonb;
  v_new int := 0; v_updated int := 0; v_degrees int := 0; v_initiates int := 0; v_reviews int := 0; v_skipped int := 0;
  v_stage text; v_kind text; v_date date; v_inserted uuid; v_window int; v_apgmen uuid;
begin
  perform app.require(app.has_perm('imports.approve'), 'Not permitted to approve imports');
  select * into b from public.import_batches where id = p_batch and org_id = app.current_org_id() for update;
  perform app.require(b.id is not null, 'Import not found');
  perform app.require(b.status = 'validated', 'Only a validated import can be committed');
  perform app.require(not exists (select 1 from public.import_rows where batch_id = p_batch and decision = 'pending'),
                      'Resolve every conflict, duplicate and possible removal before committing');
  v_org := b.org_id;
  select coalesce(array(select jsonb_array_elements_text(settings->'imports'->'authoritative_fields')),
                  array['title','first_name','last_name','email','phone','status']),
         coalesce((settings->'imports'->>'new_initiate_window_days')::int, 540)
    into v_auth, v_window from public.organisations where id = v_org;
  update public.import_batches set status = 'committing' where id = p_batch;

  for r in select * from public.import_rows where batch_id = p_batch and decision in ('accept','merge','create_new') order by row_no loop
    d := r.data;
    v_lodge := nullif(d->>'lodge_id','')::uuid;

    if r.outcome = 'possible_removal' then
      -- Never treat an omission as a departure. Ask the allocated APGMen to check.
      if not b.is_partial then
        v_apgmen := app.allocated_apgmen_account(v_lodge);
        insert into public.tasks(org_id, title, description, owner_account_id, created_by, due_on, linked_type, linked_id, lodge_id)
        values (v_org, 'Check membership: ' || coalesce(d->>'first_name','') || ' ' || coalesce(d->>'last_name',''),
                'Not present in the latest full membership report (' || b.file_name || '). Please check with the Lodge before anything changes.',
                v_apgmen, app.current_account_id(), current_date + 21, 'person', r.matched_person_id, v_lodge);
        v_reviews := v_reviews + 1;
      end if;
      update public.import_rows set applied_at = now() where id = r.id;
      continue;
    end if;

    if r.decision = 'create_new' or (r.outcome = 'new' and r.decision = 'accept') then
      insert into public.persons(org_id, title, first_name, last_name, email, phone, membership_number, status, source)
      values (v_org, nullif(d->>'title',''), d->>'first_name', d->>'last_name', nullif(d->>'email',''), nullif(d->>'phone',''),
              nullif(d->>'membership_number',''), coalesce(nullif(d->>'status',''), 'active'), 'import')
      returning id into v_person;
      insert into public.comm_preferences(person_id, org_id) values (v_person, v_org) on conflict do nothing;
      v_new := v_new + 1;
    else
      v_person := coalesce(r.decision_person_id, r.matched_person_id);
      perform app.require(v_person is not null, format('Row %s has no matched person', r.row_no));
      select local_corrections into v_corr from public.persons where id = v_person;
      v_set := '{}'::jsonb;
      foreach v_field in array v_auth loop
        if d ? v_field and nullif(d->>v_field,'') is not null and not (coalesce(v_corr,'{}'::jsonb) ? v_field) then
          v_set := v_set || jsonb_build_object(v_field, d->>v_field);
        end if;
      end loop;
      if v_set <> '{}'::jsonb then
        update public.persons p set
          title = coalesce(v_set->>'title', p.title),
          first_name = coalesce(v_set->>'first_name', p.first_name),
          last_name = coalesce(v_set->>'last_name', p.last_name),
          email = coalesce((v_set->>'email')::citext, p.email),
          phone = coalesce(v_set->>'phone', p.phone),
          status = coalesce(v_set->>'status', p.status),
          status_changed_on = case when v_set ? 'status' and v_set->>'status' <> p.status then current_date else p.status_changed_on end,
          membership_number = coalesce(p.membership_number, nullif(d->>'membership_number',''))
        where p.id = v_person;
        v_updated := v_updated + 1;
      end if;
    end if;

    -- Lodge membership
    if v_lodge is not null then
      if not exists (select 1 from public.lodge_memberships where person_id = v_person and lodge_id = v_lodge and left_on is null) then
        insert into public.lodge_memberships(org_id, person_id, lodge_id, is_primary, joined_on, join_type, source)
        values (v_org, v_person, v_lodge, coalesce((d->>'is_primary')::boolean, true),
                coalesce(nullif(d->>'initiated_on','')::date, nullif(d->>'joined_on','')::date),
                case when nullif(d->>'initiated_on','') is not null then 'initiated' when nullif(d->>'joined_on','') is not null then 'joined' end,
                'import')
        on conflict (person_id, lodge_id, joined_on) do update set left_on = null;
      end if;
      if nullif(d->>'left_on','') is not null then
        update public.lodge_memberships set left_on = (d->>'left_on')::date, leaving_reason = nullif(d->>'leaving_reason','')
         where person_id = v_person and lodge_id = v_lodge and left_on is null;
      end if;
    end if;

    -- Degree events (authoritative upstream dates)
    foreach v_kind in array array['initiation','passing','raising','joining','exaltation'] loop
      v_date := nullif(d->>(case v_kind when 'initiation' then 'initiated_on' when 'passing' then 'passed_on'
                                        when 'raising' then 'raised_on' when 'joining' then 'joined_on' else 'exalted_on' end), '')::date;
      continue when v_date is null;
      v_inserted := null;
      insert into public.degree_events(org_id, person_id, lodge_id, kind, event_date, source, import_batch_id)
      values (v_org, v_person, v_lodge, v_kind, v_date, 'import', p_batch)
      on conflict (person_id, kind, event_date) do nothing
      returning id into v_inserted;
      if v_inserted is not null then
        v_degrees := v_degrees + 1;
        if v_kind = 'initiation' and v_date >= current_date - v_window then
          v_initiates := v_initiates + 1;
          perform app.emit(v_org, 'member.initiated', 'person', v_person,
            jsonb_build_object('lodge_id', v_lodge, 'initiated_on', v_date, 'import_batch_id', p_batch));
        end if;
      end if;
    end loop;

    -- Mentoring journey: create for recent initiates, advance stage on progression. Never regress.
    v_stage := case when nullif(d->>'raised_on','') is not null then 'master_mason'
                    when nullif(d->>'passed_on','') is not null then 'fellow_craft'
                    when nullif(d->>'initiated_on','') is not null then 'entered_apprentice' end;
    if v_stage is not null then
      if exists (select 1 from public.member_journeys where person_id = v_person) then
        update public.member_journeys set stage = v_stage
         where person_id = v_person and app.stage_rank(stage) < app.stage_rank(v_stage);
      elsif nullif(d->>'initiated_on','')::date >= current_date - v_window then
        insert into public.member_journeys(org_id, person_id, stage, next_review_on)
        values (v_org, v_person, v_stage, current_date + 90);
      end if;
    end if;

    update public.import_rows set applied_at = now(), matched_person_id = v_person where id = r.id;
  end loop;

  select count(*) into v_skipped from public.import_rows where batch_id = p_batch and decision = 'skip';
  update public.import_batches set status = 'committed', committed_at = now(), approved_by = app.current_account_id(), approved_at = now(),
         stats = stats || jsonb_build_object('created', v_new, 'updated', v_updated, 'degree_events', v_degrees,
                                             'new_initiates', v_initiates, 'review_tasks', v_reviews, 'skipped', v_skipped)
   where id = p_batch;
  perform app.audit('import.committed', 'import_batch', p_batch::text,
    jsonb_build_object('created', v_new, 'updated', v_updated, 'degree_events', v_degrees, 'new_initiates', v_initiates, 'review_tasks', v_reviews));
  perform app.emit(v_org, 'import.committed', 'import_batch', p_batch, jsonb_build_object('new_initiates', v_initiates));
  return jsonb_build_object('created', v_new, 'updated', v_updated, 'degree_events', v_degrees, 'new_initiates', v_initiates, 'review_tasks', v_reviews, 'skipped', v_skipped);
end $$;

-- ===========================================================================
-- Reporting datasets (security_invoker views: RLS of the caller applies)
-- ===========================================================================
create or replace view public.v_lodge_overview with (security_invoker = true) as
select l.id, l.org_id, l.name, l.number, l.status, l.meeting_pattern, mc.name as meeting_centre, mc.town,
       ms.label as mentoring_status, ms.key as mentoring_status_key, l.mentoring_status_changed_at,
       (select p.display_name from public.lodge_appointments a join public.persons p on p.id = a.person_id
         where a.lodge_id = l.id and a.office = 'lodge_mentor' and app.is_current(a.starts_on, a.ends_on) order by a.starts_on desc limit 1) as lodge_mentor,
       (select a.confirmed from public.lodge_appointments a
         where a.lodge_id = l.id and a.office = 'lodge_mentor' and app.is_current(a.starts_on, a.ends_on) order by a.starts_on desc limit 1) as lodge_mentor_confirmed,
       (select p.display_name from public.lodge_appointments a join public.persons p on p.id = a.person_id
         where a.lodge_id = l.id and a.office = 'secretary' and app.is_current(a.starts_on, a.ends_on) order by a.starts_on desc limit 1) as secretary,
       (select p.display_name from public.lodge_appointments a join public.persons p on p.id = a.person_id
         where a.lodge_id = l.id and a.office = 'worshipful_master' and app.is_current(a.starts_on, a.ends_on) order by a.starts_on desc limit 1) as worshipful_master,
       (select la.person_id from public.lodge_allocations la where la.lodge_id = l.id and la.kind = 'primary' and app.is_current(la.starts_on, la.ends_on) limit 1) as apgmen_person_id,
       (select p.display_name from public.lodge_allocations la join public.persons p on p.id = la.person_id
         where la.lodge_id = l.id and la.kind = 'primary' and app.is_current(la.starts_on, la.ends_on) limit 1) as apgmen,
       (select p.display_name from public.lodge_allocations la join public.persons p on p.id = la.person_id
         where la.lodge_id = l.id and la.kind = 'cover' and app.is_current(la.starts_on, la.ends_on) limit 1) as cover_apgmen,
       (select ar.name from public.lodge_allocations la join public.areas ar on ar.id = la.area_id
         where la.lodge_id = l.id and la.kind = 'primary' and app.is_current(la.starts_on, la.ends_on) limit 1) as area,
       (select la.area_id from public.lodge_allocations la
         where la.lodge_id = l.id and la.kind = 'primary' and app.is_current(la.starts_on, la.ends_on) limit 1) as area_id,
       l.membership_count,
       mp.personal_mentors_for_new_members, mp.last_review_on, mp.next_review_on,
       (select max(c.occurred_on) from public.contacts c where c.lodge_id = l.id) as last_contact_on,
       (select count(*) from public.cases c where c.lodge_id = l.id and c.kind = 'request' and c.status not in ('closed','resolved','referred')) as open_requests,
       (select count(*) from public.tasks t where t.lodge_id = l.id and t.status in ('open','in_progress','waiting')) as open_tasks
  from public.lodges l
  left join public.meeting_centres mc on mc.id = l.meeting_centre_id
  left join public.mentoring_statuses ms on ms.id = l.mentoring_status_id
  left join public.lodge_mentoring_profiles mp on mp.lodge_id = l.id;

create or replace view public.v_member_overview with (security_invoker = true) as
select p.id, p.org_id, p.display_name, p.first_name, p.last_name, p.membership_number, p.status, p.email,
       m.lodge_id, l.name as lodge_name, l.number as lodge_number,
       (select d.event_date from public.degree_events d where d.person_id = p.id and d.kind = 'initiation' order by d.event_date desc limit 1) as initiated_on,
       (select d.event_date from public.degree_events d where d.person_id = p.id and d.kind = 'passing' order by d.event_date desc limit 1) as passed_on,
       (select d.event_date from public.degree_events d where d.person_id = p.id and d.kind = 'raising' order by d.event_date desc limit 1) as raised_on,
       (select d.event_date from public.degree_events d where d.person_id = p.id and d.kind = 'exaltation' order by d.event_date desc limit 1) as exalted_on,
       j.stage, j.personal_mentor_allocated, j.next_review_on, j.royal_arch, j.journey_status,
       (select la.area_id from public.lodge_allocations la where la.lodge_id = m.lodge_id and la.kind = 'primary' and app.is_current(la.starts_on, la.ends_on) limit 1) as area_id
  from public.persons p
  left join lateral (select lm.lodge_id from public.lodge_memberships lm where lm.person_id = p.id and lm.left_on is null
                      order by lm.is_primary desc, lm.joined_on limit 1) m on true
  left join public.lodges l on l.id = m.lodge_id
  left join public.member_journeys j on j.person_id = p.id;

create or replace view public.v_learning_records with (security_invoker = true) as
select e.id, e.org_id, e.person_id, p.display_name, e.course_id, c.title as course_title, cv.version_no, e.status, e.source,
       e.enrolled_at, e.completed_at, e.due_on,
       (select lm.lodge_id from public.lodge_memberships lm where lm.person_id = e.person_id and lm.left_on is null order by lm.is_primary desc limit 1) as lodge_id,
       (select count(*) from public.lesson_progress lp where lp.enrolment_id = e.id) as lessons_completed,
       (select count(*) from public.lessons ls join public.course_modules cm on cm.id = ls.module_id where cm.version_id = e.course_version_id and ls.required) as lessons_required
  from public.enrolments e
  join public.persons p on p.id = e.person_id
  join public.courses c on c.id = e.course_id
  join public.course_versions cv on cv.id = e.course_version_id;

create or replace view public.v_event_attendance with (security_invoker = true) as
select e.id as event_id, e.org_id, e.title, e.kind, e.starts_at, e.capacity, e.status, e.is_training,
       count(r.*) filter (where r.status in ('confirmed','attended','no_show')) as registered,
       count(r.*) filter (where r.status = 'waitlisted') as waitlisted,
       count(r.*) filter (where r.status = 'attended') as attended,
       count(r.*) filter (where r.status = 'no_show') as no_show,
       count(r.*) filter (where r.status = 'cancelled') as cancelled,
       round(avg(r.feedback_rating)::numeric, 1) as average_rating,
       count(r.feedback_rating) as feedback_count
  from public.events e left join public.registrations r on r.event_id = e.id
 where app.has_any_perm(array['events.manage','reports.read'])
 group by e.id;

-- ===========================================================================
-- Quarterly report data with effective dates (historic quarters stay stable)
-- ===========================================================================
create or replace function app.report_period_data(p_org uuid, p_start date, p_end date) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'period', jsonb_build_object('start', p_start, 'end', p_end),
    'lodges', jsonb_build_object(
      'active', (select count(*) from public.lodges where org_id = p_org and status = 'active'),
      'with_lodge_mentor', (select count(distinct a.lodge_id) from public.lodge_appointments a join public.lodges l on l.id = a.lodge_id
                              where l.org_id = p_org and l.status = 'active' and a.office = 'lodge_mentor' and a.person_id is not null
                                and app.is_current(a.starts_on, a.ends_on, p_end)),
      'unconfirmed_lodge_mentor', (select count(distinct a.lodge_id) from public.lodge_appointments a join public.lodges l on l.id = a.lodge_id
                              where l.org_id = p_org and a.office = 'lodge_mentor' and not a.confirmed and app.is_current(a.starts_on, a.ends_on, p_end)),
      'allocated', (select count(distinct la.lodge_id) from public.lodge_allocations la where la.org_id = p_org and la.kind = 'primary'
                      and app.is_current(la.starts_on, la.ends_on, p_end)),
      'by_area', coalesce((select jsonb_agg(jsonb_build_object('area', ar.name, 'lodges', cnt) order by ar.code)
                   from (select la.area_id, count(distinct la.lodge_id) cnt from public.lodge_allocations la
                          where la.org_id = p_org and la.kind = 'primary' and app.is_current(la.starts_on, la.ends_on, p_end) group by la.area_id) x
                   join public.areas ar on ar.id = x.area_id), '[]'::jsonb)),
    'membership', jsonb_build_object(
      'initiations', (select count(*) from public.degree_events where org_id = p_org and kind = 'initiation' and event_date between p_start and p_end),
      'passings', (select count(*) from public.degree_events where org_id = p_org and kind = 'passing' and event_date between p_start and p_end),
      'raisings', (select count(*) from public.degree_events where org_id = p_org and kind = 'raising' and event_date between p_start and p_end),
      'joinings', (select count(*) from public.degree_events where org_id = p_org and kind = 'joining' and event_date between p_start and p_end),
      'exaltations', (select count(*) from public.degree_events where org_id = p_org and kind = 'exaltation' and event_date between p_start and p_end),
      'departures', coalesce((select jsonb_object_agg(coalesce(leaving_reason,'unrecorded'), cnt) from
                      (select leaving_reason, count(*) cnt from public.lodge_memberships where org_id = p_org and left_on between p_start and p_end group by 1) x), '{}'::jsonb),
      'early_departures_36m', (select count(*) from public.lodge_memberships lm where lm.org_id = p_org and lm.left_on between p_start and p_end
                                 and lm.join_type = 'initiated' and lm.joined_on > lm.left_on - interval '36 months')),
    'activity', jsonb_build_object(
      'contacts', (select count(*) from public.contacts where org_id = p_org and occurred_on between p_start and p_end and visibility = 'ordinary'),
      'contacts_by_method', coalesce((select jsonb_object_agg(method, cnt) from (select method, count(*) cnt from public.contacts
                              where org_id = p_org and occurred_on between p_start and p_end group by 1) x), '{}'::jsonb),
      'visits_completed', (select count(*) from public.visits where org_id = p_org and status = 'completed' and planned_for::date between p_start and p_end),
      'reviews', (select count(*) from public.lodge_reviews where org_id = p_org and review_date between p_start and p_end),
      'tasks_completed', (select count(*) from public.tasks where org_id = p_org and completed_at::date between p_start and p_end),
      'tasks_open_at_end', (select count(*) from public.tasks where org_id = p_org and created_at::date <= p_end and (completed_at is null or completed_at::date > p_end) and status <> 'cancelled')),
    'support', jsonb_build_object(
      'opened', (select count(*) from public.cases where org_id = p_org and kind = 'request' and created_at::date between p_start and p_end),
      'closed', (select count(*) from public.cases where org_id = p_org and kind = 'request' and closed_at::date between p_start and p_end),
      'open_at_end', (select count(*) from public.cases where org_id = p_org and kind = 'request' and created_at::date <= p_end and (closed_at is null or closed_at::date > p_end)),
      'by_category', coalesce((select jsonb_object_agg(category_key, cnt) from (select category_key, count(*) cnt from public.cases
                       where org_id = p_org and kind = 'request' and created_at::date between p_start and p_end group by 1) x), '{}'::jsonb),
      'confidential_received', (select count(*) from public.cases where org_id = p_org and kind = 'confidential' and created_at::date between p_start and p_end)),
    'learning', jsonb_build_object(
      'enrolments', (select count(*) from public.enrolments where org_id = p_org and enrolled_at::date between p_start and p_end),
      'completions', (select count(*) from public.enrolments where org_id = p_org and completed_at::date between p_start and p_end),
      'certificates', (select count(*) from public.certificates where org_id = p_org and issued_at::date between p_start and p_end and revoked_at is null),
      'active_learners', (select count(distinct person_id) from public.enrolments where org_id = p_org and coalesce(last_activity_at, enrolled_at)::date between p_start and p_end),
      'by_course', coalesce((select jsonb_agg(jsonb_build_object('course', c.title, 'enrolments', x.en, 'completions', x.co) order by x.en desc)
                     from (select course_id, count(*) filter (where enrolled_at::date between p_start and p_end) en,
                                  count(*) filter (where completed_at::date between p_start and p_end) co
                             from public.enrolments where org_id = p_org group by course_id) x
                     join public.courses c on c.id = x.course_id where x.en > 0 or x.co > 0), '[]'::jsonb)),
    'events', jsonb_build_object(
      'held', (select count(*) from public.events where org_id = p_org and status in ('completed','published') and starts_at::date between p_start and p_end and starts_at < now()),
      'training_sessions', (select count(*) from public.events where org_id = p_org and is_training and status <> 'cancelled' and starts_at::date between p_start and p_end),
      'registrations', (select count(*) from public.registrations r join public.events e on e.id = r.event_id where e.org_id = p_org and e.starts_at::date between p_start and p_end and r.status <> 'cancelled'),
      'attended', (select count(*) from public.registrations r join public.events e on e.id = r.event_id where e.org_id = p_org and e.starts_at::date between p_start and p_end and r.status = 'attended'),
      'average_feedback', (select round(avg(r.feedback_rating)::numeric, 1) from public.registrations r join public.events e on e.id = r.event_id where e.org_id = p_org and e.starts_at::date between p_start and p_end)),
    'communications', jsonb_build_object(
      'campaigns_sent', (select count(*) from public.campaigns where org_id = p_org and sent_at::date between p_start and p_end),
      'emails_delivered', (select count(*) from public.campaign_recipients cr join public.campaigns c on c.id = cr.campaign_id
                             where c.org_id = p_org and cr.status = 'delivered' and cr.sent_at::date between p_start and p_end))
  )
$$;

create or replace function public.report_generate_quarterly(p_year int, p_quarter int) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_start date; v_end date; v_snap uuid; v_id uuid; v_existing record; v_org uuid := app.current_org_id();
begin
  perform app.require(app.has_perm('reports.quarterly'), 'Not permitted');
  perform app.require(p_quarter between 1 and 4, 'Invalid quarter');
  v_start := make_date(p_year, (p_quarter - 1) * 3 + 1, 1);
  v_end := (v_start + interval '3 months' - interval '1 day')::date;
  select * into v_existing from public.quarterly_reports where org_id = v_org and year = p_year and quarter = p_quarter for update;
  perform app.require(v_existing.id is null or v_existing.status in ('draft','review'), 'This quarter''s report has been approved and cannot be regenerated');
  insert into public.report_snapshots(org_id, kind, period_start, period_end, data)
  values (v_org, 'quarterly', v_start, v_end, app.report_period_data(v_org, v_start, v_end)
            || jsonb_build_object('previous', app.report_period_data(v_org, (v_start - interval '3 months')::date, (v_start - interval '1 day')::date)))
  returning id into v_snap;
  insert into public.quarterly_reports(org_id, year, quarter, status, snapshot_id)
  values (v_org, p_year, p_quarter, 'draft', v_snap)
  on conflict (org_id, year, quarter) do update set snapshot_id = excluded.snapshot_id, generated_at = now(), generated_by = app.current_account_id()
  returning id into v_id;
  perform app.audit('quarterly_report.generated', 'quarterly_report', v_id::text, jsonb_build_object('year', p_year, 'quarter', p_quarter));
  return v_id;
end $$;

create or replace function public.report_quarterly_transition(p_report uuid, p_to text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare q record;
begin
  select * into q from public.quarterly_reports where id = p_report and org_id = app.current_org_id() for update;
  perform app.require(q.id is not null and app.has_perm('reports.quarterly'), 'Not permitted');
  if q.status = 'draft' and p_to = 'review' then
    update public.quarterly_reports set status = 'review' where id = p_report;
    perform app.emit(q.org_id, 'approval.required', 'quarterly_report', p_report, jsonb_build_object('kind','quarterly_report'));
  elsif q.status = 'review' and p_to = 'draft' then
    update public.quarterly_reports set status = 'draft' where id = p_report;
  elsif q.status = 'review' and p_to = 'approved' then
    perform app.require(app.has_perm('reports.quarterly.approve'), 'Only Provincial leadership can approve the quarterly report');
    update public.quarterly_reports set status = 'approved', approved_by = app.current_account_id(), approved_at = now() where id = p_report;
  elsif q.status = 'approved' and p_to = 'published' then
    perform app.require(app.has_perm('reports.quarterly.approve'), 'Only Provincial leadership can publish the quarterly report');
    update public.quarterly_reports set status = 'published', published_at = now() where id = p_report;
  else
    raise exception using errcode = 'P0001', message = format('Cannot move a %s report to %s', q.status, p_to);
  end if;
  perform app.audit('quarterly_report.' || p_to, 'quarterly_report', p_report::text);
end $$;

-- ===========================================================================
-- Global search (security invoker: every branch is filtered by RLS)
-- ===========================================================================
create or replace function public.search_all(p_query text, p_limit int default 8)
returns table(kind text, id uuid, title text, subtitle text, href text)
language sql stable security invoker set search_path = public, pg_temp as $$
  with q as (select trim(p_query) as t, '%' || replace(replace(trim(p_query), '%', ''), '_', '') || '%' as pat,
                    websearch_to_tsquery('english', trim(p_query)) as ts)
  (select 'lodge', l.id, l.name || ' No. ' || l.number, null::text, '/lodges/' || l.id
     from public.lodges l, q where l.name ilike q.pat or l.number::text = q.t limit p_limit)
  union all
  (select 'person', p.id, p.display_name, p.membership_number, '/members/' || p.id
     from public.persons p, q where ((p.first_name || ' ' || p.last_name) ilike q.pat or p.membership_number = q.t)
       and p.id <> coalesce(app.current_person_id(), '00000000-0000-0000-0000-000000000000')
       and app.has_perm('members.read.basic') limit p_limit)
  union all
  (select 'event', e.id, e.title, to_char(e.starts_at, 'DD Mon YYYY'), '/events/' || e.id
     from public.events e, q where e.title ilike q.pat order by e.starts_at desc limit p_limit)
  union all
  (select 'course', c.id, c.title, null, '/academy/courses/' || c.slug
     from public.courses c, q where c.title ilike q.pat or c.summary ilike q.pat limit p_limit)
  union all
  (select 'document', d.id, d.reference || ' ' || d.title, null, '/library/' || d.id
     from public.documents d, q where d.search @@ q.ts or d.title ilike q.pat limit p_limit)
  union all
  (select 'article', k.id, k.title, k.kind, '/library/knowledge/' || k.slug
     from public.knowledge_articles k, q where k.search @@ q.ts or k.title ilike q.pat limit p_limit)
  union all
  (select 'task', t.id, t.title, t.status, '/tasks/' || t.id
     from public.tasks t, q where t.title ilike q.pat limit p_limit)
  union all
  (select 'meeting', m.id, m.title, to_char(m.starts_at, 'DD Mon YYYY'), '/team/meetings/' || m.id
     from public.meetings m, q where m.search @@ q.ts or m.title ilike q.pat limit p_limit)
  union all
  (select 'note', n.id, left(n.body, 80), n.subject_type, case n.subject_type when 'lodge' then '/lodges/' || n.subject_id
             when 'case' then '/support/' || n.subject_id when 'person' then '/members/' || n.subject_id else '/team' end
     from public.notes n, q where n.visibility <> 'restricted' and n.body ilike q.pat and n.archived_at is null limit p_limit)
  union all
  (select 'case', c.id, c.reference || ' ' || c.title, c.status, '/support/' || c.id
     from public.cases c, q where c.kind = 'request' and (c.reference ilike q.pat or c.title ilike q.pat) limit p_limit)
$$;

-- ===========================================================================
-- Calendar subscription feeds (token-authenticated, evaluated as the account)
-- ===========================================================================
create or replace function public.calendar_feed_events(p_token_hash text)
returns table(id uuid, title text, description text, starts_at timestamptz, ends_at timestamptz, location text, status text, kind text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare t record; v_auth uuid;
begin
  select ft.*, ua.auth_user_id, ua.status as account_status into t
    from public.calendar_feed_tokens ft join public.user_accounts ua on ua.id = ft.account_id
   where ft.token_hash = p_token_hash and ft.revoked_at is null;
  if t.id is null or t.account_status <> 'active' then return; end if;
  update public.calendar_feed_tokens set last_used_at = now() where id = t.id;
  -- Act as the token's owner for this statement so the normal visibility rules apply.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', t.auth_user_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  return query
    select e.id, e.title, e.description, e.starts_at, e.ends_at, e.location, e.status, e.kind
      from public.events e
     where e.org_id = t.org_id and e.starts_at > now() - interval '90 days' and e.status <> 'draft'
       and app.can_see_event(e.id)
       and (exists (select 1 from public.registrations r where r.event_id = e.id and r.person_id = app.current_person_id() and r.status in ('confirmed','attended'))
            or exists (select 1 from public.event_trainers tr where tr.event_id = e.id and tr.person_id = app.current_person_id())
            or (app.has_perm('events.read.internal') and e.visibility in ('internal','lodge_mentors')))
     order by e.starts_at;
end $$;

-- ===========================================================================
-- Retention (dry-run by default)
-- ===========================================================================
create or replace function public.retention_run(p_policy uuid, p_dry_run boolean default true) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare pol record; v_cut date; v_count int := 0;
begin
  perform app.require(app.has_perm('admin.config'), 'Not permitted');
  select * into pol from public.retention_policies where id = p_policy and org_id = app.current_org_id();
  perform app.require(pol.id is not null, 'Policy not found');
  perform app.require(p_dry_run or pol.enabled, 'Enable the policy before running it for real');
  v_cut := (current_date - make_interval(months => pol.retain_months))::date;
  if pol.entity_type = 'persons_departed' then
    select count(*) into v_count from public.persons p where p.org_id = pol.org_id and p.anonymised_at is null
       and p.status in ('resigned','ceased','deceased','excluded') and coalesce(p.status_changed_on, p.updated_at::date) < v_cut
       and not exists (select 1 from public.user_accounts ua where ua.person_id = p.id and ua.status = 'active');
    if not p_dry_run then
      update public.persons p set first_name = 'Former', last_name = 'member', title = null, email = null, phone = null,
             local_corrections = '{}'::jsonb, anonymised_at = now()
       where p.org_id = pol.org_id and p.anonymised_at is null and p.status in ('resigned','ceased','deceased','excluded')
         and coalesce(p.status_changed_on, p.updated_at::date) < v_cut
         and not exists (select 1 from public.user_accounts ua where ua.person_id = p.id and ua.status = 'active');
      update public.contacts c set summary = '[removed under retention policy]', outcome = null
       where c.person_id in (select id from public.persons where anonymised_at is not null and org_id = pol.org_id);
    end if;
  elsif pol.entity_type = 'cases_closed' then
    select count(*) into v_count from public.cases where org_id = pol.org_id and closed_at::date < v_cut and description is not null;
    if not p_dry_run then
      update public.cases set description = '[removed under retention policy]', outcome = null
       where org_id = pol.org_id and closed_at::date < v_cut and description is not null;
      update public.case_events set body = null where case_id in (select id from public.cases where org_id = pol.org_id and closed_at::date < v_cut);
    end if;
  elsif pol.entity_type = 'import_rows' then
    select count(*) into v_count from public.import_rows r join public.import_batches b on b.id = r.batch_id
     where b.org_id = pol.org_id and b.created_at::date < v_cut;
    if not p_dry_run then
      delete from public.import_rows r using public.import_batches b where b.id = r.batch_id and b.org_id = pol.org_id and b.created_at::date < v_cut;
    end if;
  elsif pol.entity_type = 'email_outbox' then
    select count(*) into v_count from public.email_outbox where org_id = pol.org_id and created_at::date < v_cut and status in ('sent','failed','cancelled','suppressed');
    if not p_dry_run then
      delete from public.email_outbox where org_id = pol.org_id and created_at::date < v_cut and status in ('sent','failed','cancelled','suppressed');
    end if;
  elsif pol.entity_type = 'notifications' then
    select count(*) into v_count from public.notifications where org_id = pol.org_id and created_at::date < v_cut;
    if not p_dry_run then delete from public.notifications where org_id = pol.org_id and created_at::date < v_cut; end if;
  else
    raise exception using errcode = 'P0001', message = 'This record type is not handled by automatic retention';
  end if;
  insert into public.retention_runs(org_id, policy_id, dry_run, affected, run_by, details)
  values (pol.org_id, pol.id, p_dry_run, v_count, app.current_account_id(), jsonb_build_object('cutoff', v_cut));
  return jsonb_build_object('affected', v_count, 'cutoff', v_cut, 'dry_run', p_dry_run);
end $$;

-- ===========================================================================
-- Lock down: nothing for anonymous users except the explicit public functions.
-- ===========================================================================
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.calendar_feed_events(text) from authenticated;
grant execute on function public.calendar_feed_events(text) to service_role;
revoke execute on function public.unsubscribe_by_token(text, text) from authenticated;
grant execute on function public.unsubscribe_by_token(text, text) to service_role;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;
alter default privileges in schema public revoke execute on functions from anon, public;
alter default privileges in schema public revoke all on tables from anon;
