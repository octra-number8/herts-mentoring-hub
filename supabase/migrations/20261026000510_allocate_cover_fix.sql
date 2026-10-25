-- Fix: allocate_lodge failed for temporary cover ("record v_prev is not assigned yet")
-- because the previous-allocation record was only assigned for primary allocations.
-- Same function otherwise, unchanged.

create or replace function public.allocate_lodge(p_lodge uuid, p_person uuid, p_kind text default 'primary',
  p_starts date default current_date, p_ends date default null, p_reason text default null, p_transfer_open_work boolean default true)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid; v_prev record; v_id uuid; v_new_account uuid; v_area uuid; v_tasks int := 0; v_cases int := 0;
begin
  perform app.require(app.has_perm('allocations.manage'), 'Not permitted to manage allocations');
  select org_id into v_org from public.lodges where id = p_lodge and org_id = app.current_org_id();
  perform app.require(v_org is not null, 'Lodge not found');
  perform app.require(p_kind in ('primary','cover'), 'Invalid allocation type');
  v_new_account := app.account_of(p_person);
  perform app.require(v_new_account is not null and app.account_holds(v_new_account, 'lodges.write.allocated'),
                      'Lodges can only be allocated to someone who currently holds an Assistant Provincial Grand Mentor role');
  perform app.require(p_kind = 'primary' or p_ends is not null, 'Temporary cover needs an end date');
  select area_id into v_area from public.provincial_appointments
   where person_id = p_person and office = 'apgmen' and app.is_current(starts_on, ends_on) limit 1;

  -- Assign the record for cover too, so later references to v_prev are null rather than an error.
  select * into v_prev from public.lodge_allocations where false;
  if p_kind = 'primary' then
    select * into v_prev from public.lodge_allocations where lodge_id = p_lodge and kind = 'primary' and ends_on is null for update;
    if v_prev.id is not null then
      perform app.require(v_prev.person_id <> p_person, 'This Lodge is already allocated to that person');
      update public.lodge_allocations set ends_on = greatest(p_starts - 1, v_prev.starts_on - 1) where id = v_prev.id;
    end if;
  end if;

  insert into public.lodge_allocations(org_id, lodge_id, person_id, area_id, kind, starts_on, ends_on, reason, recorded_by)
  values (v_org, p_lodge, p_person, v_area, p_kind, p_starts, p_ends, p_reason, app.current_account_id())
  returning id into v_id;

  if p_kind = 'primary' and p_transfer_open_work and v_prev.id is not null then
    update public.tasks set owner_account_id = v_new_account
     where lodge_id = p_lodge and status in ('open','in_progress','waiting')
       and owner_account_id = (select id from public.user_accounts where person_id = v_prev.person_id);
    get diagnostics v_tasks = row_count;
    update public.cases set owner_account_id = v_new_account
     where lodge_id = p_lodge and kind = 'request' and status not in ('closed','resolved')
       and owner_account_id = (select id from public.user_accounts where person_id = v_prev.person_id);
    get diagnostics v_cases = row_count;
  end if;

  perform app.notify(v_new_account, 'allocation', 'Lodge allocated to you',
    (select name || ' No. ' || number from public.lodges where id = p_lodge) ||
      case when p_kind = 'cover' then ' (temporary cover until ' || to_char(p_ends, 'DD Mon YYYY') || ')' else '' end,
    '/lodges/' || p_lodge, false, 'allocation:' || v_id);
  perform app.emit(v_org, 'lodge.reallocated', 'lodge', p_lodge,
    jsonb_build_object('allocation_id', v_id, 'kind', p_kind, 'to_person', p_person, 'from_person', v_prev.person_id,
                       'tasks_transferred', v_tasks, 'cases_transferred', v_cases));
  return v_id;
end $$;

revoke execute on function public.allocate_lodge(uuid, uuid, text, date, date, text, boolean) from anon, public;
grant execute on function public.allocate_lodge(uuid, uuid, text, date, date, text, boolean) to authenticated;
