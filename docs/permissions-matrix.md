# Permissions matrix

Generated from the database catalogue on 2026-10-25 by `scripts/gen-permission-docs.ts`. Do not edit by hand.

Effective access = role (or individual grant) **and** MFA satisfied (management roles) **and** feature enabled **and** feature available (or activated). RLS applies the same rule to every row.

## Roles

| Role | MFA required | Purpose |
|---|---|---|
| Provincial Grand Mentor | Yes | Full authorised Provincial management functionality |
| Deputy Provincial Grand Mentor | Yes | Identical functional authority to the Provincial Grand Mentor |
| Assistant Provincial Grand Mentor | Yes | Province-wide Lodge view; manages allocated Lodges |
| Provincial team member | Yes | Access to the modules their appointment needs |
| Learning and Development lead | Yes | Runs the Academy, reviews and publishes learning |
| Learning and Development contributor | No | Authors Academy material without wider Provincial access |
| Technical administrator | Yes | Technical maintenance without access to confidential mentoring records |
| Lodge Mentor | No | Academy learner. Lodge portal available only when activated |
| Personal Mentor | No | Academy learner with mentor resources |
| Learner | No | Academy learner |

## Provincial management (`management`)

Provincial mentoring management platform

| Permission | ProvGMen | Deputy | APGMen | Team | L&D lead | L&D author | Tech admin | Lodge Mentor | Personal Mentor | Learner |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `academy.admin`<br><small>Administer enrolments, certificates and recognition</small> | ● | ● |  |  | ● |  |  |  |  |  |
| `activity.read.all`<br><small>View contacts, visits and reviews for all Lodges</small> | ● | ● |  |  |  |  |  |  |  |  |
| `activity.read.allocated`<br><small>View contacts, visits and reviews for allocated Lodges</small> | ● | ● | ● |  |  |  |  |  |  |  |
| `activity.write.all`<br><small>Record contacts, visits and reviews for any Lodge</small> | ● | ● |  |  |  |  |  |  |  |  |
| `activity.write.allocated`<br><small>Record contacts, visits and reviews for allocated Lodges</small> | ● | ● | ● |  |  |  |  |  |  |  |
| `allocations.manage`<br><small>Allocate and reallocate Lodges</small> | ● | ● |  |  |  |  |  |  |  |  |
| `cases.confidential.submit`<br><small>Submit a confidential concern</small> | ● | ● | ● | ● |  |  |  |  |  |  |
| `cases.confidential.triage`<br><small>Triage confidential concerns</small> | ● | ● |  |  |  |  |  |  |  |  |
| `cases.read.all`<br><small>View all support requests</small> | ● | ● |  |  |  |  |  |  |  |  |
| `cases.read.allocated`<br><small>View support requests for allocated Lodges</small> | ● | ● | ● |  |  |  |  |  |  |  |
| `cases.write.all`<br><small>Manage all support requests</small> | ● | ● |  |  |  |  |  |  |  |  |
| `cases.write.allocated`<br><small>Manage support requests for allocated Lodges</small> | ● | ● | ● |  |  |  |  |  |  |  |
| `dashboard.view`<br><small>View Provincial dashboards</small> | ● | ● | ● | ● | ● |  |  |  |  |  |
| `docs.approve`<br><small>Approve and publish documents and articles</small> | ● | ● |  |  |  |  |  |  |  |  |
| `docs.manage`<br><small>Manage the document library</small> | ● | ● |  |  |  |  |  |  |  |  |
| `docs.read.internal`<br><small>Read internal Provincial documents</small> | ● | ● | ● | ● | ● |  |  |  |  |  |
| `docs.read.leadership`<br><small>Read leadership documents</small> | ● | ● |  |  |  |  |  |  |  |  |
| `events.checkin`<br><small>Check in attendees for events you present</small> | ● | ● | ● |  | ● |  |  |  |  |  |
| `events.manage`<br><small>Create and manage events</small> | ● | ● | ● |  | ● |  |  |  |  |  |
| `events.read.internal`<br><small>See internal Provincial events</small> | ● | ● | ● | ● | ● |  |  |  |  |  |
| `hub.access_management`<br><small>Use the Provincial management platform</small> | ● | ● | ● | ● | ● |  | ● |  |  |  |
| `knowledge.manage`<br><small>Manage knowledge base articles</small> | ● | ● |  |  | ● |  |  |  |  |  |
| `learning.records.read`<br><small>View individual learning records</small> | ● | ● |  |  | ● |  |  |  |  |  |
| `lodges.bulk`<br><small>Bulk update Lodges</small> | ● | ● |  |  |  |  |  |  |  |  |
| `lodges.export`<br><small>Export Lodge lists</small> | ● | ● | ● |  |  |  |  |  |  |  |
| `lodges.read`<br><small>View ordinary Lodge information across the Province</small> | ● | ● | ● | ● |  |  |  |  |  |  |
| `lodges.write.all`<br><small>Edit any Lodge record</small> | ● | ● |  |  |  |  |  |  |  |  |
| `lodges.write.allocated`<br><small>Edit allocated Lodge records</small> | ● | ● | ● |  |  |  |  |  |  |  |
| `meetings.manage`<br><small>Manage team meetings, agendas and minutes</small> | ● | ● |  |  |  |  |  |  |  |  |
| `members.export`<br><small>Export member lists</small> | ● | ● |  |  |  |  |  |  |  |  |
| `members.read.basic`<br><small>View basic membership information</small> | ● | ● | ● | ● |  |  |  |  |  |  |
| `members.read.detail.all`<br><small>View detailed mentoring records for all members</small> | ● | ● |  |  |  |  |  |  |  |  |
| `members.read.detail.allocated`<br><small>View detailed mentoring records in allocated Lodges</small> | ● | ● | ● |  |  |  |  |  |  |  |
| `members.write.all`<br><small>Update any member mentoring record</small> | ● | ● |  |  |  |  |  |  |  |  |
| `members.write.allocated`<br><small>Update member mentoring records in allocated Lodges</small> | ● | ● | ● |  |  |  |  |  |  |  |
| `notes.leadership`<br><small>Read and write Provincial leadership notes</small> | ● | ● |  |  |  |  |  |  |  |  |
| `notes.restricted`<br><small>Write restricted case notes on cases you can access</small> | ● | ● |  |  |  |  |  |  |  |  |
| `notes.team`<br><small>Read and write shared Provincial team notes</small> | ● | ● | ● | ● |  |  |  |  |  |  |
| `search.management`<br><small>Search management records</small> | ● | ● | ● | ● | ● |  |  |  |  |  |
| `tasks.manage_all`<br><small>Manage all tasks</small> | ● | ● |  |  |  |  |  |  |  |  |
| `tasks.use`<br><small>Use tasks</small> | ● | ● | ● | ● | ● |  |  |  |  |  |
| `team.announce`<br><small>Post team announcements</small> | ● | ● |  |  |  |  |  |  |  |  |
| `team.use`<br><small>Use the team workspace</small> | ● | ● | ● | ● | ● |  |  |  |  |  |

## Herts Mentoring Academy (`academy`)

Learning for all authorised learners

| Permission | ProvGMen | Deputy | APGMen | Team | L&D lead | L&D author | Tech admin | Lodge Mentor | Personal Mentor | Learner |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `academy.learn`<br><small>Take Academy courses</small> | ● | ● | ● | ● | ● | ● |  | ● | ● | ● |
| `docs.read.mentors`<br><small>Read mentor guidance documents</small> | ● | ● | ● | ● | ● | ● |  | ● | ● |  |

## Academy authoring (`academy_authoring`)

Course authoring, review and publication

| Permission | ProvGMen | Deputy | APGMen | Team | L&D lead | L&D author | Tech admin | Lodge Mentor | Personal Mentor | Learner |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `academy.author`<br><small>Author Academy courses</small> | ● | ● |  |  | ● | ● |  |  |  |  |
| `academy.publish`<br><small>Publish Academy courses and pathways</small> | ● | ● |  |  | ● |  |  |  |  |  |
| `academy.review`<br><small>Review Academy courses</small> | ● | ● |  |  | ● |  |  |  |  |  |

## Communications centre (`communications`)

Email campaigns and templates

| Permission | ProvGMen | Deputy | APGMen | Team | L&D lead | L&D author | Tech admin | Lodge Mentor | Personal Mentor | Learner |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `comms.approve`<br><small>Approve communications for sending</small> | ● | ● |  |  |  |  |  |  |  |  |
| `comms.send.allocated`<br><small>Send to contacts in allocated Lodges</small> | ● | ● | ● |  |  |  |  |  |  |  |
| `comms.send.province`<br><small>Prepare Province-wide communications</small> | ● | ● |  |  |  |  |  |  |  |  |
| `comms.templates`<br><small>Manage email templates</small> | ● | ● |  |  |  |  |  |  |  |  |
| `comms.use`<br><small>Use the communications centre</small> | ● | ● | ● |  |  |  |  |  |  |  |

## Membership imports (`imports`)

Hermes / Adelphi / Portal report imports

| Permission | ProvGMen | Deputy | APGMen | Team | L&D lead | L&D author | Tech admin | Lodge Mentor | Personal Mentor | Learner |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `imports.approve`<br><small>Approve and commit membership imports</small> | ● | ● |  |  |  |  |  |  |  |  |
| `imports.run`<br><small>Upload and reconcile membership imports</small> | ● | ● |  |  |  |  |  |  |  |  |

## Workflow automation (`workflows`)

Controlled triggers and actions

| Permission | ProvGMen | Deputy | APGMen | Team | L&D lead | L&D author | Tech admin | Lodge Mentor | Personal Mentor | Learner |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `workflows.manage`<br><small>Configure workflow automation</small> | ● | ● |  |  |  |  |  |  |  |  |

## Reporting and intelligence (`reports`)

Reports, exports and the quarterly report

| Permission | ProvGMen | Deputy | APGMen | Team | L&D lead | L&D author | Tech admin | Lodge Mentor | Personal Mentor | Learner |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `reports.export`<br><small>Export reports</small> | ● | ● | ● |  | ● |  |  |  |  |  |
| `reports.membership`<br><small>Membership analysis reports</small> | ● | ● |  |  |  |  |  |  |  |  |
| `reports.quarterly`<br><small>Prepare the quarterly Provincial report</small> | ● | ● |  |  |  |  |  |  |  |  |
| `reports.quarterly.approve`<br><small>Approve and publish the quarterly report</small> | ● | ● |  |  |  |  |  |  |  |  |
| `reports.read`<br><small>Run reports</small> | ● | ● | ● |  | ● |  |  |  |  |  |

## Administration (`administration`)

Users, roles, configuration and audit

| Permission | ProvGMen | Deputy | APGMen | Team | L&D lead | L&D author | Tech admin | Lodge Mentor | Personal Mentor | Learner |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `admin.audit`<br><small>Read the audit log</small> | ● | ● |  |  |  |  | ● |  |  |  |
| `admin.config`<br><small>Manage configuration</small> | ● | ● |  |  |  |  | ● |  |  |  |
| `admin.features`<br><small>Activate features</small> | ● | ● |  |  |  |  |  |  |  |  |
| `admin.roles`<br><small>Assign roles and permissions</small> | ● | ● |  |  |  |  |  |  |  |  |
| `admin.users`<br><small>Manage user accounts and invitations</small> | ● | ● |  |  |  |  | ● |  |  |  |
| `system.health`<br><small>View system health and integration status</small> | ● | ● |  |  |  |  | ● |  |  |  |

## Lodge Mentor portal (`lodge_portal`)

Lodge-level management access for Lodge Mentors. Built and tested; requires activation per user or Lodge. **Requires activation per account, Lodge or role.**

| Permission | ProvGMen | Deputy | APGMen | Team | L&D lead | L&D author | Tech admin | Lodge Mentor | Personal Mentor | Learner |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `lodge_portal.create`<br><small>Submit support requests from the portal</small> |  |  |  |  |  |  |  | ● |  |  |
| `lodge_portal.export`<br><small>Use Lodge-level reporting</small> |  |  |  |  |  |  |  | ● |  |  |
| `lodge_portal.read`<br><small>View own Lodge in the Lodge Mentor portal</small> |  |  |  |  |  |  |  | ● |  |  |
| `lodge_portal.update`<br><small>Propose Lodge changes and maintain arrangements</small> |  |  |  |  |  |  |  | ● |  |  |
