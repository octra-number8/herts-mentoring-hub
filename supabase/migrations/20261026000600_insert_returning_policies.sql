-- INSERT ... RETURNING checks the new row against the SELECT policy. Policies that
-- look the row up again through a definer function (can_read_task(id) etc.) cannot
-- see a row inserted by the same statement, so the insert is refused. Add direct
-- column conditions that express the same rules for the inserting user. The rules
-- are unchanged; only how the new row is recognised.

drop policy read_tasks on public.tasks;
create policy read_tasks on public.tasks for select to authenticated
  using (org_id = app.current_org_id() and (
    ((owner_account_id = app.current_account_id() or created_by = app.current_account_id()) and app.has_perm('tasks.use'))
    or app.can_read_task(id)));

drop policy read_notes on public.notes;
create policy read_notes on public.notes for select to authenticated
  using (org_id = app.current_org_id() and (
    (author_account_id = app.current_account_id() and app.has_perm('hub.access_management'))
    or app.can_read_note(id)));

drop policy read_meetings on public.meetings;
create policy read_meetings on public.meetings for select to authenticated
  using ((org_id = app.current_org_id() and app.has_perm('meetings.manage')
          and (kind <> 'leadership' or app.has_perm('notes.leadership')))
         or app.can_read_meeting(id));

drop policy read_cases on public.cases;
create policy read_cases on public.cases for select to authenticated
  using (org_id = app.current_org_id() and (
    requester_account_id = app.current_account_id()
    or (app.has_perm('hub.access_management') and (
          owner_account_id = app.current_account_id()
          or (kind = 'confidential' and app.has_perm('cases.confidential.triage'))
          or (kind = 'request' and app.has_perm('cases.read.all'))
          or (kind = 'request' and lodge_id is not null and app.can_on_lodge('cases.read', lodge_id))))
    or app.can_read_case(id)));

drop policy read_events on public.events;
create policy read_events on public.events for select to authenticated
  using ((org_id = app.current_org_id() and app.has_perm('events.manage')) or app.can_see_event(id));

drop policy read_versions on public.course_versions;
create policy read_versions on public.course_versions for select to authenticated
  using ((org_id = app.current_org_id() and app.has_any_perm(array['academy.author','academy.review','academy.publish','learning.records.read']))
         or app.can_read_version(id));

drop policy read_doc_versions on public.document_versions;
create policy read_doc_versions on public.document_versions for select to authenticated
  using ((org_id = app.current_org_id() and app.has_perm('docs.manage')
          and app.can_read_classification((select d.classification from public.documents d where d.id = document_id)))
         or app.can_read_doc_version(id));
