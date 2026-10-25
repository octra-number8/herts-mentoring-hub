-- Feature and permission catalogue, default roles and organisation bootstrap.

insert into public.features(key, name, description, activation_mode) values
 ('management','Provincial management','Provincial mentoring management platform','all_permitted'),
 ('academy','Herts Mentoring Academy','Learning for all authorised learners','all_permitted'),
 ('academy_authoring','Academy authoring','Course authoring, review and publication','all_permitted'),
 ('communications','Communications centre','Email campaigns and templates','all_permitted'),
 ('imports','Membership imports','Hermes / Adelphi / Portal report imports','all_permitted'),
 ('workflows','Workflow automation','Controlled triggers and actions','all_permitted'),
 ('reports','Reporting and intelligence','Reports, exports and the quarterly report','all_permitted'),
 ('administration','Administration','Users, roles, configuration and audit','all_permitted'),
 ('lodge_portal','Lodge Mentor portal','Lodge-level management access for Lodge Mentors. Built and tested; requires activation per user or Lodge.','activation_required');

insert into public.permissions(key, feature_key, action, description) values
 ('hub.access_management','management','read','Use the Provincial management platform'),
 ('dashboard.view','management','read','View Provincial dashboards'),
 ('lodges.read','management','read','View ordinary Lodge information across the Province'),
 ('lodges.write.all','management','update','Edit any Lodge record'),
 ('lodges.write.allocated','management','update','Edit allocated Lodge records'),
 ('lodges.export','management','export','Export Lodge lists'),
 ('lodges.bulk','management','update','Bulk update Lodges'),
 ('allocations.manage','management','update','Allocate and reallocate Lodges'),
 ('members.read.basic','management','read','View basic membership information'),
 ('members.read.detail.all','management','read','View detailed mentoring records for all members'),
 ('members.read.detail.allocated','management','read','View detailed mentoring records in allocated Lodges'),
 ('members.write.all','management','update','Update any member mentoring record'),
 ('members.write.allocated','management','update','Update member mentoring records in allocated Lodges'),
 ('members.export','management','export','Export member lists'),
 ('activity.read.all','management','read','View contacts, visits and reviews for all Lodges'),
 ('activity.read.allocated','management','read','View contacts, visits and reviews for allocated Lodges'),
 ('activity.write.all','management','create','Record contacts, visits and reviews for any Lodge'),
 ('activity.write.allocated','management','create','Record contacts, visits and reviews for allocated Lodges'),
 ('notes.team','management','read','Read and write shared Provincial team notes'),
 ('notes.leadership','management','read','Read and write Provincial leadership notes'),
 ('notes.restricted','management','read','Write restricted case notes on cases you can access'),
 ('tasks.use','management','create','Use tasks'),
 ('tasks.manage_all','management','update','Manage all tasks'),
 ('cases.read.all','management','read','View all support requests'),
 ('cases.read.allocated','management','read','View support requests for allocated Lodges'),
 ('cases.write.all','management','update','Manage all support requests'),
 ('cases.write.allocated','management','update','Manage support requests for allocated Lodges'),
 ('cases.confidential.triage','management','approve','Triage confidential concerns'),
 ('cases.confidential.submit','management','create','Submit a confidential concern'),
 ('team.use','management','read','Use the team workspace'),
 ('team.announce','management','create','Post team announcements'),
 ('meetings.manage','management','update','Manage team meetings, agendas and minutes'),
 ('events.read.internal','management','read','See internal Provincial events'),
 ('events.manage','management','update','Create and manage events'),
 ('events.checkin','management','update','Check in attendees for events you present'),
 ('docs.read.internal','management','read','Read internal Provincial documents'),
 ('docs.read.leadership','management','read','Read leadership documents'),
 ('docs.manage','management','update','Manage the document library'),
 ('docs.approve','management','approve','Approve and publish documents and articles'),
 ('knowledge.manage','management','update','Manage knowledge base articles'),
 ('learning.records.read','management','read','View individual learning records'),
 ('academy.admin','management','update','Administer enrolments, certificates and recognition'),
 ('search.management','management','read','Search management records'),
 ('academy.learn','academy','read','Take Academy courses'),
 ('docs.read.mentors','academy','read','Read mentor guidance documents'),
 ('academy.author','academy_authoring','create','Author Academy courses'),
 ('academy.review','academy_authoring','approve','Review Academy courses'),
 ('academy.publish','academy_authoring','approve','Publish Academy courses and pathways'),
 ('comms.use','communications','read','Use the communications centre'),
 ('comms.send.allocated','communications','create','Send to contacts in allocated Lodges'),
 ('comms.send.province','communications','create','Prepare Province-wide communications'),
 ('comms.approve','communications','approve','Approve communications for sending'),
 ('comms.templates','communications','update','Manage email templates'),
 ('imports.run','imports','create','Upload and reconcile membership imports'),
 ('imports.approve','imports','approve','Approve and commit membership imports'),
 ('workflows.manage','workflows','update','Configure workflow automation'),
 ('reports.read','reports','read','Run reports'),
 ('reports.export','reports','export','Export reports'),
 ('reports.membership','reports','read','Membership analysis reports'),
 ('reports.quarterly','reports','read','Prepare the quarterly Provincial report'),
 ('reports.quarterly.approve','reports','approve','Approve and publish the quarterly report'),
 ('admin.users','administration','update','Manage user accounts and invitations'),
 ('admin.roles','administration','update','Assign roles and permissions'),
 ('admin.features','administration','update','Activate features'),
 ('admin.config','administration','update','Manage configuration'),
 ('admin.audit','administration','read','Read the audit log'),
 ('system.health','administration','read','View system health and integration status'),
 ('lodge_portal.read','lodge_portal','read','View own Lodge in the Lodge Mentor portal'),
 ('lodge_portal.create','lodge_portal','create','Submit support requests from the portal'),
 ('lodge_portal.update','lodge_portal','update','Propose Lodge changes and maintain arrangements'),
 ('lodge_portal.export','lodge_portal','export','Use Lodge-level reporting');

-- Default roles for an organisation.
create or replace function app.bootstrap_org(p_org uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_leadership text[];
begin
  insert into public.roles(org_id, key, name, description, is_management) values
   (p_org,'prov_grand_mentor','Provincial Grand Mentor','Full authorised Provincial management functionality',true),
   (p_org,'deputy_prov_grand_mentor','Deputy Provincial Grand Mentor','Identical functional authority to the Provincial Grand Mentor',true),
   (p_org,'apgmen','Assistant Provincial Grand Mentor','Province-wide Lodge view; manages allocated Lodges',true),
   (p_org,'prov_team','Provincial team member','Access to the modules their appointment needs',true),
   (p_org,'learning_lead','Learning and Development lead','Runs the Academy, reviews and publishes learning',true),
   (p_org,'ld_contributor','Learning and Development contributor','Authors Academy material without wider Provincial access',false),
   (p_org,'lodge_mentor','Lodge Mentor','Academy learner. Lodge portal available only when activated',false),
   (p_org,'personal_mentor','Personal Mentor','Academy learner with mentor resources',false),
   (p_org,'learner','Learner','Academy learner',false),
   (p_org,'tech_admin','Technical administrator','Technical maintenance without access to confidential mentoring records',true)
  on conflict (org_id, key) do nothing;

  -- Leadership: everything except the Lodge portal.
  insert into public.role_permissions(role_id, permission_key)
  select r.id, p.key from public.roles r cross join public.permissions p
   where r.org_id = p_org and r.key in ('prov_grand_mentor','deputy_prov_grand_mentor')
     and p.feature_key <> 'lodge_portal'
  on conflict do nothing;

  insert into public.role_permissions(role_id, permission_key)
  select r.id, k from public.roles r, unnest(case r.key
    when 'apgmen' then array['hub.access_management','dashboard.view','lodges.read','lodges.write.allocated','lodges.export',
      'members.read.basic','members.read.detail.allocated','members.write.allocated','activity.read.allocated','activity.write.allocated',
      'notes.team','tasks.use','cases.read.allocated','cases.write.allocated','cases.confidential.submit','team.use',
      'events.read.internal','events.manage','events.checkin','docs.read.internal','docs.read.mentors','search.management',
      'academy.learn','comms.use','comms.send.allocated','reports.read','reports.export']
    when 'prov_team' then array['hub.access_management','dashboard.view','lodges.read','members.read.basic','notes.team','tasks.use',
      'team.use','events.read.internal','docs.read.internal','docs.read.mentors','search.management','academy.learn','cases.confidential.submit']
    when 'learning_lead' then array['hub.access_management','dashboard.view','academy.learn','academy.author','academy.review','academy.publish',
      'academy.admin','learning.records.read','events.read.internal','events.manage','events.checkin','docs.read.internal','docs.read.mentors',
      'tasks.use','team.use','search.management','reports.read','reports.export','knowledge.manage']
    when 'ld_contributor' then array['academy.learn','academy.author','docs.read.mentors']
    when 'lodge_mentor' then array['academy.learn','docs.read.mentors','lodge_portal.read','lodge_portal.create','lodge_portal.update','lodge_portal.export']
    when 'personal_mentor' then array['academy.learn','docs.read.mentors']
    when 'learner' then array['academy.learn']
    when 'tech_admin' then array['hub.access_management','admin.users','admin.config','admin.audit','system.health']
    else array[]::text[] end) k
   where r.org_id = p_org
  on conflict do nothing;

  insert into public.feature_settings(org_id, feature_key)
  select p_org, key from public.features on conflict do nothing;

  insert into public.mentoring_statuses(org_id, key, label, description, position, is_closed) values
   (p_org,'routine','Routine Support','Normal contact rhythm; nothing specific needed',1,false),
   (p_org,'contact_due','Contact Due','A planned conversation is due',2,false),
   (p_org,'support_requested','Support Requested','The Lodge has asked for help',3,false),
   (p_org,'active_assistance','Active Assistance','The team is actively helping',4,false),
   (p_org,'awaiting_response','Awaiting Response','Waiting to hear back from the Lodge',5,false),
   (p_org,'review_required','Review Required','A mentoring review would be useful',6,false),
   (p_org,'unable_to_engage','Unable to Engage','Contact has not been possible so far',7,false),
   (p_org,'closed','Closed / No Current Action','No current action',8,true)
  on conflict do nothing;

  insert into public.support_categories(org_id, key, label, default_due_days, position) values
   (p_org,'general_advice','General mentoring advice',14,1),
   (p_org,'provincial_visit','Provincial Grand Mentor visit',28,2),
   (p_org,'personal_mentor_guidance','Personal Mentor guidance',14,3),
   (p_org,'training','Training',28,4),
   (p_org,'presentation','Presentation or speaker',42,5),
   (p_org,'newer_brother','Support for a newer Brother',7,6),
   (p_org,'solomon','Solomon assistance',14,7),
   (p_org,'royal_arch','Royal Arch guidance',21,8),
   (p_org,'other','Other mentoring assistance',14,9),
   (p_org,'confidential','Confidential concern',7,10)
  on conflict do nothing;

  insert into public.document_categories(org_id, key, name, default_classification, position) values
   (p_org,'lm_guidance','Lodge Mentor guidance','mentors',1),
   (p_org,'pm_guidance','Personal Mentor guidance','mentors',2),
   (p_org,'applicant','Applicant guidance','learning',3),
   (p_org,'degree','Degree companions','learning',4),
   (p_org,'training','Training','mentors',5),
   (p_org,'presentations','Presentations','internal',6),
   (p_org,'templates','Templates','internal',7),
   (p_org,'policies','Policies','internal',8),
   (p_org,'meeting_papers','Provincial meeting papers','internal',9),
   (p_org,'event_documents','Event documents','internal',10),
   (p_org,'working','Internal working documents','leadership',11)
  on conflict do nothing;

  insert into public.integrations(org_id, key, status, notes) values
   (p_org,'resend','simulated','Local SMTP capture in development. Production requires a verified sending domain and API key.'),
   (p_org,'octra_lodge','not_configured','Adapter defined. Real API not yet inspected; bookings link out to Octra-Lodge.'),
   (p_org,'membership_feed','not_configured','Manual imports work fully. No authorised automatic Hermes/Adelphi feed has been verified.'),
   (p_org,'calendar','active','ICS downloads and private subscription feeds served by the Hub.')
  on conflict do nothing;

  insert into public.retention_policies(org_id, entity_type, retain_months, action, basis, enabled) values
   (p_org,'persons_departed',12,'anonymise','A3 section 7 recommended baseline (pending data protection decision)',false),
   (p_org,'cases_closed',72,'anonymise','Pending Provincial data protection decision',false),
   (p_org,'import_rows',12,'delete','Raw import rows are only needed for reconciliation',false),
   (p_org,'email_outbox',24,'delete','Delivery history retention',false),
   (p_org,'notifications',12,'delete','In-app notification history',false)
  on conflict do nothing;
end $$;
