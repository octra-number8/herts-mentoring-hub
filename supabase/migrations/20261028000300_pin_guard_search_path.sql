-- Supabase security advisor (live site, 27 October 2026): pin the search path of
-- the course version status guard, as every other function already is.
alter function app.guard_version_status() set search_path = public, pg_temp;
