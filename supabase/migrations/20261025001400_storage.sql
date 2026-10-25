-- Private storage buckets. Files are served through short-lived signed URLs
-- issued after a permission check; these policies also block direct access.

insert into storage.buckets(id, name, public, file_size_limit) values
 ('documents','documents',false, 52428800),
 ('academy-media','academy-media',false, 104857600),
 ('certificates','certificates',false, 5242880),
 ('imports','imports',false, 20971520),
 ('evidence','evidence',false, 10485760)
on conflict (id) do nothing;

create policy documents_read on storage.objects for select to authenticated
  using (bucket_id = 'documents' and exists (
    select 1 from public.document_versions v where v.storage_path = name and app.can_read_doc_version(v.id)));
create policy documents_write on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and app.has_perm('docs.manage')
              and (storage.foldername(name))[1] = app.current_org_id()::text);

create policy academy_media_read on storage.objects for select to authenticated
  using (bucket_id = 'academy-media' and (storage.foldername(name))[1] = app.current_org_id()::text
         and app.has_any_perm(array['academy.learn','academy.author']));
create policy academy_media_write on storage.objects for insert to authenticated
  with check (bucket_id = 'academy-media' and app.has_perm('academy.author')
              and (storage.foldername(name))[1] = app.current_org_id()::text);

create policy certificates_read on storage.objects for select to authenticated
  using (bucket_id = 'certificates' and exists (
    select 1 from public.certificates c where c.storage_path = name
       and (c.person_id = app.current_person_id() or (c.org_id = app.current_org_id() and app.has_perm('learning.records.read')))));

create policy imports_rw on storage.objects for select to authenticated
  using (bucket_id = 'imports' and app.has_perm('imports.run') and (storage.foldername(name))[1] = app.current_org_id()::text);
create policy imports_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'imports' and app.has_perm('imports.run') and (storage.foldername(name))[1] = app.current_org_id()::text);

create policy evidence_own_read on storage.objects for select to authenticated
  using (bucket_id = 'evidence' and ((storage.foldername(name))[1] = app.current_person_id()::text
         or exists (select 1 from public.external_learning x where x.evidence_path = name and x.org_id = app.current_org_id() and app.has_perm('learning.records.read'))));
create policy evidence_own_write on storage.objects for insert to authenticated
  with check (bucket_id = 'evidence' and (storage.foldername(name))[1] = app.current_person_id()::text and app.has_perm('academy.learn'));
