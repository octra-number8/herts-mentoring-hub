-- Explicit table privileges. Row access is still decided by RLS on every table.
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public grant usage, select on sequences to authenticated, service_role;
-- Append-only audit log: no updates or deletes from the API.
revoke update, delete on public.audit_events from authenticated;
