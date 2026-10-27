/**
 * Privacy Notice for the Hub and the Herts Mentoring Academy.
 *
 * Written from what the application actually does (October 2026 review). Facts
 * only the Province can settle are marked [OWNER TO CONFIRM: ...]; while any
 * remain, /privacy shows the notice as a draft and the security check reports
 * it. See docs/privacy/owner-checklist.md. British English, no em-dashes (A3).
 */
export const PRIVACY_NOTICE_UPDATED = "27 October 2026";
export const PRIVACY_NOTICE_VERSION = "Draft 0.1";

export const PLACEHOLDER = "[OWNER TO CONFIRM";

export const PRIVACY_NOTICE_MARKDOWN = `
This notice explains how the Hertfordshire Mentoring Hub and the Herts Mentoring Academy (together "the Hub") use information about you, who can see it, how long it is kept and the rights you have. It covers members who use the Academy, Brethren whose membership and mentoring are recorded in the Hub, Lodge Mentors, Personal Mentors, the Provincial Mentoring Team and anyone who books a mentoring event.

## Who is responsible for your information

The Hub is run for mentoring in the Province of Hertfordshire. The organisation responsible for your information (the "controller") is **[OWNER TO CONFIRM: the legal name of the controller, for example the Provincial Grand Lodge of Hertfordshire, and whether any processing is shared with the United Grand Lodge of England or with individual Lodges]**.

Contact for anything in this notice:

- Data protection contact: **[OWNER TO CONFIRM: name or role, and email address, for data protection questions and requests]**
- Post: Provincial Office, Fleet House, 10 Parkway, St Albans AL3 6PA
- Mentoring team: mentor@hertfordshirefreemasons.org.uk, 01727 833061
- Data Protection Officer: **[OWNER TO CONFIRM: whether a Data Protection Officer is appointed, and their contact details if so]**

## What information the Hub holds

| Kind of information | Examples |
|---|---|
| Identity and contact details | Name, Masonic or courtesy title, email address, telephone number, membership number |
| Membership | Your Lodge or Lodges, dates you joined, were Initiated, Passed and Raised, and whether you are a current member |
| Mentoring | Your mentoring stage, whether a Personal Mentor is allocated, review dates, and records of contact and visits made by the mentoring team |
| Notes and support | Notes written by the mentoring team, requests for support and the actions taken. A confidential concern raised by or about you is held separately (see "Sensitive information") |
| Learning | Academy courses you enrol in, progress, assessment answers and results, reflections, development plans, certificates, and learning you record yourself with any evidence you upload |
| Events | Bookings, waiting lists, attendance and check-in, and feedback you give |
| Email and notifications | Your email preferences, the messages sent to you and whether they were delivered or bounced |
| Your account | Sign-in email, an encrypted password (we never see it), two-step verification set-up where your role needs it, roles, when you last signed in, and a record of significant actions you take |
| Technical information | Sign-in cookies and the security logs kept by our hosting providers, which include IP addresses |

The Hub keeps only what mentoring and learning need. It does not hold your date of birth, address, occupation or financial details.

## Where the information comes from

- **From you**: when you set up an account, take a course, book an event, record learning or contact the mentoring team.
- **From membership records**: the Provincial Mentoring Team imports membership details (name, contact details, membership number, Lodge and degree dates) from reports taken from the United Grand Lodge of England's membership systems (Hermes, Adelphi or the UGLE Portal) **[OWNER TO CONFIRM: the exact systems and who provides the reports]**.
- **From the mentoring team**: Assistant Provincial Grand Mentors, Lodge Mentors and other team members record contact, visits, notes and support.
- **From other people**: someone may ask for support for you or raise a concern about your welfare.
- **From our email provider**: whether an email was delivered, bounced or marked as spam.

## Why the information is used, and the lawful basis

Data protection law requires a lawful basis for each use. The bases below are proposed and must be confirmed by the controller before the Hub holds live information.

| Purpose | Proposed lawful basis |
|---|---|
| Supporting members through mentoring: allocations, records of contact, visits, reviews and support | Legitimate interests in supporting members of the Province **[OWNER TO CONFIRM]** |
| Running the Academy: accounts, courses, progress and certificates | Legitimate interests in providing learning to members **[OWNER TO CONFIRM]** |
| Organising mentoring events and recording attendance | Legitimate interests **[OWNER TO CONFIRM]** |
| Essential emails: account security, sign-in links, bookings and anything needed for a role you hold | Legitimate interests **[OWNER TO CONFIRM]** |
| Optional emails: news, learning suggestions and event invitations | **[OWNER TO CONFIRM: consent, or legitimate interests with an easy way to opt out, and how the Privacy and Electronic Communications Regulations apply]** |
| Keeping the Hub secure: two-step verification, audit records and backups | Legitimate interests, and the legal duty to keep personal information secure **[OWNER TO CONFIRM]** |
| Reports to Provincial leadership | Legitimate interests. Quarterly reports use totals, not named individuals |

Where we rely on legitimate interests we have balanced them against your interests and rights **[OWNER TO CONFIRM: that a legitimate interests assessment has been completed and recorded]**. You can object at any time (see "Your rights").

The Hub does not make decisions about you by automated means that have legal or similarly significant effects. Academy assessments are marked automatically against the course answers; if you think a result is wrong, ask the Academy team to review it.

## Sensitive information

Membership of Freemasonry may be treated as revealing a philosophical belief, which is "special category" information under data protection law. A confidential concern or a support request may also include information about health or welfare. **[OWNER TO CONFIRM: whether membership is treated as special category information, and the condition relied on for it and for confidential concerns, for example the condition for not-for-profit bodies or the safeguarding condition in the Data Protection Act 2018, together with the appropriate policy document if one is required]**.

Confidential concerns are visible only to the designated leaders who triage them (by default the Provincial Grand Mentor and Deputy), anyone they choose to assign (each assignment is recorded) and the person who raised it. They never appear in Lodge views, counts, searches or notification emails. Sensitive welfare matters belong with the Lodge Almoner, so mentoring records should note only that a referral was made.

## Who can see your information

Access depends on the role someone holds and is enforced by the database itself, not just by what the screens show.

- **You** can see your own account, membership, learning, bookings and preferences.
- **The Provincial Grand Mentor and Deputy** can see mentoring and support records across the Province.
- **Assistant Provincial Grand Mentors** can see ordinary Lodge and membership information across the Province, and detailed mentoring records only for the Lodges allocated to them.
- **Lodge Mentors** can see information about their own Lodge only where the Province has switched on the Lodge Mentor portal for them. Your Lodge Mentor and Assistant Provincial Grand Mentor can see which Academy courses you have started and completed, but never your answers or reflections.
- **Other members of the Provincial Mentoring Team** can see ordinary Lodge and membership information, and notes shared with the whole team.
- **Event organisers** can see bookings and attendance for the events they run.
- **Academy administrators** can see learning records.
- **Technical administrators** manage accounts and settings. Their role does not let them read mentoring notes, contacts, visits, journeys, support records or the content of emails. Every change they make to accounts and roles is recorded.

Organisations that run parts of the Hub for us ("processors"), under contract:

| Provider | What they do | Where |
|---|---|---|
| Supabase | Database, sign-in and file storage | London (UK) region **[OWNER TO CONFIRM for the production project]** |
| Vercel | Hosting the application | Configured to run in London (UK) **[OWNER TO CONFIRM in the production project settings]** |
| Resend | Sending email | **[OWNER TO CONFIRM: the region chosen for the sending domain]** |

**[OWNER TO CONFIRM: that a data processing agreement is in place with each provider, and any further providers, for example backup storage]**. Information is not sold or shared for marketing. It may be disclosed where the law requires it.

If a course includes a video, it is played from YouTube (in its privacy-enhanced mode) or Vimeo. When you play it, that service receives your IP address and may set its own cookies.

## Transfers outside the UK

The providers above are based in the United States, although the Hub is configured to store and run in the UK. Their staff or sub-processors may access information from outside the UK, for example for support. **[OWNER TO CONFIRM: for each provider, whether information leaves the UK and the safeguard relied on, for example the UK Extension to the EU-US Data Privacy Framework or the International Data Transfer Agreement or Addendum]**.

## How long information is kept

| Information | Proposed period |
|---|---|
| Records about members who have left (resigned, ceased, excluded or died) | Personal details anonymised 12 months after leaving, following the Province's recommended baseline |
| Closed support requests and concerns | Details removed 6 years after closing |
| Raw membership import files and rows | 12 months |
| Email delivery history | 24 months |
| In-app notifications | 12 months |
| Learning records and certificates | **[OWNER TO CONFIRM]** |
| Audit records of significant actions | **[OWNER TO CONFIRM]** |
| Backups | Rolling database backups kept by Supabase for the period of its plan, and independent backups **[OWNER TO CONFIRM: how often they are taken, that they are encrypted, where they are stored and how long they are kept]** |

**[OWNER TO CONFIRM: these periods. They are built into the Hub but switched off until the Province decides them.]**

## Your rights

You have the right to:

- ask for a copy of the information the Hub holds about you;
- ask for anything inaccurate to be corrected (much of it comes from membership records, so we will tell you if the correction needs to be made at your Lodge);
- ask for information to be deleted or its use restricted;
- receive information you gave us in a portable format, where that applies;
- withdraw consent at any time, where we rely on consent, without affecting what was done before.

**You have the right to object** to the use of your information where we rely on legitimate interests, and to stop optional emails at any time. Every optional email has an unsubscribe link, and you can change your choices under My account, Notification settings.

To make a request, contact the data protection contact above. We will respond within one month, and may ask you to confirm your identity first.

## Complaints

If you are unhappy with how your information has been handled, please tell us first using the contact details above. We will acknowledge your complaint within 30 days, look into it, keep you informed and tell you the outcome.

You can also complain to the Information Commissioner's Office (ICO), the UK's data protection regulator: ico.org.uk/make-a-complaint, or telephone 0303 123 1113 **[OWNER TO CONFIRM at publication: the regulator's current name and contact details]**.

## Cookies

The Hub uses only the cookies it needs to keep you signed in securely. There are no analytics, advertising or tracking cookies, and no tracking code runs on Hub pages. Videos embedded in courses are the exception described above **[OWNER TO CONFIRM: whether a choice is offered before an embedded video is played]**.

Emails record delivery and bounces. **[OWNER TO CONFIRM: whether open and click tracking is switched on in the email service. It is recommended to keep it off.]**

## Children

The Hub is for adult members of Freemasonry and those supporting them. It is not intended for children, and we do not knowingly hold information about anyone under 18.

## Changes to this notice

We will update this notice when the Hub or the way it uses information changes, and show the date of the latest version below. Significant changes will be explained when you next sign in **[OWNER TO CONFIRM]**.
`.trim();

/** Placeholders still to be settled. The notice is a draft while any remain. */
export const privacyNoticePlaceholders = () => PRIVACY_NOTICE_MARKDOWN.split(PLACEHOLDER).length - 1;
export const privacyNoticeIsDraft = () => privacyNoticePlaceholders() > 0;
