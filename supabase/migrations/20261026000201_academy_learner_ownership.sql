-- Learner-owned records: administrators with learning.records.read may read
-- development plans and learner profiles, but only the learner may change them.
-- The original "for all" policies grant read and write together, so these
-- restrictive policies narrow update and delete to the owner.

create policy plans_owner_update on public.development_plans as restrictive for update to authenticated
  using (person_id = app.current_person_id());
create policy plans_owner_delete on public.development_plans as restrictive for delete to authenticated
  using (person_id = app.current_person_id());

create policy plan_items_owner_update on public.development_plan_items as restrictive for update to authenticated
  using (exists (select 1 from public.development_plans p where p.id = plan_id and p.person_id = app.current_person_id()));
create policy plan_items_owner_delete on public.development_plan_items as restrictive for delete to authenticated
  using (exists (select 1 from public.development_plans p where p.id = plan_id and p.person_id = app.current_person_id()));

create policy learner_profiles_owner_update on public.learner_profiles as restrictive for update to authenticated
  using (person_id = app.current_person_id());
create policy learner_profiles_owner_delete on public.learner_profiles as restrictive for delete to authenticated
  using (person_id = app.current_person_id());
