-- A version with no recorded author (e.g. imported by the system) must not block
-- approval: the self-approval check now treats an unknown author as someone else.

-- Draft -> Review -> Approved -> Published -> Revised -> Archived
create or replace function public.academy_transition_version(p_version uuid, p_to text, p_note text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v record; v_lessons int; v_self boolean;
begin
  select * into v from public.course_versions where id = p_version and org_id = app.current_org_id() for update;
  perform app.require(v.id is not null, 'Version not found');
  v_self := coalesce(v.created_by = app.current_account_id(), false);
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

