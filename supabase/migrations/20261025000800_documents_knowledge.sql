-- Controlled document library, versions, approvals, acknowledgements, knowledge base.

create table public.document_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  key text not null,
  name text not null,
  default_classification text not null default 'internal',
  position int not null default 0,
  unique (org_id, key)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  reference text not null,
  title text not null,
  summary text not null default '',
  category_id uuid references public.document_categories(id),
  owner_person_id uuid references public.persons(id),
  -- learning: Academy learners; mentors: Lodge/Personal Mentors and Provincial;
  -- internal: Provincial team; leadership: Provincial leadership only.
  classification text not null default 'internal' check (classification in ('learning','mentors','internal','leadership')),
  requires_ack boolean not null default false,
  renew_ack_on_revision boolean not null default true,
  review_on date,
  current_version_id uuid,
  tags text[] not null default '{}',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (to_tsvector('english', coalesce(reference,'') || ' ' || coalesce(title,'') || ' ' || coalesce(summary,''))) stored,
  unique (org_id, reference)
);
create index documents_search_idx on public.documents using gin(search);
create trigger documents_touch before update on public.documents for each row execute function app.touch_updated_at();

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  document_id uuid not null references public.documents(id) on delete cascade,
  version_no int not null,
  version_label text not null,          -- e.g. 'Issue 2, October 2026'
  status text not null default 'draft' check (status in ('draft','review','approved','published','superseded','archived')),
  storage_path text,
  file_name text,
  mime_type text,
  size_bytes bigint,
  change_summary text,
  created_by uuid references public.user_accounts(id) default app.current_account_id(),
  submitted_at timestamptz,
  approved_by uuid references public.user_accounts(id),
  approved_at timestamptz,
  published_by uuid references public.user_accounts(id),
  published_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  unique (document_id, version_no)
);
alter table public.documents add constraint documents_current_version_fk foreign key (current_version_id) references public.document_versions(id);
create unique index document_versions_one_published on public.document_versions(document_id) where status = 'published';

create table public.document_acknowledgements (
  document_version_id uuid not null references public.document_versions(id) on delete cascade,
  person_id uuid not null references public.persons(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (document_version_id, person_id)
);

create table public.knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id),
  slug text not null,
  title text not null,
  kind text not null check (kind in ('faq','guidance','example','good_practice','training')),
  body_markdown text not null,
  audience text not null default 'internal' check (audience in ('learning','mentors','internal')),
  status text not null default 'draft' check (status in ('draft','review','published','archived')),
  anonymisation_confirmed boolean not null default false,
  tags text[] not null default '{}',
  author_account_id uuid references public.user_accounts(id) default app.current_account_id(),
  approved_by uuid references public.user_accounts(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body_markdown,''))) stored,
  unique (org_id, slug),
  check (kind <> 'example' or status <> 'published' or anonymisation_confirmed)
);
create index knowledge_search_idx on public.knowledge_articles using gin(search);
create trigger knowledge_touch before update on public.knowledge_articles for each row execute function app.touch_updated_at();

create or replace function app.can_read_classification(p_class text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select case p_class
    when 'learning' then app.has_any_perm(array['academy.learn','docs.read.internal'])
    when 'mentors' then app.has_any_perm(array['docs.read.mentors','docs.read.internal'])
    when 'internal' then app.has_perm('docs.read.internal')
    when 'leadership' then app.has_perm('docs.read.leadership')
    else false end
$$;

create or replace function app.can_read_doc_version(p_version uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.document_versions v join public.documents d on d.id = v.document_id
     where v.id = p_version and d.org_id = app.current_org_id()
       and ((app.has_perm('docs.manage') and app.can_read_classification(d.classification))
            or (v.status in ('published','superseded') and d.archived_at is null and app.can_read_classification(d.classification))))
$$;

create trigger documents_audit after insert or update or delete on public.documents for each row execute function app.audit_row();
create trigger document_versions_audit after insert or update or delete on public.document_versions for each row execute function app.audit_row();
create trigger knowledge_audit after insert or update or delete on public.knowledge_articles for each row execute function app.audit_row();

alter table public.document_categories enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.document_acknowledgements enable row level security;
alter table public.knowledge_articles enable row level security;

create policy read_doc_categories on public.document_categories for select to authenticated using (org_id = app.current_org_id());
create policy write_doc_categories on public.document_categories for all to authenticated
  using (org_id = app.current_org_id() and app.has_perm('admin.config'))
  with check (org_id = app.current_org_id() and app.has_perm('admin.config'));

create policy read_documents on public.documents for select to authenticated
  using (org_id = app.current_org_id() and app.can_read_classification(classification)
         and (app.has_perm('docs.manage') or (current_version_id is not null and archived_at is null)));
create policy write_documents on public.documents for insert to authenticated
  with check (org_id = app.current_org_id() and app.has_perm('docs.manage') and app.can_read_classification(classification));
create policy update_documents on public.documents for update to authenticated
  using (org_id = app.current_org_id() and app.has_perm('docs.manage') and app.can_read_classification(classification))
  with check (org_id = app.current_org_id() and app.can_read_classification(classification));

create policy read_doc_versions on public.document_versions for select to authenticated using (app.can_read_doc_version(id));
create policy insert_doc_versions on public.document_versions for insert to authenticated
  with check (org_id = app.current_org_id() and status = 'draft' and app.has_perm('docs.manage'));
create policy update_doc_versions on public.document_versions for update to authenticated
  using (org_id = app.current_org_id() and status = 'draft' and app.has_perm('docs.manage'))
  with check (org_id = app.current_org_id() and status = 'draft');

create policy read_acks on public.document_acknowledgements for select to authenticated
  using (person_id = app.current_person_id() or app.has_perm('docs.manage'));
create policy insert_ack on public.document_acknowledgements for insert to authenticated
  with check (person_id = app.current_person_id() and app.can_read_doc_version(document_version_id));

create policy read_knowledge on public.knowledge_articles for select to authenticated
  using (org_id = app.current_org_id() and (
    app.has_perm('knowledge.manage')
    or (status = 'published' and app.can_read_classification(audience))));
create policy write_knowledge on public.knowledge_articles for insert to authenticated
  with check (org_id = app.current_org_id() and app.has_perm('knowledge.manage') and status in ('draft','review'));
create policy update_knowledge on public.knowledge_articles for update to authenticated
  using (org_id = app.current_org_id() and app.has_perm('knowledge.manage'))
  with check (org_id = app.current_org_id() and (status in ('draft','review','archived') or app.has_perm('docs.approve')));
