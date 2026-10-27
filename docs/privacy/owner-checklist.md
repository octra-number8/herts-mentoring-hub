# Privacy notice: facts the owner must confirm

The Privacy Notice (`src/content/privacy-notice.ts`, published at `/privacy`) was drafted on 27 October 2026 from what the Hub actually does, using the ICO's guidance on the right to be informed (UK GDPR Articles 13 and 14) and the complaints duty added by the Data (Use and Access) Act 2025, in force since 19 June 2026.

Each point below appears in the notice as **[OWNER TO CONFIRM: ...]**. While any remain, `/privacy` shows a "Draft" banner, and `npm run security:check -- --release` fails. **The notice must not be treated as ready for live information until every item is settled**, ideally with advice from whoever advises the Province on data protection.

Replace each placeholder with the confirmed wording, update `PRIVACY_NOTICE_UPDATED` and `PRIVACY_NOTICE_VERSION`, and run `npm test`.

## Who is responsible

1. The legal name of the **controller**, for example the Provincial Grand Lodge of Hertfordshire. Also whether any processing is shared with UGLE or with individual Lodges, as joint or separate controllers.
2. The **data protection contact**: the name or role, and the email address, for requests and complaints.
3. Whether a **Data Protection Officer** is appointed. Also confirm the ICO registration (data protection fee) position. This is not shown in the notice.

## Lawful bases and sensitive information

4. Confirm or change the **proposed lawful basis** for each purpose in the table. Legitimate interests is proposed for mentoring, the Academy, events, essential email, security and reports. Record a **legitimate interests assessment**.
5. **Optional email** (news, learning suggestions, event invitations): decide whether this is consent or legitimate interests with opt-out, and how PECR applies.
6. Decide whether **Freemasonry membership** is treated as special category information (philosophical belief). Also decide the Article 9 and DPA 2018 Schedule 1 **condition** for membership and for confidential concerns and support requests that touch health or welfare, and whether an **appropriate policy document** is needed.
7. Confirm A3 section 7 against the Hub. The Hub centralises journey information, while A3 says the Personal Mentoring Plan is "not circulated". This is production-readiness item 4.

## Sources, providers and transfers

8. The exact **membership systems and report providers** (Hermes, Adelphi or the UGLE Portal), and the authority to import from them. This is production-readiness item 1.
9. A **data processing agreement** with Supabase, Vercel and Resend, and with any backup storage provider.
10. The **regions** for production:
    - the Supabase project (London is intended);
    - Vercel functions (`vercel.json` now pins `lhr1`; confirm it in the project settings);
    - the Resend sending domain's region.
11. For each provider, whether information **leaves the UK**, and the **transfer safeguard** relied on (for example the UK Extension to the EU-US Data Privacy Framework, or the IDTA or Addendum).

## Retention

12. Approve or change the **retention periods**. Proposed:
    - departed members: anonymised at 12 months;
    - closed cases: 6 years;
    - import rows: 12 months;
    - email history: 24 months;
    - notifications: 12 months.

    They are built but switched off. Once they are decided, leadership enables them under Administration, Retention.
13. Retention for **learning records and certificates**, and for **audit records**. No period has been set for either.
14. **Backups**: how often independent backups are taken, that they are encrypted, where they are stored and how long they are kept. `scripts/backup.sh` writes an unencrypted dump when someone runs it.

## Cookies, tracking and changes

15. Whether visitors are offered a **choice before an embedded video** (YouTube or Vimeo) is played. These services set their own cookies, and the PECR "strictly necessary" exemption does not cover them.
16. Whether **open and click tracking** is enabled on the Resend domain. Keeping it off is recommended; the Hub stores these events if they arrive.
17. How **significant changes** to the notice are communicated (for example, a message at next sign-in).
18. At publication, recheck the **regulator's name and contact details**. Some sources refer to an "Information Commission" succeeding the ICO under the Data (Use and Access) Act 2025.

## Operational decisions flagged by the review (not in the notice)

- A process to handle **data protection complaints** (acknowledge within 30 days) and **subject access requests** (one month). No export-for-a-person tool exists yet; requests would be assembled by the team.
- A **breach response** plan, including the 72-hour ICO reporting test.
- Whether the **local backups** in the repo's git-ignored `backups/` folder should be kept, now that staging is clean. They hold synthetic data plus the owner's own staging account. They are unencrypted on this machine, while the runbook asks for encrypted backups.
