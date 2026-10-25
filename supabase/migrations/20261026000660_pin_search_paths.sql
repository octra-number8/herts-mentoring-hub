-- Pin search_path on helper functions (Supabase advisor 0011). Behaviour unchanged.
alter function app.allow_guarded() set search_path = public, pg_temp;
alter function app.clear_session_cache() set search_path = public, pg_temp;
alter function app.guard_active() set search_path = public, pg_temp;
alter function app.guard_case_kind() set search_path = public, pg_temp;
alter function app.guard_course_publication() set search_path = public, pg_temp;
alter function app.guard_document_publication() set search_path = public, pg_temp;
alter function app.is_current(starts date, ends date, at_date date) set search_path = public, pg_temp;
alter function app.leadership_role_keys() set search_path = public, pg_temp;
alter function app.require(p_ok boolean, p_message text) set search_path = public, pg_temp;
alter function app.stage_rank(p text) set search_path = public, pg_temp;
alter function app.task_completion() set search_path = public, pg_temp;
alter function app.touch_updated_at() set search_path = public, pg_temp;
