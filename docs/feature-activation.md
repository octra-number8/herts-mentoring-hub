# First-release feature activation matrix

Generated 2026-10-25 from `feature_settings` and `feature_activations`.

| Feature | Enabled | Mode | Actions enabled | Active targeted activations | First-release audience |
|---|---|---|---|---|---|
| Provincial management | Yes | Available to permitted roles | read, create, export, update, approve | 0 | Authorised Provincial users only |
| Herts Mentoring Academy | Yes | Available to permitted roles | read, create, export, update, approve | 0 | All Learning Users and Provincial users |
| Academy authoring | Yes | Available to permitted roles | read, create, export, update, approve | 0 | L&D contributors, L&D lead, leadership |
| Communications centre | Yes | Available to permitted roles | read, create, export, update, approve | 0 | Provincial users with comms permissions |
| Membership imports | Yes | Available to permitted roles | read, create, export, update, approve | 0 | Leadership |
| Workflow automation | Yes | Available to permitted roles | read, create, export, update, approve | 0 | Leadership |
| Reporting and intelligence | Yes | Available to permitted roles | read, create, export, update, approve | 0 | Provincial users with report permissions |
| Administration | Yes | Available to permitted roles | read, create, export, update, approve | 0 | Leadership and technical administrator |
| Lodge Mentor portal | Yes | Activation required | read, create, export, update, approve | 0 | **Nobody** until leadership activates it for a user, Lodge or role |

Lodge Mentor accounts hold the `lodge_portal.*` permissions through their role, but the portal stays closed until an activation exists. Activation is per account, per Lodge or per role, with per-action control (read, create, update, export), a mandatory reason, and an audit entry. Deactivation removes access immediately and leaves learning history untouched (tested in Scenario 14).
