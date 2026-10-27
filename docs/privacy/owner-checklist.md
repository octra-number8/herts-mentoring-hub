# Privacy notice: facts the owner must confirm

The Privacy Notice (`src/content/privacy-notice.ts`, published at `/privacy`) was drafted on 27 October 2026 from what the Hub actually does. It follows the ICO's guidance on the right to be informed (UK GDPR Articles 13 and 14) and the complaints duty added by the Data (Use and Access) Act 2025, in force since 19 June 2026.

Each open point below appears in the notice as **[OWNER TO CONFIRM: ...]**. While any remain, `/privacy` shows a "Draft" banner and `npm run security:check -- --release` fails.

To settle a point, replace its placeholder with the confirmed wording, update `PRIVACY_NOTICE_UPDATED` and `PRIVACY_NOTICE_VERSION`, and run `npm test`.

## Settled by the owner (27 October 2026)

| Topic | Decision |
|---|---|
| Controller | The Provincial Grand Lodge of Hertfordshire |
| Data protection contact | The Provincial Office, asstmentor@hertfordshirefreemasons.org.uk. Requests and complaints are handled by Wes Pierce. |
| Data Protection Officer and ICO fee | A DPO is appointed, and the ICO registration is in place |
| Lawful bases | Legitimate interests for mentoring, the Academy, events, essential email, security and reports |
| Optional email | Sent by default, with opt-out (see "Risks to note") |
| Special category | Membership is special category information. Condition: Article 9(2)(d), not-for-profit bodies. |
| Personal Mentoring Plan | Holding it centrally in the Hub is acceptable (A3 section 7) |
| Membership source | Adelphi |
| Processing agreements | Standard terms with Supabase, Vercel and Resend |
| Regions | London for Supabase and Vercel |
| Retention | The proposed periods are approved |
| Backups | Weekly |
| Embedded video | Click to load. Built: nothing is requested from YouTube or Vimeo until the learner chooses. |
| Email tracking | Off |
| Staging site | Not wanted |
| Rate limiting | No paid Vercel WAF. Supabase Auth's built-in limits apply. |
| Mentoring roles | No leadership sign-off needed to grant them |
| Live editing | Administrators only (`admin.config`). Built in migration `20261028000200`. |

## Still open (in the notice)

1. A **legitimate interests assessment**, completed and recorded.
2. The **Resend region** for the sending domain. Resend has no UK region, so the nearest is Ireland (EU).
3. **Transfers**: for each provider, whether information leaves the UK, and the safeguard relied on (the UK Extension to the Data Privacy Framework, or the IDTA or Addendum in its terms).
4. Retention for **learning records and certificates**.
5. Retention for **audit records**.
6. **Backups**: that they are encrypted, where they are stored and how long they are kept. `scripts/backup.sh` writes an unencrypted dump.
7. How **significant changes** to the notice are communicated (for example, a message at next sign-in).
8. At publication, recheck the **regulator's name and contact details**. Some sources refer to an "Information Commission" succeeding the ICO.

## Actions before live data (not in the notice)

- **Switch on the retention policies** under Administration, Retention. The notice says the periods are applied automatically.
- **Check that open and click tracking is off** on the Resend domain.
- **Check the Supabase and Vercel project regions** in each dashboard.
- **Switch live editing off** under Administration, Configuration once members have access.
- Decide whether to **delete or encrypt the local backups** in the git-ignored `backups/` folder.
- **Retire the staging site**, if it is not wanted. This needs explicit approval because it deletes infrastructure.
- Have a **breach response** plan, including the 72-hour ICO reporting test, and a way to assemble **subject access requests** (one month).

## Risks to note

- **Optional email by default.** Under PECR, sending news or event invitations without opt-in consent relies on the "soft opt-in". That historically applied to commercial senders only. The Data (Use and Access) Act 2025 extends it to charities. If the Province is not a registered charity, or if these emails promote Freemasonry's aims (which the ICO treats as direct marketing), opt-out may not be enough. Confirm this with your adviser. To return to opt-in, set the `comm_preferences.news` default back to false.
- **Article 9(2)(d)** requires that special category information is not disclosed outside the body without consent. Sharing with UGLE or with Lodges outside the Province would need another condition, or consent.
