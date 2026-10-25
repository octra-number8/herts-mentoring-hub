-- Session check-in codes moved out of public.events: row-level security cannot hide
-- a single column, so any registrant could read the code and check in remotely.
-- Only people who can manage the event (organisers, presenting trainers) can read it.

create table public.event_checkin_secrets (
  event_id uuid primary key references public.events(id) on delete cascade,
  secret text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  rotated_at timestamptz not null default now()
);
insert into public.event_checkin_secrets(event_id, secret) select id, checkin_secret from public.events;
alter table public.events drop column checkin_secret;

alter table public.event_checkin_secrets enable row level security;
create policy read_checkin_secret on public.event_checkin_secrets for select to authenticated
  using (app.can_manage_event(event_id));
grant select on public.event_checkin_secrets to authenticated;

create or replace function app.create_checkin_secret() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.event_checkin_secrets(event_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger events_checkin_secret after insert on public.events for each row execute function app.create_checkin_secret();

create or replace function public.event_set_checkin(p_event uuid, p_open boolean, p_rotate boolean default false) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_secret text;
begin
  perform app.require(app.can_manage_event(p_event), 'Not permitted');
  update public.events set checkin_open = p_open where id = p_event;
  insert into public.event_checkin_secrets(event_id) values (p_event) on conflict do nothing;
  if p_rotate then
    update public.event_checkin_secrets set secret = encode(extensions.gen_random_bytes(16), 'hex'), rotated_at = now() where event_id = p_event;
  end if;
  select secret into v_secret from public.event_checkin_secrets where event_id = p_event;
  return v_secret;
end $$;

create or replace function public.event_check_in_session(p_event uuid, p_secret text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare e record; r record;
begin
  select * into e from public.events where id = p_event;
  perform app.require(e.id is not null and exists (select 1 from public.event_checkin_secrets s where s.event_id = p_event and s.secret = p_secret),
                      'This check-in code is not valid');
  perform app.require(e.checkin_open, 'Check-in is not open for this session');
  perform app.require(now() between e.starts_at - interval '2 hours' and e.ends_at + interval '2 hours', 'Check-in is only available around the session time');
  select * into r from public.registrations where event_id = p_event and person_id = app.current_person_id() for update;
  perform app.require(r.id is not null and r.status in ('confirmed','attended'), 'You do not have a confirmed place for this session');
  if r.status = 'attended' then return jsonb_build_object('status','attended','already',true); end if;
  update public.registrations set status = 'attended', checked_in_at = now(), checkin_method = 'qr_session' where id = r.id;
  perform app.on_attendance(r.id);
  return jsonb_build_object('status','attended');
end $$;

revoke execute on function public.event_set_checkin(uuid, boolean, boolean) from anon, public;
revoke execute on function public.event_check_in_session(uuid, text) from anon, public;
grant execute on function public.event_set_checkin(uuid, boolean, boolean) to authenticated;
grant execute on function public.event_check_in_session(uuid, text) to authenticated;
