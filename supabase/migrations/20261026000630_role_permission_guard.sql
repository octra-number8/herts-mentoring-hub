-- Leadership roles' permissions cannot be changed from the application, and every
-- role permission change is audited at database level.
drop policy role_permissions_write on public.role_permissions;
create policy role_permissions_write on public.role_permissions for all to authenticated
  using (app.has_perm('admin.roles') and exists (select 1 from public.roles r where r.id = role_id and r.org_id = app.current_org_id()
         and r.key not in ('prov_grand_mentor','deputy_prov_grand_mentor')))
  with check (app.has_perm('admin.roles') and exists (select 1 from public.roles r where r.id = role_id and r.org_id = app.current_org_id()
         and r.key not in ('prov_grand_mentor','deputy_prov_grand_mentor')));

create or replace function app.audit_role_permission() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_role uuid := coalesce(new.role_id, old.role_id); v_perm text := coalesce(new.permission_key, old.permission_key);
begin
  perform app.audit('role_permission.' || lower(tg_op), 'role', v_role::text, jsonb_build_object('permission', v_perm),
                    (select org_id from public.roles where id = v_role));
  return coalesce(new, old);
end $$;
create trigger role_permissions_audit after insert or delete on public.role_permissions for each row execute function app.audit_role_permission();
create trigger role_permissions_cache after insert or update or delete on public.role_permissions for each statement execute function app.clear_session_cache();
