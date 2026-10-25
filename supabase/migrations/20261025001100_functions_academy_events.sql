-- Business functions: guards, Academy and events.
-- Public functions are security definer with explicit permission checks, and are
-- revoked from anon. They are the only route for state transitions that policies
-- deliberately do not allow directly.

create or replace function app.require(p_ok boolean, p_message text) returns void
language plpgsql as $$
begin
  if not coalesce(p_ok, false) then
    raise exception using errcode = '42501', message = p_message;
  end if;
end $$;

create or replace function app.allow_guarded() returns void
language sql as $$ select set_config('app.guard_bypass', 'on', true) $$;

create or replace function app.guard_active() returns boolean
language sql stable as $$ select coalesce(current_setting('app.guard_bypass', true), '') <> 'on' $$;

-- Published pointers may only be moved by the approval functions.
create or replace function app.guard_course_publication() returns trigger
language plpgsql as $$
begin
  if new.published_version_id is distinct from old.published_version_id and app.guard_active()
     and current_user not in ('postgres','service_role','supabase_admin') then
    raise exception using errcode = '42501', message = 'Courses are published through the approval workflow';
  end if;
  return new;
end $$;
create trigger courses_guard before update on public.courses for each row execute function app.guard_course_publication();

create or replace function app.guard_document_publication() returns trigger
language plpgsql as $$
begin
  if new.current_version_id is distinct from old.current_version_id and app.guard_active()
     and current_user not in ('postgres','service_role','supabase_admin') then
    raise exception using errcode = '42501', message = 'Documents are published through the approval workflow';
  end if;
  return new;
end $$;
create trigger documents_guard before update on public.documents for each row execute function app.guard_document_publication();

-- A confidential concern can never be re-labelled into an ordinary request.
create or replace function app.guard_case_kind() returns trigger
language plpgsql as $$
begin
  if new.kind is distinct from old.kind then
    raise exception using errcode = '42501', message = 'A case''s confidentiality cannot be changed';
  end if;
  if new.reference is distinct from old.reference then
    raise exception using errcode = '42501', message = 'Case references are fixed';
  end if;
  return new;
end $$;
create trigger cases_guard before update on public.cases for each row execute function app.guard_case_kind();

-- ===========================================================================
-- Academy
-- ===========================================================================

create or replace function app.issue_certificate(p_person uuid, p_kind text, p_title text, p_completed_on date,
  p_course uuid default null, p_version uuid default null, p_enrolment uuid default null,
  p_event uuid default null, p_pathway uuid default null, p_reason text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_org uuid; v_name text; v_ref text;
begin
  select org_id, display_name into v_org, v_name from public.persons where id = p_person;
  if p_enrolment is not null then
    select id into v_id from public.certificates where enrolment_id = p_enrolment and revoked_at is null;
    if v_id is not null then return v_id; end if;
  end if;
  if p_event is not null then
    select id into v_id from public.certificates where event_id = p_event and person_id = p_person and revoked_at is null;
    if v_id is not null then return v_id; end if;
  end if;
  v_ref := 'HMA-' || to_char(p_completed_on, 'YYYY') || '-' || lpad(nextval('public.certificate_reference_seq')::text, 5, '0');
  insert into public.certificates(org_id, person_id, kind, reference, title, learner_name, course_id, course_version_id,
                                  enrolment_id, event_id, pathway_id, completed_on, issued_by, recognition_reason)
  values (v_org, p_person, p_kind, v_ref, p_title, v_name, p_course, p_version, p_enrolment, p_event, p_pathway,
          p_completed_on, case when p_kind = 'recognition' then app.current_account_id() end, p_reason)
  returning id into v_id;
  perform app.emit(v_org, 'certificate.issued', 'certificate', v_id, jsonb_build_object('person_id', p_person, 'kind', p_kind));
  return v_id;
end $$;

create or replace function app.award_badges(p_person uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare b record; v_org uuid; v_completed int;
begin
  select org_id into v_org from public.persons where id = p_person;
  select count(distinct course_id) into v_completed from public.enrolments where person_id = p_person and status = 'completed';
  for b in select * from public.badges where org_id = v_org and active loop
    if (b.criteria ? 'course_id' and exists (select 1 from public.enrolments e where e.person_id = p_person and e.status = 'completed'
                                                and e.course_id = (b.criteria->>'course_id')::uuid))
       or (b.criteria ? 'courses_completed' and v_completed >= (b.criteria->>'courses_completed')::int)
       or (b.criteria ? 'pathway_id' and not exists (
             select 1 from public.pathway_courses pc where pc.pathway_id = (b.criteria->>'pathway_id')::uuid and pc.requirement = 'essential'
               and not exists (select 1 from public.enrolments e where e.person_id = p_person and e.course_id = pc.course_id and e.status = 'completed')))
    then
      insert into public.badge_awards(org_id, badge_id, person_id) values (v_org, b.id, p_person) on conflict do nothing;
    end if;
  end loop;
end $$;

-- Completion is decided here only: all required lessons complete and, where
-- required, every assessment passed.
create or replace function app.evaluate_enrolment(p_enrolment uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare e record; v record; v_missing int;
begin
  select * into e from public.enrolments where id = p_enrolment for update;
  if e.status in ('completed','withdrawn') then return e.status; end if;
  select * into v from public.course_versions where id = e.course_version_id;
  select count(*) into v_missing
    from public.lessons l join public.course_modules m on m.id = l.module_id
   where m.version_id = e.course_version_id and l.required
     and not exists (select 1 from public.lesson_progress lp where lp.enrolment_id = e.id and lp.lesson_id = l.id);
  if v_missing = 0 and v.completion_rule = 'all_lessons_and_assessments' then
    select count(*) into v_missing
      from public.lessons l join public.course_modules m on m.id = l.module_id
     where m.version_id = e.course_version_id and l.is_assessment
       and not exists (select 1 from public.assessment_attempts a where a.enrolment_id = e.id and a.lesson_id = l.id and a.passed);
  end if;
  if v_missing > 0 then
    update public.enrolments set status = 'in_progress', started_at = coalesce(started_at, now()), last_activity_at = now() where id = e.id;
    return 'in_progress';
  end if;
  update public.enrolments set status = 'completed', completed_at = now(), started_at = coalesce(started_at, now()), last_activity_at = now() where id = e.id;
  if v.certificate_enabled then
    perform app.issue_certificate(e.person_id, 'course', v.title, current_date, e.course_id, e.course_version_id, e.id);
  end if;
  perform app.award_badges(e.person_id);
  perform app.emit(e.org_id, 'course.completed', 'enrolment', e.id, jsonb_build_object('person_id', e.person_id, 'course_id', e.course_id));
  return 'completed';
end $$;

create or replace function public.academy_enrol(p_course uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_version uuid; v_id uuid; v_org uuid;
begin
  perform app.require(app.has_perm('academy.learn'), 'You do not have access to the Academy');
  select c.published_version_id, c.org_id into v_version, v_org from public.courses c
   where c.id = p_course and c.org_id = app.current_org_id() and c.archived_at is null;
  perform app.require(v_version is not null, 'This course is not available');
  select id into v_id from public.enrolments
   where person_id = app.current_person_id() and course_id = p_course and status <> 'withdrawn'
   order by enrolled_at desc limit 1;
  if v_id is not null then return v_id; end if;
  insert into public.enrolments(org_id, person_id, course_id, course_version_id, source)
  values (v_org, app.current_person_id(), p_course, v_version, 'self')
  on conflict (person_id, course_version_id) do update set status = 'enrolled', completed_at = null
  returning id into v_id;
  perform app.emit(v_org, 'course.enrolled', 'enrolment', v_id, jsonb_build_object('person_id', app.current_person_id(), 'course_id', p_course));
  return v_id;
end $$;

create or replace function public.academy_admin_enrol(p_person uuid, p_course uuid, p_due date default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_version uuid; v_id uuid; v_org uuid;
begin
  perform app.require(app.has_perm('academy.admin'), 'Not permitted to enrol other learners');
  select c.published_version_id, c.org_id into v_version, v_org from public.courses c where c.id = p_course and c.org_id = app.current_org_id();
  perform app.require(v_version is not null, 'This course is not published');
  perform app.require(exists (select 1 from public.persons where id = p_person and org_id = v_org), 'Unknown person');
  insert into public.enrolments(org_id, person_id, course_id, course_version_id, source, assigned_by, due_on)
  values (v_org, p_person, p_course, v_version, 'assigned', app.current_account_id(), p_due)
  on conflict (person_id, course_version_id) do update set due_on = excluded.due_on
  returning id into v_id;
  perform app.emit(v_org, 'course.assigned', 'enrolment', v_id, jsonb_build_object('person_id', p_person, 'course_id', p_course));
  return v_id;
end $$;

create or replace function public.academy_withdraw(p_enrolment uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require(app.owns_enrolment(p_enrolment) or app.has_perm('academy.admin'), 'Not permitted');
  update public.enrolments set status = 'withdrawn' where id = p_enrolment and status <> 'completed';
end $$;

create or replace function app.lesson_in_enrolment(p_enrolment uuid, p_lesson uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.enrolments e
                   join public.course_modules m on m.version_id = e.course_version_id
                   join public.lessons l on l.module_id = m.id
                  where e.id = p_enrolment and l.id = p_lesson)
$$;

create or replace function public.academy_complete_lesson(p_enrolment uuid, p_lesson uuid, p_reflection text default null)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_lesson record; v_enrol record;
begin
  perform app.require(app.has_perm('academy.learn'), 'You do not have access to the Academy');
  select * into v_enrol from public.enrolments where id = p_enrolment;
  perform app.require(v_enrol.person_id = app.current_person_id(), 'This is not your enrolment');
  perform app.require(v_enrol.status <> 'withdrawn', 'This enrolment has been withdrawn');
  perform app.require(app.lesson_in_enrolment(p_enrolment, p_lesson), 'Lesson is not part of this course');
  select * into v_lesson from public.lessons where id = p_lesson;
  perform app.require(not v_lesson.is_assessment, 'Assessments are completed by submitting answers');
  if v_lesson.kind = 'reflection' then
    perform app.require(length(trim(coalesce(p_reflection, ''))) > 0, 'Please write a short reflection before continuing');
    insert into public.reflections(person_id, lesson_id, enrolment_id, response)
    values (v_enrol.person_id, p_lesson, p_enrolment, p_reflection)
    on conflict (person_id, lesson_id) do update set response = excluded.response, updated_at = now();
  end if;
  insert into public.lesson_progress(enrolment_id, lesson_id) values (p_enrolment, p_lesson) on conflict do nothing;
  return app.evaluate_enrolment(p_enrolment);
end $$;

create or replace function public.academy_submit_assessment(p_enrolment uuid, p_lesson uuid, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_enrol record; v_lesson record; v_version record;
  v_attempts int; v_total int := 0; v_correct int := 0; v_score int; v_pass_mark int; v_passed boolean;
  v_results jsonb := '[]'::jsonb; q record; v_given jsonb; v_ok boolean; v_status text;
begin
  perform app.require(app.has_perm('academy.learn'), 'You do not have access to the Academy');
  select * into v_enrol from public.enrolments where id = p_enrolment for update;
  perform app.require(v_enrol.person_id = app.current_person_id(), 'This is not your enrolment');
  perform app.require(v_enrol.status <> 'withdrawn', 'This enrolment has been withdrawn');
  perform app.require(app.lesson_in_enrolment(p_enrolment, p_lesson), 'Lesson is not part of this course');
  select * into v_lesson from public.lessons where id = p_lesson;
  perform app.require(v_lesson.is_assessment or v_lesson.kind = 'quiz', 'This lesson has no assessment');
  select * into v_version from public.course_versions where id = v_enrol.course_version_id;

  select count(*) into v_attempts from public.assessment_attempts where enrolment_id = p_enrolment and lesson_id = p_lesson;
  if exists (select 1 from public.assessment_attempts where enrolment_id = p_enrolment and lesson_id = p_lesson and passed) then
    raise exception using errcode = 'P0001', message = 'You have already passed this assessment';
  end if;
  perform app.require(v_lesson.max_attempts is null or v_attempts < v_lesson.max_attempts, 'No attempts remaining. Please contact the Academy team.');

  for q in select qu.id, qu.kind, k.correct, k.feedback_correct, k.feedback_incorrect, k.explanation
             from public.questions qu join public.question_keys k on k.question_id = qu.id
            where qu.lesson_id = p_lesson order by qu.position loop
    v_total := v_total + 1;
    v_given := coalesce(p_answers -> (q.id::text), '[]'::jsonb);
    if jsonb_typeof(v_given) <> 'array' then v_given := jsonb_build_array(v_given); end if;
    v_ok := (select coalesce(array_agg(x order by x), '{}') from jsonb_array_elements_text(v_given) x)
          = (select coalesce(array_agg(x order by x), '{}') from jsonb_array_elements_text(q.correct) x);
    if v_ok then v_correct := v_correct + 1; end if;
    v_results := v_results || jsonb_build_object('question_id', q.id, 'correct', v_ok,
      'feedback', case when v_ok then q.feedback_correct else q.feedback_incorrect end,
      'explanation', q.explanation);
  end loop;
  perform app.require(v_total > 0, 'This assessment has no questions');

  v_score := round(100.0 * v_correct / v_total);
  v_pass_mark := coalesce(v_lesson.pass_mark, v_version.pass_mark);
  v_passed := v_score >= v_pass_mark;
  insert into public.assessment_attempts(enrolment_id, lesson_id, attempt_no, score, passed, answers)
  values (p_enrolment, p_lesson, v_attempts + 1, v_score, v_passed, p_answers);
  if v_passed then
    insert into public.lesson_progress(enrolment_id, lesson_id) values (p_enrolment, p_lesson) on conflict do nothing;
  end if;
  v_status := app.evaluate_enrolment(p_enrolment);
  return jsonb_build_object('score', v_score, 'passed', v_passed, 'pass_mark', v_pass_mark, 'attempt_no', v_attempts + 1,
    'attempts_remaining', case when v_lesson.max_attempts is null then null else v_lesson.max_attempts - v_attempts - 1 end,
    'results', v_results, 'enrolment_status', v_status);
end $$;

create or replace function public.academy_issue_recognition(p_person uuid, p_title text, p_completed_on date, p_reason text, p_course uuid default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require(app.has_perm('academy.admin'), 'Not permitted to issue recognition certificates');
  perform app.require(length(trim(coalesce(p_reason,''))) >= 10, 'Please record the reason for recognition');
  perform app.require(exists (select 1 from public.persons where id = p_person and org_id = app.current_org_id()), 'Unknown person');
  return app.issue_certificate(p_person, 'recognition', p_title, p_completed_on, p_course, null, null, null, null, p_reason);
end $$;

-- Draft -> Review -> Approved -> Published -> Revised -> Archived
create or replace function public.academy_transition_version(p_version uuid, p_to text, p_note text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v record; v_lessons int; v_self boolean;
begin
  select * into v from public.course_versions where id = p_version and org_id = app.current_org_id() for update;
  perform app.require(v.id is not null, 'Version not found');
  v_self := v.created_by = app.current_account_id();
  if v.status = 'draft' and p_to = 'review' then
    perform app.require(app.has_perm('academy.author'), 'Not permitted');
    select count(*) into v_lessons from public.lessons l join public.course_modules m on m.id = l.module_id where m.version_id = v.id;
    perform app.require(v_lessons > 0, 'Add at least one lesson before submitting for review');
    update public.course_versions set status = 'review', submitted_by = app.current_account_id(), submitted_at = now() where id = v.id;
    perform app.emit(v.org_id, 'approval.required', 'course_version', v.id, jsonb_build_object('kind','course','title', v.title));
  elsif v.status = 'review' and p_to = 'draft' then
    perform app.require(app.has_any_perm(array['academy.review','academy.author']), 'Not permitted');
    update public.course_versions set status = 'draft', review_note = p_note, reviewed_by = app.current_account_id() where id = v.id;
  elsif v.status = 'review' and p_to = 'approved' then
    perform app.require(app.has_perm('academy.review'), 'Only an Academy reviewer can approve');
    perform app.require(not v_self or coalesce((select (settings->'academy'->>'allow_self_approval')::boolean from public.organisations where id = v.org_id), false),
                        'A course must be approved by someone other than its author');
    update public.course_versions set status = 'approved', approved_by = app.current_account_id(), approved_at = now(), review_note = p_note, reviewed_by = app.current_account_id() where id = v.id;
  elsif v.status = 'approved' and p_to = 'published' then
    perform app.require(app.has_perm('academy.publish'), 'Only an Academy publisher can publish');
    update public.course_versions set status = 'revised' where course_id = v.course_id and status = 'published';
    update public.course_versions set status = 'published', published_by = app.current_account_id(), published_at = now() where id = v.id;
    perform app.allow_guarded();
    update public.courses set published_version_id = v.id, title = v.title, summary = v.summary where id = v.course_id;
    perform app.emit(v.org_id, 'course.published', 'course', v.course_id, jsonb_build_object('version_id', v.id));
  elsif v.status in ('published','revised','approved') and p_to = 'archived' then
    perform app.require(app.has_perm('academy.publish'), 'Not permitted');
    update public.course_versions set status = 'archived' where id = v.id;
    if v.status = 'published' then
      perform app.allow_guarded();
      update public.courses set published_version_id = null where id = v.course_id;
    end if;
  else
    raise exception using errcode = 'P0001', message = format('Cannot move a %s version to %s', v.status, p_to);
  end if;
  perform app.audit('course_version.' || p_to, 'course_version', v.id::text, jsonb_build_object('note', p_note));
end $$;

-- Create a new draft version by copying the latest version's structure.
create or replace function public.academy_new_version(p_course uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare src record; v_new uuid; m record; v_mod uuid; l record; v_les uuid; q record; v_q uuid;
begin
  perform app.require(app.has_perm('academy.author'), 'Not permitted');
  perform app.require(not exists (select 1 from public.course_versions where course_id = p_course and status in ('draft','review','approved')),
                      'A version is already being prepared for this course');
  select * into src from public.course_versions where course_id = p_course and org_id = app.current_org_id() order by version_no desc limit 1;
  perform app.require(src.id is not null, 'Course not found');
  insert into public.course_versions(org_id, course_id, version_no, title, summary, pass_mark, completion_rule, certificate_enabled)
  values (src.org_id, p_course, src.version_no + 1, src.title, src.summary, src.pass_mark, src.completion_rule, src.certificate_enabled)
  returning id into v_new;
  for m in select * from public.course_modules where version_id = src.id order by position loop
    insert into public.course_modules(version_id, position, title, summary) values (v_new, m.position, m.title, m.summary) returning id into v_mod;
    for l in select * from public.lessons where module_id = m.id order by position loop
      insert into public.lessons(module_id, position, title, kind, content, estimated_minutes, is_assessment, pass_mark, max_attempts, required)
      values (v_mod, l.position, l.title, l.kind, l.content, l.estimated_minutes, l.is_assessment, l.pass_mark, l.max_attempts, l.required)
      returning id into v_les;
      for q in select qu.*, k.correct, k.feedback_correct, k.feedback_incorrect, k.explanation
                 from public.questions qu left join public.question_keys k on k.question_id = qu.id where qu.lesson_id = l.id loop
        insert into public.questions(lesson_id, position, kind, prompt, options) values (v_les, q.position, q.kind, q.prompt, q.options) returning id into v_q;
        if q.correct is not null then
          insert into public.question_keys(question_id, correct, feedback_correct, feedback_incorrect, explanation)
          values (v_q, q.correct, q.feedback_correct, q.feedback_incorrect, q.explanation);
        end if;
      end loop;
    end loop;
  end loop;
  return v_new;
end $$;

-- ===========================================================================
-- Events
-- ===========================================================================

create or replace function app.registration_capacity_left(p_event uuid) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select case when e.capacity is null then 2147483647
              else e.capacity - (select count(*) from public.registrations r where r.event_id = e.id and r.status in ('confirmed','attended'))::int end
    from public.events e where e.id = p_event
$$;

create or replace function app.register_person(p_event uuid, p_person uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare e record; v_existing record; v_status text; v_pos int; v_id uuid;
begin
  select * into e from public.events where id = p_event for update;
  perform app.require(e.status = 'published', 'This event is not open for registration');
  perform app.require(e.registration_mode = 'hub', case when e.registration_mode = 'external' then 'Bookings for this event are made through Octra-Lodge' else 'This event does not take registrations' end);
  perform app.require(e.registration_opens_at is null or now() >= e.registration_opens_at, 'Registration has not opened yet');
  perform app.require(coalesce(e.registration_closes_at, e.starts_at) > now(), 'Registration has closed');
  select * into v_existing from public.registrations where event_id = p_event and person_id = p_person;
  if v_existing.id is not null and v_existing.status in ('confirmed','waitlisted','attended') then
    return jsonb_build_object('registration_id', v_existing.id, 'status', v_existing.status, 'already', true);
  end if;
  if app.registration_capacity_left(p_event) > 0 then
    v_status := 'confirmed';
  elsif e.waitlist_enabled then
    v_status := 'waitlisted';
    select coalesce(max(waitlist_position), 0) + 1 into v_pos from public.registrations where event_id = p_event and status = 'waitlisted';
  else
    raise exception using errcode = 'P0001', message = 'This event is full';
  end if;
  insert into public.registrations(org_id, event_id, person_id, status, waitlist_position)
  values (e.org_id, p_event, p_person, v_status, v_pos)
  on conflict (event_id, person_id) do update set status = excluded.status, waitlist_position = excluded.waitlist_position,
     cancelled_at = null, registered_at = now()
  returning id into v_id;
  perform app.emit(e.org_id, 'event.registered', 'registration', v_id, jsonb_build_object('event_id', p_event, 'person_id', p_person, 'status', v_status));
  return jsonb_build_object('registration_id', v_id, 'status', v_status, 'waitlist_position', v_pos);
end $$;

create or replace function public.event_register(p_event uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require(app.current_person_id() is not null, 'Please sign in');
  perform app.require(app.can_see_event(p_event), 'Event not found');
  return app.register_person(p_event, app.current_person_id());
end $$;

create or replace function public.event_register_person(p_event uuid, p_person uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require(app.has_perm('events.manage'), 'Not permitted');
  perform app.require(exists (select 1 from public.persons where id = p_person and org_id = app.current_org_id()), 'Unknown person');
  return app.register_person(p_event, p_person);
end $$;

create or replace function app.promote_waitlist(p_event uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  while app.registration_capacity_left(p_event) > 0 loop
    select * into r from public.registrations where event_id = p_event and status = 'waitlisted' order by waitlist_position, registered_at limit 1 for update;
    exit when r.id is null;
    update public.registrations set status = 'confirmed', waitlist_position = null where id = r.id;
    perform app.emit(r.org_id, 'event.waitlist_promoted', 'registration', r.id, jsonb_build_object('event_id', p_event, 'person_id', r.person_id));
  end loop;
end $$;

create or replace function public.event_cancel_registration(p_registration uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  select * into r from public.registrations where id = p_registration for update;
  perform app.require(r.id is not null and (r.person_id = app.current_person_id() or app.can_manage_event(r.event_id)), 'Not permitted');
  perform app.require(r.status in ('confirmed','waitlisted'), 'This registration cannot be cancelled');
  perform 1 from public.events where id = r.event_id for update;
  update public.registrations set status = 'cancelled', cancelled_at = now(), waitlist_position = null where id = r.id;
  perform app.emit(r.org_id, 'event.cancelled_registration', 'registration', r.id, jsonb_build_object('event_id', r.event_id, 'person_id', r.person_id));
  perform app.promote_waitlist(r.event_id);
end $$;

-- Verified attendance updates learning records.
create or replace function app.on_attendance(p_registration uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; e record; v_enrol uuid; v_version uuid;
begin
  select * into r from public.registrations where id = p_registration;
  select * into e from public.events where id = r.event_id;
  if e.course_id is not null and e.attendance_completes_course then
    select published_version_id into v_version from public.courses where id = e.course_id;
    if v_version is not null then
      insert into public.enrolments(org_id, person_id, course_id, course_version_id, source, status, started_at, completed_at)
      values (e.org_id, r.person_id, e.course_id, v_version, 'event', 'completed', now(), now())
      on conflict (person_id, course_version_id) do update set status = 'completed', completed_at = coalesce(enrolments.completed_at, now())
      returning id into v_enrol;
      perform app.issue_certificate(r.person_id, 'course', (select title from public.course_versions where id = v_version),
                                    e.starts_at::date, e.course_id, v_version, v_enrol);
      perform app.award_badges(r.person_id);
    end if;
  end if;
  if e.certificate_on_attendance then
    perform app.issue_certificate(r.person_id, 'event', e.title, e.starts_at::date, e.course_id, null, null, e.id);
  end if;
  perform app.emit(e.org_id, 'event.attended', 'registration', r.id, jsonb_build_object('event_id', e.id, 'person_id', r.person_id));
end $$;

-- Self check-in by scanning the session QR code shown by the presenter.
create or replace function public.event_check_in_session(p_event uuid, p_secret text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare e record; r record;
begin
  select * into e from public.events where id = p_event;
  perform app.require(e.id is not null and e.checkin_secret = p_secret, 'This check-in code is not valid');
  perform app.require(e.checkin_open, 'Check-in is not open for this session');
  perform app.require(now() between e.starts_at - interval '2 hours' and e.ends_at + interval '2 hours', 'Check-in is only available around the session time');
  select * into r from public.registrations where event_id = p_event and person_id = app.current_person_id() for update;
  perform app.require(r.id is not null and r.status in ('confirmed','attended'), 'You do not have a confirmed place for this session');
  if r.status = 'attended' then return jsonb_build_object('status','attended','already',true); end if;
  update public.registrations set status = 'attended', checked_in_at = now(), checkin_method = 'qr_session' where id = r.id;
  perform app.on_attendance(r.id);
  return jsonb_build_object('status','attended');
end $$;

-- Organiser scans an attendee's personal QR code.
create or replace function public.event_check_in_code(p_code text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; v_name text;
begin
  select * into r from public.registrations where checkin_code = p_code for update;
  perform app.require(r.id is not null, 'Code not recognised');
  perform app.require(app.can_manage_event(r.event_id), 'Not permitted to check in for this event');
  select display_name into v_name from public.persons where id = r.person_id;
  perform app.require(r.status in ('confirmed','attended','waitlisted'), 'This registration was cancelled');
  if r.status <> 'attended' then
    update public.registrations set status = 'attended', checked_in_at = now(), checkin_method = 'qr_personal',
           checked_in_by = app.current_account_id(), waitlist_position = null where id = r.id;
    perform app.on_attendance(r.id);
  end if;
  return jsonb_build_object('status','attended','name', v_name, 'registration_id', r.id);
end $$;

create or replace function public.event_set_attendance(p_registration uuid, p_status text, p_reason text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  select * into r from public.registrations where id = p_registration for update;
  perform app.require(r.id is not null and app.can_manage_event(r.event_id), 'Not permitted');
  perform app.require(p_status in ('attended','no_show','confirmed'), 'Invalid attendance status');
  update public.registrations
     set status = p_status, override_reason = p_reason,
         checked_in_at = case when p_status = 'attended' then coalesce(checked_in_at, now()) else null end,
         checkin_method = case when p_status = 'attended' then 'manual' else null end,
         checked_in_by = app.current_account_id(), waitlist_position = null
   where id = r.id;
  perform app.audit('registration.attendance_override', 'registration', r.id::text, jsonb_build_object('from', r.status, 'to', p_status, 'reason', p_reason));
  if p_status = 'attended' and r.status <> 'attended' then perform app.on_attendance(r.id); end if;
end $$;

create or replace function public.event_feedback(p_registration uuid, p_rating int, p_comment text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  select * into r from public.registrations where id = p_registration;
  perform app.require(r.person_id = app.current_person_id(), 'Not permitted');
  perform app.require(r.status = 'attended', 'Feedback opens once your attendance is recorded');
  perform app.require(p_rating between 1 and 5, 'Please choose a rating from 1 to 5');
  update public.registrations set feedback_rating = p_rating, feedback_comment = nullif(trim(p_comment), ''), feedback_at = now() where id = r.id;
end $$;

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

create or replace function public.event_complete(p_event uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare e record;
begin
  perform app.require(app.has_perm('events.manage'), 'Not permitted');
  select * into e from public.events where id = p_event and org_id = app.current_org_id() for update;
  perform app.require(e.status = 'published', 'Only published events can be completed');
  update public.registrations set status = 'no_show' where event_id = p_event and status = 'confirmed';
  update public.events set status = 'completed', checkin_open = false where id = p_event;
  perform app.emit(e.org_id, 'event.completed', 'event', p_event, '{}'::jsonb);
end $$;

create or replace function public.event_cancel(p_event uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare e record;
begin
  perform app.require(app.has_perm('events.manage'), 'Not permitted');
  select * into e from public.events where id = p_event and org_id = app.current_org_id() for update;
  perform app.require(e.status in ('draft','published'), 'This event cannot be cancelled');
  update public.events set status = 'cancelled', cancelled_reason = p_reason, checkin_open = false where id = p_event;
  if e.status = 'published' then
    perform app.emit(e.org_id, 'event.cancelled', 'event', p_event, jsonb_build_object('reason', p_reason));
  end if;
end $$;
