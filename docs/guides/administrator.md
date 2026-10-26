# Administrator guide

For the Provincial Grand Mentor, Deputy and the technical administrator. Everything here is under **Administration** in the left-hand menu unless stated otherwise.

## People and accounts

Every current member held from an approved membership import can set up his own Learner account at `/join` with the email address held for him. The link is valid for 24 hours. Nothing is created for an address that is not held for exactly one current member with a current Lodge membership; the page gives the same answer either way, so it never reveals who is a member. Members who share an email address, or have none, are set up by invitation. Mentor and Provincial roles are only ever added by an administrator.

When an import (or the team) records a member as resigned, ceased, excluded or deceased, his account is suspended automatically and any open links are withdrawn; learning records are kept. If he is recorded as active again, the account is restored. A suspension made by hand is never lifted automatically.

The **Learning** tab on a Lodge shows, for each current member, whether he has signed up and which courses he has started and completed, never answers or reflections. It is visible to learning administrators, to APGMen for their allocated Lodges, and to the Lodge Mentor through the Lodge portal once it is activated.

Others can still be invited. A person record (name, Lodge, membership) exists separately from their Hub account, so someone can be in the Hub's membership records without being able to sign in.

**Invite someone**
1. Administration → Users → Invite.
2. Pick the person if they are already in the Hub (search by name or membership number), or enter their name and email.
3. Choose roles. Common choices:
   - *Learner*: the Academy only.
   - *Lodge Mentor* or *Personal Mentor*: the Academy plus mentor guidance. A Lodge Mentor does **not** get Lodge management access.
   - *Assistant Provincial Grand Mentor*, *Provincial team member*, *Learning and Development lead*: Provincial roles. Two-step verification is required at first sign-in.
4. Send. The invitation email contains a link valid for 7 days. Resend or withdraw it from the person's account page.

**Change someone's access**: open the account, then add or end a role (with dates), or grant a single extra permission with a reason and an end date. Grants are recorded in the audit log.

**Suspend or deactivate**: suspension blocks sign-in immediately and can be reversed. Deactivation ends all roles and activations. Accounts are never deleted, so history stays attributable.

**When an Assistant leaves**: use Allocations → the Assistant → End appointment. Roles and Lodge allocations end together, so nothing lingers, and you are offered a transfer of their open tasks and requests.

## Lodge allocations

Allocations shows each Assistant's Lodges and workload, plus any unallocated Lodges.
- **Allocate or reallocate**: choose the Assistant and whether their open work transfers with the Lodge.
- **Temporary cover**: allocate as cover with an end date. The Lodge shows both the Assistant and the cover.
- **As at a date**: see who held which Lodge on any past date. Past reports use these dates, so reallocating never rewrites history.

## Feature activation (the Lodge Mentor portal)

The Lodge Mentor portal is built but closed. Only activate it on the Provincial Grand Mentor's authority.
1. Administration → Features → Lodge Mentor portal → Add activation.
2. Choose *one Lodge Mentor*, *one Lodge* (its current Lodge Mentors) or *a role*.
3. Choose what they may do: view, raise requests, propose changes and update arrangements, export.
4. Record the reason.

They see only Lodges where they currently hold the Lodge Mentor appointment. Deactivate the same way; their Academy learning is unaffected. Other modules can be switched off entirely here, which removes them for everyone, leadership included.

## Configuration

- **Mentoring statuses**: the operational positions shown on Lodges (Routine Support, Contact Due and so on). Rename, reorder or retire them; history keeps the old values.
- **Support categories, document categories.**
- **Organisation settings**:
  - progression thresholds (months before a "conversation may be welcome" prompt);
  - whether allocated-Lodge emails need approval;
  - whether an author may approve their own course;
  - which imported fields Hermes or Adelphi may overwrite.
- **Retention**: each policy can be dry-run to see how many records it would affect. Policies stay off until the Province agrees the periods.

## Workflows

Administration → Workflows lets you combine a trigger (for example *New Initiate imported*), optional conditions, and actions from a fixed list (create a task, notify the allocated Assistant, send an approved email template, suggest a course).
- **Dry run** shows what would happen against the most recent matching event, without doing it.
- **Requires approval** holds each run until someone approves it.
- **Failed runs** can be retried; disable a workflow at any time.
- Confidential concerns never trigger workflows.

## Audit and system health

- **Audit log**: sign-ins, permission changes, record edits (content fields are recorded as "changed", never copied), exports, approvals and sensitive record views. Filter and export.
- **System health**: email delivery (queued, failed, retry), integration status, failures and the background job backlog. "Run background jobs now" processes everything immediately.

## Imports from Hermes or Adelphi

See the Provincial team guide, section *Imports*.
