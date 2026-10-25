-- Herts Mentoring Academy: courses, versions, modules, lessons, assessments,
-- enrolments, progress, certificates, badges, pathways, development plans, external learning.

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  slug text not null,
  title text not null,
  summary text not null default '',
  audiences text[] not null default '{}',      -- lodge_mentor, personal_mentor, newer_brother, provincial_team, all
  masonic_stages text[] not null default '{}', -- entered_apprentice, fellow_craft, master_mason, established
  topics text[] not null default '{}',
  level text not null default 'optional' check (level in ('essential','recommended','optional')),
  principle text check (principle in ('prepare','guide','support','enlighten')),
  estimated_minutes int,
  image_path text,
  published_version_id uuid,
  is_placeholder_content boolean not null default false, -- true until real content approved
  owner_account_id uuid references public.user_accounts(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug)
);
create trigger courses_touch before update on public.courses for each row execute function app.touch_updated_at();

create table public.course_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  course_id uuid not null references public.courses(id) on delete cascade,
  version_no int not null,
  status text not null default 'draft' check (status in ('draft','review','approved','published','revised','archived')),
  title text not null,
  summary text not null default '',
  pass_mark int not null default 80 check (pass_mark between 0 and 100),
  completion_rule text not null default 'all_lessons' check (completion_rule in ('all_lessons','all_lessons_and_assessments')),
  certificate_enabled boolean not null default true,
  change_summary text,
  created_by uuid references public.user_accounts(id) default app.current_account_id(),
  submitted_by uuid references public.user_accounts(id),
  submitted_at timestamptz,
  reviewed_by uuid references public.user_accounts(id),
  approved_by uuid references public.user_accounts(id),
  approved_at timestamptz,
  published_by uuid references public.user_accounts(id),
  published_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  unique (course_id, version_no)
);
alter table public.courses add constraint courses_published_version_fk foreign key (published_version_id) references public.course_versions(id);
create unique index course_versions_one_published on public.course_versions(course_id) where status = 'published';

create table public.course_modules (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.course_versions(id) on delete cascade,
  position int not null,
  title text not null,
  summary text not null default ''
);
create index course_modules_version_idx on public.course_modules(version_id, position);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.course_modules(id) on delete cascade,
  position int not null,
  title text not null,
  kind text not null default 'content' check (kind in ('content','video','scenario','reflection','quiz','resource')),
  content jsonb not null default '{"blocks":[]}'::jsonb,
  estimated_minutes int,
  is_assessment boolean not null default false,
  pass_mark int check (pass_mark between 0 and 100),   -- overrides version pass mark
  max_attempts int check (max_attempts > 0),
  required boolean not null default true
);
create index lessons_module_idx on public.lessons(module_id, position);

-- Learner-visible question content.
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  position int not null,
  kind text not null default 'single' check (kind in ('single','multiple','true_false')),
  prompt text not null,
  options jsonb not null  -- [{ "id": "a", "text": "..." }]
);
-- Answer keys are never readable by learners; scoring happens in a definer function.
create table public.question_keys (
  question_id uuid primary key references public.questions(id) on delete cascade,
  correct jsonb not null,       -- ["a"]
  feedback_correct text,
  feedback_incorrect text,
  explanation text
);

create table public.pathways (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  slug text not null,
  title text not null,
  summary text not null default '',
  audience text not null,
  position int not null default 0,
  published boolean not null default false,
  unique (org_id, slug)
);
create table public.pathway_courses (
  pathway_id uuid not null references public.pathways(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  position int not null default 0,
  requirement text not null default 'essential' check (requirement in ('essential','optional')),
  primary key (pathway_id, course_id)
);

create table public.learner_profiles (
  person_id uuid primary key references public.persons(id) on delete cascade,
  org_id uuid not null references public.organisations(id),
  audiences text[] not null default '{}',
  masonic_stage text,
  interests text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table public.enrolments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  person_id uuid not null references public.persons(id) on delete cascade,
  course_id uuid not null references public.courses(id),
  course_version_id uuid not null references public.course_versions(id),
  status text not null default 'enrolled' check (status in ('enrolled','in_progress','completed','withdrawn')),
  source text not null default 'self' check (source in ('self','assigned','recommended','event','import')),
  assigned_by uuid references public.user_accounts(id),
  due_on date,
  enrolled_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  last_activity_at timestamptz,
  unique (person_id, course_version_id)
);
create index enrolments_person_idx on public.enrolments(person_id);
create index enrolments_course_idx on public.enrolments(course_id, status);

create table public.lesson_progress (
  enrolment_id uuid not null references public.enrolments(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id),
  completed_at timestamptz not null default now(),
  primary key (enrolment_id, lesson_id)
);

-- Reflections are private to the learner.
create table public.reflections (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id),
  enrolment_id uuid references public.enrolments(id) on delete cascade,
  response text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person_id, lesson_id)
);

create table public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  enrolment_id uuid not null references public.enrolments(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id),
  attempt_no int not null,
  score int not null,
  passed boolean not null,
  answers jsonb not null,
  submitted_at timestamptz not null default now(),
  unique (enrolment_id, lesson_id, attempt_no)
);

create sequence public.certificate_reference_seq;
create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  person_id uuid not null references public.persons(id),
  kind text not null check (kind in ('course','event','pathway','recognition')),
  reference text not null unique,
  title text not null,
  learner_name text not null,
  course_id uuid references public.courses(id),
  course_version_id uuid references public.course_versions(id),
  enrolment_id uuid references public.enrolments(id),
  event_id uuid,
  pathway_id uuid references public.pathways(id),
  completed_on date not null,
  issued_at timestamptz not null default now(),
  issued_by uuid references public.user_accounts(id),
  recognition_reason text,
  storage_path text,
  revoked_at timestamptz,
  revoked_reason text
);
create unique index certificates_one_per_enrolment on public.certificates(enrolment_id) where enrolment_id is not null and revoked_at is null;
create index certificates_person_idx on public.certificates(person_id);

create table public.badges (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  key text not null,
  name text not null,
  description text not null,
  criteria jsonb not null default '{}'::jsonb,   -- {"course_id": ...} or {"pathway_id": ...} or {"courses_completed": 3}
  active boolean not null default true,
  unique (org_id, key)
);
create table public.badge_awards (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  badge_id uuid not null references public.badges(id),
  person_id uuid not null references public.persons(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  source text not null default 'automatic',
  unique (badge_id, person_id)
);

create table public.development_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  person_id uuid not null unique references public.persons(id) on delete cascade,
  aspirations text,
  updated_at timestamptz not null default now()
);
create table public.development_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.development_plans(id) on delete cascade,
  title text not null,
  kind text not null default 'course' check (kind in ('course','event','external','reading','other')),
  course_id uuid references public.courses(id),
  target_on date,
  status text not null default 'planned' check (status in ('planned','in_progress','done','dropped')),
  notes text,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table public.external_learning (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  person_id uuid not null references public.persons(id) on delete cascade,
  provider text not null default 'solomon' check (provider in ('solomon','ugle','other_province','other')),
  title text not null,
  url text,
  completed_on date not null,
  self_declared boolean not null default true,
  evidence_path text,
  verified_by uuid references public.user_accounts(id),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

-- Links to Solomon resources mapped to Herts pathways (links only, no copied content).
create table public.solomon_resources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  title text not null,
  url text not null check (url ~ '^https://'),
  description text not null default '',
  pathway_id uuid references public.pathways(id) on delete set null,
  course_id uuid references public.courses(id) on delete set null,
  topics text[] not null default '{}',
  position int not null default 0
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function app.version_of_lesson(p_lesson uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select m.version_id from public.lessons l join public.course_modules m on m.id = l.module_id where l.id = p_lesson
$$;

-- A learner can read a version if it is published, or if they are enrolled in it
-- (so revised/archived versions stay readable for their own learning history).
create or replace function app.can_read_version(p_version uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.course_versions v
     where v.id = p_version and v.org_id = app.current_org_id()
       and (
         app.has_any_perm(array['academy.author','academy.review','academy.publish'])
         or (app.has_perm('academy.learn') and v.status = 'published')
         or (app.has_perm('academy.learn') and exists (
               select 1 from public.enrolments e where e.course_version_id = v.id and e.person_id = app.current_person_id()))
       ))
$$;

create or replace function app.can_edit_version(p_version uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.course_versions v
                  where v.id = p_version and v.org_id = app.current_org_id()
                    and v.status = 'draft' and app.has_perm('academy.author'))
$$;

create or replace function app.owns_enrolment(p_enrolment uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.enrolments e where e.id = p_enrolment and e.person_id = app.current_person_id())
$$;

create trigger courses_audit after insert or update or delete on public.courses for each row execute function app.audit_row();
create trigger course_versions_audit after insert or update or delete on public.course_versions for each row execute function app.audit_row();
create trigger enrolments_audit after insert or update or delete on public.enrolments for each row execute function app.audit_row();
create trigger certificates_audit after insert or update or delete on public.certificates for each row execute function app.audit_row();
create trigger external_learning_audit after insert or update or delete on public.external_learning for each row execute function app.audit_row();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.courses enable row level security;
alter table public.course_versions enable row level security;
alter table public.course_modules enable row level security;
alter table public.lessons enable row level security;
alter table public.questions enable row level security;
alter table public.question_keys enable row level security;
alter table public.pathways enable row level security;
alter table public.pathway_courses enable row level security;
alter table public.learner_profiles enable row level security;
alter table public.enrolments enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.reflections enable row level security;
alter table public.assessment_attempts enable row level security;
alter table public.certificates enable row level security;
alter table public.badges enable row level security;
alter table public.badge_awards enable row level security;
alter table public.development_plans enable row level security;
alter table public.development_plan_items enable row level security;
alter table public.external_learning enable row level security;
alter table public.solomon_resources enable row level security;

create policy read_courses on public.courses for select to authenticated
  using (org_id = app.current_org_id() and (
    app.has_any_perm(array['academy.author','academy.review','academy.publish','learning.records.read'])
    or (app.has_perm('academy.learn') and (published_version_id is not null
        or exists (select 1 from public.enrolments e where e.course_id = courses.id and e.person_id = app.current_person_id())))));
create policy write_courses on public.courses for insert to authenticated
  with check (org_id = app.current_org_id() and app.has_perm('academy.author'));
create policy update_courses on public.courses for update to authenticated
  using (org_id = app.current_org_id() and app.has_any_perm(array['academy.author','academy.publish']))
  with check (org_id = app.current_org_id());

create policy read_versions on public.course_versions for select to authenticated
  using (app.can_read_version(id) or (org_id = app.current_org_id() and app.has_perm('learning.records.read')));
create policy insert_versions on public.course_versions for insert to authenticated
  with check (org_id = app.current_org_id() and app.has_perm('academy.author') and status = 'draft');
create policy update_versions on public.course_versions for update to authenticated
  using (org_id = app.current_org_id() and status = 'draft' and app.has_perm('academy.author'))
  with check (org_id = app.current_org_id() and status in ('draft'));
-- Status transitions beyond draft editing happen in app.transition_course_version().

create policy read_modules on public.course_modules for select to authenticated using (app.can_read_version(version_id));
create policy write_modules on public.course_modules for all to authenticated
  using (app.can_edit_version(version_id)) with check (app.can_edit_version(version_id));

create policy read_lessons on public.lessons for select to authenticated
  using (exists (select 1 from public.course_modules m where m.id = module_id and app.can_read_version(m.version_id)));
create policy write_lessons on public.lessons for all to authenticated
  using (exists (select 1 from public.course_modules m where m.id = module_id and app.can_edit_version(m.version_id)))
  with check (exists (select 1 from public.course_modules m where m.id = module_id and app.can_edit_version(m.version_id)));

create policy read_questions on public.questions for select to authenticated
  using (app.can_read_version(app.version_of_lesson(lesson_id)));
create policy write_questions on public.questions for all to authenticated
  using (app.can_edit_version(app.version_of_lesson(lesson_id)))
  with check (app.can_edit_version(app.version_of_lesson(lesson_id)));

create policy read_keys on public.question_keys for select to authenticated
  using (app.has_any_perm(array['academy.author','academy.review','academy.publish'])
         and exists (select 1 from public.questions q where q.id = question_id and app.can_read_version(app.version_of_lesson(q.lesson_id))));
create policy write_keys on public.question_keys for all to authenticated
  using (exists (select 1 from public.questions q where q.id = question_id and app.can_edit_version(app.version_of_lesson(q.lesson_id))))
  with check (exists (select 1 from public.questions q where q.id = question_id and app.can_edit_version(app.version_of_lesson(q.lesson_id))));

create policy read_pathways on public.pathways for select to authenticated
  using (org_id = app.current_org_id() and ((published and app.has_perm('academy.learn')) or app.has_perm('academy.author')));
create policy write_pathways on public.pathways for all to authenticated
  using (org_id = app.current_org_id() and app.has_perm('academy.publish'))
  with check (org_id = app.current_org_id() and app.has_perm('academy.publish'));
create policy read_pathway_courses on public.pathway_courses for select to authenticated
  using (exists (select 1 from public.pathways p where p.id = pathway_id));
create policy write_pathway_courses on public.pathway_courses for all to authenticated
  using (app.has_perm('academy.publish')) with check (app.has_perm('academy.publish'));

create policy own_learner_profile on public.learner_profiles for all to authenticated
  using (person_id = app.current_person_id() or (org_id = app.current_org_id() and app.has_perm('learning.records.read')))
  with check (person_id = app.current_person_id() and org_id = app.current_org_id());

create policy read_enrolments on public.enrolments for select to authenticated
  using (person_id = app.current_person_id() or (org_id = app.current_org_id() and app.has_perm('learning.records.read')));
create policy self_enrol on public.enrolments for insert to authenticated
  with check (org_id = app.current_org_id() and (
    (person_id = app.current_person_id() and app.has_perm('academy.learn') and source in ('self','recommended')
       and exists (select 1 from public.course_versions v where v.id = course_version_id and v.course_id = enrolments.course_id and v.status = 'published'))
    or app.has_perm('academy.admin')));
create policy update_enrolments on public.enrolments for update to authenticated
  using (org_id = app.current_org_id() and app.has_perm('academy.admin'))
  with check (org_id = app.current_org_id());
-- Learners change their own enrolment state only through definer functions.

create policy read_progress on public.lesson_progress for select to authenticated
  using (app.owns_enrolment(enrolment_id) or app.has_perm('learning.records.read'));

create policy own_reflections on public.reflections for all to authenticated
  using (person_id = app.current_person_id())
  with check (person_id = app.current_person_id());

create policy read_attempts on public.assessment_attempts for select to authenticated
  using (app.owns_enrolment(enrolment_id) or app.has_perm('learning.records.read'));

create policy read_certificates on public.certificates for select to authenticated
  using (person_id = app.current_person_id() or (org_id = app.current_org_id() and app.has_perm('learning.records.read')));
create policy revoke_certificates on public.certificates for update to authenticated
  using (org_id = app.current_org_id() and app.has_perm('academy.admin'))
  with check (org_id = app.current_org_id());

create policy read_badges on public.badges for select to authenticated using (org_id = app.current_org_id());
create policy write_badges on public.badges for all to authenticated
  using (org_id = app.current_org_id() and app.has_perm('academy.publish'))
  with check (org_id = app.current_org_id() and app.has_perm('academy.publish'));
create policy read_badge_awards on public.badge_awards for select to authenticated
  using (person_id = app.current_person_id() or (org_id = app.current_org_id() and app.has_perm('learning.records.read')));

create policy own_plans on public.development_plans for all to authenticated
  using (person_id = app.current_person_id() or (org_id = app.current_org_id() and app.has_perm('learning.records.read')))
  with check (person_id = app.current_person_id() and org_id = app.current_org_id());
create policy own_plan_items on public.development_plan_items for all to authenticated
  using (exists (select 1 from public.development_plans p where p.id = plan_id and (p.person_id = app.current_person_id() or app.has_perm('learning.records.read'))))
  with check (exists (select 1 from public.development_plans p where p.id = plan_id and p.person_id = app.current_person_id()));

create policy read_external on public.external_learning for select to authenticated
  using (person_id = app.current_person_id() or (org_id = app.current_org_id() and app.has_perm('learning.records.read')));
create policy insert_external on public.external_learning for insert to authenticated
  with check (person_id = app.current_person_id() and org_id = app.current_org_id() and self_declared and verified_by is null);
create policy update_external on public.external_learning for update to authenticated
  using ((person_id = app.current_person_id() and verified_by is null) or (org_id = app.current_org_id() and app.has_perm('academy.admin')))
  with check (org_id = app.current_org_id() and (
    (person_id = app.current_person_id() and verified_by is null and self_declared) or app.has_perm('academy.admin')));
create policy delete_external on public.external_learning for delete to authenticated
  using (person_id = app.current_person_id() and verified_by is null);

create policy read_solomon on public.solomon_resources for select to authenticated
  using (org_id = app.current_org_id() and app.has_any_perm(array['academy.learn','academy.author']));
create policy write_solomon on public.solomon_resources for all to authenticated
  using (org_id = app.current_org_id() and app.has_perm('academy.publish'))
  with check (org_id = app.current_org_id() and app.has_perm('academy.publish'));
