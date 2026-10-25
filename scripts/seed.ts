/**
 * Synthetic development and test data. Never run against production.
 * Every person, Lodge and meeting centre here is fictional.
 *
 *   npm run db:seed
 *
 * Writes .seed-secrets.json (git-ignored) with test account passwords and TOTP
 * secrets so automated tests can sign in, including through MFA.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { generateSync } from "otplib";
import { writeFileSync } from "node:fs";
import { config } from "dotenv";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

config({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PASSWORD = process.env.SEED_PASSWORD ?? "Hub-Test-Password-2026";

if (!URL.includes("127.0.0.1") && !URL.includes("localhost") && process.env.ALLOW_REMOTE_SEED !== "yes-synthetic-only") {
  throw new Error("Refusing to seed a non-local database. Set ALLOW_REMOTE_SEED=yes-synthetic-only for a synthetic staging project.");
}

const db: SupabaseClient = createClient(URL, SERVICE, { auth: { persistSession: false } });

// Bulk inserts with differing columns should fall back to column defaults, not null.
const builderProto = Object.getPrototypeOf(db.from("organisations"));
const origInsert = builderProto.insert;
builderProto.insert = function (values: unknown, opts: Record<string, unknown> = {}) {
  return origInsert.call(this, values, { defaultToNull: false, ...opts });
};

// Deterministic PRNG so runs are repeatable.
let seed = 20261025;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rand() * a.length)];
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);
const daysAhead = (n: number) => new Date(Date.now() + n * 86400000);

async function must<T>(p: PromiseLike<{ data: T; error: unknown }>, what: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${JSON.stringify(error)}`);
  return data;
}

const FIRST = ["James","Robert","David","Michael","Peter","Andrew","Richard","Paul","Stephen","Mark","Simon","Christopher","Ian","Graham","Neil","Martin","Gary","Kevin","Anthony","Philip","Jonathan","Daniel","Matthew","Thomas","Edward","Alan","Colin","Keith","Trevor","Nigel","Adrian","Stuart","Raj","Sanjay","Tunde","Kwame","Marek","Luca","Dimitri","Hamish","Owen","Callum","Rhys","Aaron","Samuel","Joseph","Benjamin","Oliver","Harry","George"];
const LAST = ["Ashworth","Bramley","Carrow","Dunmore","Ellison","Farrant","Gilchrist","Halloran","Ingram","Jessop","Kendrick","Lowther","Marchbank","Norcott","Ormerod","Pennington","Quarrie","Radcliffe","Stanway","Thackeray","Underhill","Vickery","Wainwright","Yardley","Abbot","Bellamy","Coniston","Dewhurst","Everett","Fairbairn","Greaves","Hartigan","Isherwood","Jarrold","Kilbride","Lindqvist","Mallinson","Nettleton","Okonkwo","Patel","Ramsay","Sheridan","Tolland","Varga","Whitlock","Ashdown","Brereton","Cartwright","Delaney","Esposito"];
const LODGE_WORDS = ["Brookfield","Harewood","Kestrel","Millbank","Oakhurst","Ravensmere","Thornbury","Wychwood","Ashcombe","Beaconsfield","Calder","Deepdale","Elmstead","Foxley","Greystoke","Hollowell","Ivybridge","Juniper","Kingsmead","Larkspur","Meadowcroft","Northgate","Orchardleigh","Pemberley","Quayside","Rookwood","Silverdale","Tamarisk","Upwood","Valemont","Westbourne","Yewdale","Amberley","Bramblewood","Chilton","Driftwood","Eastgate","Fernhill","Glenmoor","Highcroft"];
const CENTRES = [
  ["Ashbury Masonic Centre","Ashbury"],["Brooksend Masonic Hall","Brooksend"],["Colmere Masonic Centre","Colmere"],
  ["Dunford Hall","Dunford"],["Elmbridge Masonic Centre","Elmbridge"],["Farley Green Hall","Farley Green"],
  ["Gatesby Masonic Centre","Gatesby"],["Harlow Vale Hall","Harlow Vale"],
] as const;
const PATTERNS = ["2nd Monday, Sep to May","3rd Tuesday, Oct to Apr","1st Thursday, Sep to Jun","4th Wednesday, Oct to May","2nd Saturday, Sep to Apr","3rd Friday, Jan, Mar, May, Oct, Dec"];

type TestUser = { key: string; email: string; first: string; last: string; title?: string; roles: string[]; mfa: boolean };
const TEST_USERS: TestUser[] = [
  { key: "pgm", email: "pgm@hub.test", first: "Henry", last: "Marlowe", title: "W Bro", roles: ["prov_grand_mentor"], mfa: true },
  { key: "deputy", email: "deputy@hub.test", first: "Gareth", last: "Pryce", title: "W Bro", roles: ["deputy_prov_grand_mentor"], mfa: true },
  { key: "apgmen1", email: "apgmen1@hub.test", first: "Alistair", last: "Northcote", title: "W Bro", roles: ["apgmen", "lodge_mentor"], mfa: true },
  { key: "apgmen2", email: "apgmen2@hub.test", first: "Bernard", last: "Eastham", title: "W Bro", roles: ["apgmen"], mfa: true },
  { key: "apgmen3", email: "apgmen3@hub.test", first: "Clive", last: "Mortimer", title: "W Bro", roles: ["apgmen"], mfa: true },
  { key: "apgmen4", email: "apgmen4@hub.test", first: "Duncan", last: "Southwell", title: "W Bro", roles: ["apgmen"], mfa: true },
  { key: "apgmen5", email: "apgmen5@hub.test", first: "Emrys", last: "Westlake", title: "W Bro", roles: ["apgmen"], mfa: true },
  { key: "team", email: "team@hub.test", first: "Francis", last: "Holt", title: "W Bro", roles: ["prov_team"], mfa: true },
  { key: "learninglead", email: "learning.lead@hub.test", first: "Gordon", last: "Aske", title: "W Bro", roles: ["learning_lead"], mfa: true },
  { key: "author", email: "author@hub.test", first: "Hugo", last: "Penrose", title: "Bro", roles: ["ld_contributor"], mfa: false },
  { key: "techadmin", email: "techadmin@hub.test", first: "Ivan", last: "Castell", roles: ["tech_admin"], mfa: true },
  { key: "lm1", email: "lm1@hub.test", first: "Julian", last: "Fenwick", title: "W Bro", roles: ["lodge_mentor"], mfa: false },
  { key: "lm2", email: "lm2@hub.test", first: "Keir", last: "Ashford", title: "W Bro", roles: ["lodge_mentor"], mfa: false },
  { key: "pm1", email: "pm1@hub.test", first: "Lewis", last: "Grantham", title: "Bro", roles: ["personal_mentor"], mfa: false },
  { key: "learner1", email: "learner1@hub.test", first: "Marcus", last: "Bellweather", title: "Bro", roles: ["learner"], mfa: false },
  { key: "learner2", email: "learner2@hub.test", first: "Nathan", last: "Okafor", title: "Bro", roles: ["learner"], mfa: false },
];

/** Wait until PostgREST's schema cache includes our functions (it reloads after a reset). */
async function apiReady() {
  for (let i = 0; i < 60; i++) {
    const { error } = await db.rpc("admin_bootstrap_org", { p_org: "00000000-0000-0000-0000-000000000000" });
    if (!error || !["PGRST002", "PGRST202"].includes(error.code ?? "")) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Supabase API schema cache did not load");
}

async function main() {
  await apiReady();
  console.log("Seeding synthetic data…");

  // Organisation -------------------------------------------------------------
  const org = await must(db.from("organisations").insert({
    slug: "herts", name: "Provincial Grand Lodge of Hertfordshire", short_name: "Hertfordshire",
    settings: {
      environment_label: "Synthetic test data",
      principles: ["Prepare", "Guide", "Support", "Enlighten"],
      progression: { ea_to_fc_months: 9, fc_to_mm_months: 9, new_member_review_days: 90 },
      comms: { allow_self_approval: true, allocated_requires_approval: false, reply_to: "mentor@hertfordshirefreemasons.org.uk" },
      academy: { allow_self_approval: false },
      imports: { authoritative_fields: ["title","first_name","last_name","email","phone","status"], new_initiate_window_days: 540 },
      contact_block: "Provincial Office, Fleet House, 10 Parkway, St Albans AL3 6PA",
    },
    branding: { primary: "#003668", accent: "#157A7C" },
  }).select().single(), "org") as { id: string };
  const O = org.id;
  await must(db.rpc("admin_bootstrap_org", { p_org: O }), "bootstrap");

  const roles = await must(db.from("roles").select("id,key").eq("org_id", O), "roles") as { id: string; key: string }[];
  const roleId = (k: string) => roles.find((r) => r.key === k)!.id;
  const statuses = await must(db.from("mentoring_statuses").select("id,key").eq("org_id", O), "statuses") as { id: string; key: string }[];
  const statusId = (k: string) => statuses.find((s) => s.key === k)!.id;

  // Areas and centres ------------------------------------------------------------
  const areas = await must(db.from("areas").insert(
    ["North", "East", "Central", "South", "West"].map((n, i) => ({ org_id: O, name: `${n} Area`, code: String.fromCharCode(65 + i) }))
  ).select(), "areas") as { id: string; code: string }[];
  const centres = await must(db.from("meeting_centres").insert(
    CENTRES.map(([name, town]) => ({ org_id: O, name, town, address: `1 Lodge Lane, ${town}` }))
  ).select(), "centres") as { id: string }[];

  // Lodges ---------------------------------------------------------------------
  const lodges = await must(db.from("lodges").insert(LODGE_WORDS.map((w, i) => ({
    org_id: O, name: `${w} Lodge`, number: 9001 + i, meeting_centre_id: centres[i % centres.length].id,
    meeting_pattern: pick(PATTERNS), installation_month: int(1, 12), status: i === 39 ? "in_abeyance" : "active",
    mentoring_status_id: statusId(pick(["routine","routine","routine","contact_due","awaiting_response","review_required","active_assistance"])),
  }))).select(), "lodges") as { id: string; number: number; name: string }[];

  // People: test users -----------------------------------------------------------
  const persons: Record<string, string> = {};
  for (const u of TEST_USERS) {
    const p = await must(db.from("persons").insert({ org_id: O, title: u.title ?? null, first_name: u.first, last_name: u.last,
      email: u.email, membership_number: `T${100000 + TEST_USERS.indexOf(u)}`, source: "invitation" }).select("id").single(), "person") as { id: string };
    persons[u.key] = p.id;
  }

  // Members ----------------------------------------------------------------------
  type M = { id?: string; lodge: number; first: string; last: string; init: Date; passed?: Date; raised?: Date; left?: Date; reason?: string; joined?: boolean };
  const members: M[] = [];
  for (let li = 0; li < lodges.length; li++) {
    const n = int(14, 26);
    for (let k = 0; k < n; k++) {
      const yearsAgo = rand() < 0.25 ? rand() * 1.5 : rand() * 30;
      const init = daysAgo(Math.floor(yearsAgo * 365));
      const m: M = { lodge: li, first: pick(FIRST), last: pick(LAST), init, joined: rand() < 0.08 };
      const sinceInit = (Date.now() - init.getTime()) / 86400000;
      if (sinceInit > 120 && rand() < 0.92) m.passed = new Date(init.getTime() + int(90, rand() < 0.15 ? 600 : 240) * 86400000);
      if (m.passed && m.passed.getTime() > Date.now()) m.passed = undefined;
      if (m.passed && rand() < 0.9) { const r = new Date(m.passed.getTime() + int(90, rand() < 0.12 ? 600 : 220) * 86400000); if (r.getTime() < Date.now()) m.raised = r; }
      if (rand() < 0.06) { m.left = daysAgo(int(10, 700)); if (m.left < init) m.left = undefined; else m.reason = pick(["resigned", "resigned", "ceased", "deceased"]); }
      members.push(m);
    }
  }
  // Add learners as members of real (synthetic) lodges with journeys
  const personRows = members.map((m, i) => ({
    org_id: O, first_name: m.first, last_name: m.last, title: m.raised ? "Bro" : "Bro",
    email: `member${i + 1}@example.test`, phone: `07700 9${String(i).padStart(5, "0")}`,
    membership_number: `S${200000 + i}`, source: "import",
    status: m.left ? (m.reason === "deceased" ? "deceased" : m.reason === "ceased" ? "ceased" : "resigned") : "active",
    status_changed_on: m.left ? iso(m.left) : null,
  }));
  for (let i = 0; i < personRows.length; i += 400) {
    const rows = await must(db.from("persons").insert(personRows.slice(i, i + 400)).select("id"), "members") as { id: string }[];
    rows.forEach((r, j) => (members[i + j].id = r.id));
  }

  const memberships: object[] = []; const degrees: object[] = []; const journeys: object[] = []; const prefs: object[] = [];
  for (const m of members) {
    const L = lodges[m.lodge];
    memberships.push({ org_id: O, person_id: m.id, lodge_id: L.id, is_primary: true, joined_on: iso(m.init), join_type: m.joined ? "joined" : "initiated", left_on: m.left ? iso(m.left) : null, leaving_reason: m.reason ?? null, source: "import" });
    if (!m.joined) degrees.push({ org_id: O, person_id: m.id, lodge_id: L.id, kind: "initiation", event_date: iso(m.init), source: "import" });
    else degrees.push({ org_id: O, person_id: m.id, lodge_id: L.id, kind: "joining", event_date: iso(m.init), source: "import" });
    if (m.passed) degrees.push({ org_id: O, person_id: m.id, lodge_id: L.id, kind: "passing", event_date: iso(m.passed), source: "import" });
    if (m.raised) degrees.push({ org_id: O, person_id: m.id, lodge_id: L.id, kind: "raising", event_date: iso(m.raised), source: "import" });
    prefs.push({ person_id: m.id, org_id: O, news: rand() < 0.6 });
    const recent = Date.now() - m.init.getTime() < 3 * 365 * 86400000;
    if (recent && !m.left && !m.joined) {
      journeys.push({ org_id: O, person_id: m.id, stage: m.raised ? "master_mason" : m.passed ? "fellow_craft" : "entered_apprentice",
        personal_mentor_allocated: pick(["yes", "yes", "yes", "unknown", "no"]),
        personal_mentor_confirmed_on: rand() < 0.6 ? iso(daysAgo(int(5, 300))) : null,
        royal_arch: m.raised ? pick(["not_discussed", "informed", "interested", "exalted"]) : "not_discussed",
        next_review_on: iso(daysAhead(int(-20, 120))) });
    }
  }
  for (const [t, rows] of [["lodge_memberships", memberships], ["degree_events", degrees], ["member_journeys", journeys], ["comm_preferences", prefs]] as const) {
    for (let i = 0; i < rows.length; i += 500) await must(db.from(t).insert(rows.slice(i, i + 500)), t);
  }
  for (const u of TEST_USERS) await must(db.from("comm_preferences").insert({ person_id: persons[u.key], org_id: O, news: true }), "prefs");

  // Test users' own Lodge memberships
  const testLodge: Record<string, number> = { pgm: 0, deputy: 1, apgmen1: 2, apgmen2: 10, apgmen3: 18, apgmen4: 26, apgmen5: 34, team: 5, learninglead: 6, author: 7, techadmin: 8, lm1: 0, lm2: 1, pm1: 0, learner1: 0, learner2: 3 };
  for (const u of TEST_USERS) {
    await must(db.from("lodge_memberships").insert({ org_id: O, person_id: persons[u.key], lodge_id: lodges[testLodge[u.key]].id, is_primary: true,
      joined_on: iso(daysAgo(u.key.startsWith("learner") ? 200 : 4000)), join_type: "initiated" }), "test membership");
  }
  await must(db.from("degree_events").insert([
    { org_id: O, person_id: persons.learner1, lodge_id: lodges[0].id, kind: "initiation", event_date: iso(daysAgo(200)) },
    { org_id: O, person_id: persons.learner2, lodge_id: lodges[3].id, kind: "initiation", event_date: iso(daysAgo(200)) },
    { org_id: O, person_id: persons.learner2, lodge_id: lodges[3].id, kind: "passing", event_date: iso(daysAgo(60)) },
  ]), "learner degrees");
  await must(db.from("member_journeys").insert([
    { org_id: O, person_id: persons.learner1, stage: "entered_apprentice", personal_mentor_allocated: "yes", personal_mentor_confirmed_on: iso(daysAgo(190)), learning_opt_in: true },
    { org_id: O, person_id: persons.learner2, stage: "fellow_craft", personal_mentor_allocated: "unknown", learning_opt_in: true },
  ]), "learner journeys");

  // Accounts, roles and MFA ----------------------------------------------------------
  const secrets: Record<string, { email: string; password: string; totpSecret?: string; personId: string; accountId: string }> = {};
  const accounts: Record<string, string> = {};
  for (const u of TEST_USERS) {
    const { data: created, error } = await db.auth.admin.createUser({ email: u.email, password: PASSWORD, email_confirm: true });
    if (error) throw error;
    const acc = await must(db.from("user_accounts").insert({ org_id: O, person_id: persons[u.key], auth_user_id: created.user!.id, status: "active" }).select("id").single(), "account") as { id: string };
    accounts[u.key] = acc.id;
    await must(db.from("role_assignments").insert(u.roles.map((r) => ({ org_id: O, account_id: acc.id, role_id: roleId(r), starts_on: iso(daysAgo(400)), reason: "Synthetic seed" }))), "roles");
    secrets[u.key] = { email: u.email, password: PASSWORD, personId: persons[u.key], accountId: acc.id };
    if (u.mfa) {
      const c = createClient(URL, ANON, { auth: { persistSession: false } });
      const { error: e1 } = await c.auth.signInWithPassword({ email: u.email, password: PASSWORD });
      if (e1) throw e1;
      const { data: f, error: e2 } = await c.auth.mfa.enroll({ factorType: "totp", friendlyName: "Seed authenticator" });
      if (e2) throw e2;
      const { data: ch, error: e3 } = await c.auth.mfa.challenge({ factorId: f.id });
      if (e3) throw e3;
      const { error: e4 } = await c.auth.mfa.verify({ factorId: f.id, challengeId: ch.id, code: generateSync({ secret: f.totp.secret }) });
      if (e4) throw e4;
      secrets[u.key].totpSecret = f.totp.secret;
    }
  }

  // Provincial appointments and allocations ---------------------------------------------
  await must(db.from("provincial_appointments").insert([
    { org_id: O, person_id: persons.pgm, office: "prov_grand_mentor", starts_on: iso(daysAgo(900)) },
    { org_id: O, person_id: persons.deputy, office: "deputy_prov_grand_mentor", starts_on: iso(daysAgo(900)) },
    ...[1, 2, 3, 4, 5].map((n) => ({ org_id: O, person_id: persons[`apgmen${n}`], office: "apgmen", area_id: areas[n - 1].id, starts_on: iso(daysAgo(700)) })),
    { org_id: O, person_id: persons.team, office: "prov_team", title: "Events and Communications", starts_on: iso(daysAgo(300)) },
  ]), "prov appointments");
  const allocations = lodges.slice(0, 38).map((l, i) => ({ org_id: O, lodge_id: l.id, person_id: persons[`apgmen${Math.floor(i / 8) + 1}`],
    area_id: areas[Math.floor(i / 8)].id, kind: "primary", starts_on: iso(daysAgo(700)) }));
  await must(db.from("lodge_allocations").insert(allocations), "allocations");
  // Lodges 9039 and 9040 deliberately unallocated.

  // Lodge appointments -------------------------------------------------------------
  const byLodge = (li: number) => members.filter((m) => m.lodge === li && !m.left && m.raised);
  const appts: object[] = [];
  lodges.forEach((l, li) => {
    const pool = byLodge(li);
    const at = (k: number) => pool[k % Math.max(pool.length, 1)]?.id ?? null;
    appts.push({ org_id: O, lodge_id: l.id, office: "worshipful_master", person_id: at(0), starts_on: iso(daysAgo(int(30, 330))) });
    appts.push({ org_id: O, lodge_id: l.id, office: "secretary", person_id: at(1), starts_on: iso(daysAgo(int(400, 2000))) });
    appts.push({ org_id: O, lodge_id: l.id, office: "membership_officer", person_id: rand() < 0.7 ? at(2) : null, starts_on: iso(daysAgo(int(100, 900))) });
    if (li === 0) appts.push({ org_id: O, lodge_id: l.id, office: "lodge_mentor", person_id: persons.lm1, starts_on: iso(daysAgo(500)) });
    else if (li === 1) appts.push({ org_id: O, lodge_id: l.id, office: "lodge_mentor", person_id: persons.lm2, starts_on: iso(daysAgo(500)) });
    else if (li === 2) appts.push({ org_id: O, lodge_id: l.id, office: "lodge_mentor", person_id: persons.apgmen1, starts_on: iso(daysAgo(800)) });
    else if (rand() < 0.85) {
      // History: a previous holder, then the current one.
      appts.push({ org_id: O, lodge_id: l.id, office: "lodge_mentor", person_id: at(3), starts_on: iso(daysAgo(2000)), ends_on: iso(daysAgo(int(200, 600))) });
      appts.push({ org_id: O, lodge_id: l.id, office: "lodge_mentor", person_id: at(4), confirmed: rand() < 0.85, starts_on: iso(daysAgo(int(100, 199))) });
    } else appts.push({ org_id: O, lodge_id: l.id, office: "lodge_mentor", person_id: null, starts_on: iso(daysAgo(60)) });
  });
  await must(db.from("lodge_appointments").insert(appts), "appointments");

  await must(db.from("lodge_mentoring_profiles").insert(lodges.map((l) => ({ org_id: O, lodge_id: l.id,
    personal_mentors_for_new_members: pick(["yes", "yes", "partly", "unknown", "no"]),
    arrangements: "Lodge Mentor co-ordinates; each new member is offered a Personal Mentor at proposal.",
    last_review_on: rand() < 0.7 ? iso(daysAgo(int(30, 400))) : null, next_review_on: iso(daysAhead(int(-30, 300))) }))), "profiles");

  // Contacts, visits, tasks, cases ------------------------------------------------------
  const apgOf = (li: number) => li < 38 ? `apgmen${Math.floor(li / 8) + 1}` : "pgm";
  const contacts: object[] = [];
  for (let k = 0; k < 160; k++) {
    const li = int(0, 37); const who = apgOf(li);
    contacts.push({ org_id: O, lodge_id: lodges[li].id, method: pick(["telephone", "email", "online_meeting", "face_to_face", "lodge_visit"]),
      occurred_on: iso(daysAgo(int(1, 420))), summary: pick(["Caught up with the Lodge Mentor about new members.", "Discussed Personal Mentor arrangements for two candidates.", "Offered a mentoring evening for newer Brethren.", "Talked through the Royal Arch conversation with a newly raised Brother.", "Checked in after the installation meeting."]),
      outcome: pick(["No further action", "Follow-up agreed", "Training interest noted"]), owner_account_id: accounts[who], created_by: accounts[who], visibility: "ordinary" });
  }
  await must(db.from("contacts").insert(contacts), "contacts");
  await must(db.from("visits").insert([
    { org_id: O, lodge_id: lodges[0].id, planned_for: daysAhead(12).toISOString(), purpose: "Mentoring evening for newer Brethren", created_by: accounts.apgmen1 },
    { org_id: O, lodge_id: lodges[4].id, planned_for: daysAhead(30).toISOString(), purpose: "Annual mentoring conversation", created_by: accounts.apgmen1 },
    { org_id: O, lodge_id: lodges[9].id, planned_for: daysAgo(20).toISOString(), purpose: "Installation support", status: "completed", outcome: "Lodge Mentor confident; no further action.", created_by: accounts.apgmen2, completed_at: daysAgo(19).toISOString() },
  ]), "visits");
  await must(db.from("tasks").insert([
    { org_id: O, title: "Call new Lodge Mentor at Kestrel Lodge", owner_account_id: accounts.apgmen1, created_by: accounts.pgm, due_on: iso(daysAhead(5)), priority: "high", lodge_id: lodges[2].id, linked_type: "lodge", linked_id: lodges[2].id },
    { org_id: O, title: "Send Personal Mentor guide to Oakhurst Lodge", owner_account_id: accounts.apgmen1, created_by: accounts.apgmen1, due_on: iso(daysAgo(3)), lodge_id: lodges[4].id, linked_type: "lodge", linked_id: lodges[4].id },
    { org_id: O, title: "Confirm venue for spring workshop", owner_account_id: accounts.team, created_by: accounts.pgm, due_on: iso(daysAhead(14)) },
    { org_id: O, title: "Review Area B unconfirmed Lodge Mentors", owner_account_id: accounts.apgmen2, created_by: accounts.deputy, due_on: iso(daysAhead(9)) },
    { org_id: O, title: "Draft quarterly observations", owner_account_id: accounts.deputy, created_by: accounts.pgm, due_on: iso(daysAhead(21)) },
  ]), "tasks");

  const asUser = async (key: string) => {
    const c = createClient(URL, ANON, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email: secrets[key].email, password: PASSWORD });
    if (secrets[key].totpSecret) {
      const { data: fs } = await c.auth.mfa.listFactors();
      const f = fs!.totp[0];
      const { data: ch } = await c.auth.mfa.challenge({ factorId: f.id });
      await c.auth.mfa.verify({ factorId: f.id, challengeId: ch!.id, code: generateSync({ secret: secrets[key].totpSecret! }) });
    }
    return c;
  };
  // Cases go through the normal insert path so routing and references apply.
  const pgmClient = await asUser("pgm");
  for (const [li, cat, title] of [[0, "newer_brother", "Support for a recently initiated Brother"], [4, "personal_mentor_guidance", "Personal Mentor guidance for a new mentor"], [12, "training", "Lodge would like a mentoring workshop"], [20, "presentation", "Speaker for a mentoring evening"]] as const) {
    await must(pgmClient.from("cases").insert({ org_id: O, kind: "request", category_key: cat, title, description: "Synthetic example request.", lodge_id: lodges[li].id, requester_person_id: persons.pgm, requester_account_id: accounts.pgm }), "case");
  }
  await must(pgmClient.from("cases").insert({ org_id: O, kind: "confidential", category_key: "confidential", title: "Confidential concern (synthetic)", description: "Synthetic confidential concern used to test isolation.", lodge_id: lodges[0].id, requester_account_id: accounts.pgm, requester_person_id: persons.pgm }), "confidential case");
  await must(pgmClient.from("notes").insert([
    { org_id: O, subject_type: "lodge", subject_id: lodges[0].id, lodge_id: lodges[0].id, visibility: "ordinary", body: "Lodge has a strong Personal Mentor culture. (Synthetic note)", author_account_id: accounts.pgm },
    { org_id: O, subject_type: "lodge", subject_id: lodges[0].id, lodge_id: lodges[0].id, visibility: "leadership", body: "Leadership-only note about succession planning. (Synthetic)", author_account_id: accounts.pgm },
  ]), "notes");

  // Team ---------------------------------------------------------------------------------
  const meeting = await must(db.from("meetings").insert({ org_id: O, title: "Provincial Mentoring Team meeting", kind: "team", starts_at: daysAhead(18).toISOString(), ends_at: new Date(daysAhead(18).getTime() + 7200000).toISOString(), location: "Fleet House", created_by: accounts.pgm }).select("id").single(), "meeting") as { id: string };
  await must(db.from("meeting_agenda_items").insert([{ meeting_id: meeting.id, position: 1, title: "Welcome and apologies" }, { meeting_id: meeting.id, position: 2, title: "Lodge Mentor coverage by area" }, { meeting_id: meeting.id, position: 3, title: "Academy progress" }, { meeting_id: meeting.id, position: 4, title: "Any other business" }]), "agenda");
  await must(db.from("meeting_attendees").insert(["pgm", "deputy", "apgmen1", "apgmen2", "apgmen3", "apgmen4", "apgmen5", "team"].map((k) => ({ meeting_id: meeting.id, person_id: persons[k] }))), "attendees");
  await must(db.from("announcements").insert({ org_id: O, title: "Welcome to the Mentoring Hub", body: "This environment holds synthetic test data only.", pinned: true, created_by: accounts.pgm }), "announcement");

  // Academy -------------------------------------------------------------------------------
  await seedAcademy(O, accounts);

  // Events --------------------------------------------------------------------------------
  const ev = await must(db.from("events").insert([
    { org_id: O, title: "Lodge Mentor workshop", kind: "workshop", is_training: true, visibility: "lodge_mentors", format: "in_person", starts_at: at(daysAhead(21), 19), ends_at: at(daysAhead(21), 21), location: "Ashbury Masonic Centre", capacity: 24, status: "published", certificate_on_attendance: true, created_by: accounts.learninglead },
    { org_id: O, title: "Personal Mentor evening (online)", kind: "online_training", is_training: true, visibility: "learners", format: "online", starts_at: at(daysAhead(10), 19), ends_at: at(daysAhead(10), 20), capacity: 3, status: "published", created_by: accounts.learninglead },
    { org_id: O, title: "New Mason Evening", kind: "new_mason_evening", is_training: false, visibility: "learners", format: "in_person", starts_at: at(daysAhead(35), 19), ends_at: at(daysAhead(35), 21), location: "Colmere Masonic Centre", capacity: 60, status: "published", created_by: accounts.team },
    { org_id: O, title: "Provincial mentoring dinner", kind: "provincial_activity", visibility: "public", format: "in_person", starts_at: at(daysAhead(60), 19), ends_at: at(daysAhead(60), 23), location: "Fleet House", registration_mode: "external", external_provider: "octra_lodge", external_booking_url: "https://example.invalid/octra-booking", status: "published", created_by: accounts.team },
    { org_id: O, title: "APGMen meeting", kind: "apgmen_meeting", visibility: "internal", format: "online", starts_at: at(daysAhead(7), 19), ends_at: at(daysAhead(7), 20), registration_mode: "none", status: "published", created_by: accounts.pgm },
  ]).select("id,title"), "events") as { id: string; title: string }[];
  await must(db.from("event_joining_details").insert({ event_id: ev[1].id, online_url: "https://example.invalid/meeting/personal-mentor-evening", instructions: "Joining link opens ten minutes before the start." }), "joining");
  await must(db.from("event_trainers").insert([{ event_id: ev[0].id, person_id: persons.learninglead, display_name: "W Bro Gordon Aske", role: "presenter" }, { event_id: ev[1].id, person_id: persons.learninglead, display_name: "W Bro Gordon Aske", role: "presenter" }]), "trainers");

  // Documents and knowledge -----------------------------------------------------------------
  await seedLibrary(O, accounts, persons);

  // Templates, workflows, badges --------------------------------------------------------------
  await seedTemplatesAndWorkflows(O);

  writeFileSync(".seed-secrets.json", JSON.stringify({ orgId: O, lodges: lodges.map((l) => ({ id: l.id, number: l.number, name: l.name })), users: secrets }, null, 2));
  console.log(`Seeded: ${lodges.length} lodges, ${members.length} members, ${TEST_USERS.length} test accounts.`);
}

function at(d: Date, hour: number) { const x = new Date(d); x.setHours(hour, 0, 0, 0); return x.toISOString(); }

async function seedAcademy(O: string, accounts: Record<string, string>) {
  const NOTE = "Placeholder content. The Academy engine is complete; this lesson text stands in until approved Hertfordshire material is published.";
  const pathways = await must(db.from("pathways").insert([
    { org_id: O, slug: "lodge-mentor", title: "Lodge Mentor pathway", audience: "lodge_mentor", summary: "For Lodge Mentors co-ordinating mentoring in their Lodge.", position: 1, published: true },
    { org_id: O, slug: "personal-mentor", title: "Personal Mentor pathway", audience: "personal_mentor", summary: "For Brethren accompanying a candidate or new member.", position: 2, published: true },
    { org_id: O, slug: "newer-brother", title: "Newer Brother pathway", audience: "newer_brother", summary: "For Brethren in their first years of Freemasonry.", position: 3, published: true },
  ]).select("id,slug"), "pathways") as { id: string; slug: string }[];
  const pw = (s: string) => pathways.find((p) => p.slug === s)!.id;

  const COURSES: { slug: string; title: string; summary: string; audiences: string[]; pathway: string; level: string; principle: string; publish: boolean; stages?: string[] }[] = [
    { slug: "understanding-the-lodge-mentor-role", title: "Understanding the Lodge Mentor role", summary: "What the Lodge Mentor co-ordinates, and how the four principles shape the role.", audiences: ["lodge_mentor"], pathway: "lodge-mentor", level: "essential", principle: "prepare", publish: true },
    { slug: "supporting-personal-mentors", title: "Supporting Personal Mentors", summary: "Helping Personal Mentors feel prepared and confident.", audiences: ["lodge_mentor"], pathway: "lodge-mentor", level: "essential", principle: "support", publish: true },
    { slug: "knowing-when-to-ask-for-help", title: "Knowing when additional support is needed", summary: "Recognising when a conversation with the Provincial team would help.", audiences: ["lodge_mentor"], pathway: "lodge-mentor", level: "recommended", principle: "guide", publish: false },
    { slug: "welcoming-a-new-brother", title: "Welcoming a new Brother", summary: "The first weeks: friendship, reassurance and practical help.", audiences: ["personal_mentor"], pathway: "personal-mentor", level: "essential", principle: "support", publish: true },
    { slug: "understanding-lodge-structure", title: "Understanding Lodge structure and officers", summary: "Who does what in a Lodge, and who to ask.", audiences: ["newer_brother"], pathway: "newer-brother", level: "essential", principle: "enlighten", publish: true, stages: ["entered_apprentice", "fellow_craft"] },
  ];
  for (const c of COURSES) {
    const course = await must(db.from("courses").insert({ org_id: O, slug: c.slug, title: c.title, summary: c.summary, audiences: c.audiences,
      masonic_stages: c.stages ?? [], level: c.level, principle: c.principle, estimated_minutes: 25, is_placeholder_content: true, owner_account_id: accounts.learninglead }).select("id").single(), "course") as { id: string };
    const status = c.publish ? "published" : "draft";
    const v = await must(db.from("course_versions").insert({ org_id: O, course_id: course.id, version_no: 1, status, title: c.title, summary: c.summary,
      pass_mark: 75, completion_rule: "all_lessons_and_assessments", created_by: accounts.author,
      approved_by: c.publish ? accounts.learninglead : null, approved_at: c.publish ? new Date().toISOString() : null,
      published_by: c.publish ? accounts.learninglead : null, published_at: c.publish ? new Date().toISOString() : null }).select("id").single(), "version") as { id: string };
    if (c.publish) await must(db.from("courses").update({ published_version_id: v.id }).eq("id", course.id), "publish");
    await must(db.from("pathway_courses").insert({ pathway_id: pw(c.pathway), course_id: course.id, position: COURSES.indexOf(c), requirement: c.level === "essential" ? "essential" : "optional" }), "pathway course");

    const m1 = await must(db.from("course_modules").insert({ version_id: v.id, position: 1, title: "Getting started", summary: "Why this matters." }).select("id").single(), "module") as { id: string };
    const m2 = await must(db.from("course_modules").insert({ version_id: v.id, position: 2, title: "Putting it into practice", summary: "Practical approaches and a short check." }).select("id").single(), "module") as { id: string };
    await must(db.from("lessons").insert([
      { module_id: m1.id, position: 1, title: "Introduction", kind: "content", estimated_minutes: 5, content: { blocks: [
        { type: "callout", tone: "info", text: NOTE },
        { type: "text", markdown: `## ${c.title}\n\nMentoring in Hertfordshire is guided by four principles: **Prepare, Guide, Support, Enlighten**. They apply continuously, not as stages.\n\nThis short course takes about 25 minutes. You can stop at any point and pick up where you left off.` },
        { type: "principles" } ] } },
      { module_id: m1.id, position: 2, title: "A first conversation", kind: "scenario", estimated_minutes: 6, content: { blocks: [ { type: "callout", tone: "info", text: NOTE } ], scenario: {
        start: "a", nodes: {
          a: { text: "A Brother initiated three months ago tells you he has missed the last two meetings and isn't sure he's 'getting it'.", choices: [
            { label: "Ask how he is finding things, and listen.", next: "b", feedback: "A good start: 'How can we help?' rather than 'Why aren't you attending?'" },
            { label: "Remind him that attendance is expected.", next: "c", feedback: "This can feel like an assessment. Reassurance comes before information." } ] },
          b: { text: "He explains work has been busy and he felt lost at the last meeting. What next?", choices: [
            { label: "Offer to sit with him next time and explain what is happening.", next: "end", feedback: "Practical, friendly support. There should never be any surprises." },
            { label: "Suggest he reads the ritual book.", next: "end", feedback: "Learning helps, but company and explanation usually help more at this stage." } ] },
          c: { text: "He goes quiet and says he'll try. The conversation ends awkwardly.", choices: [ { label: "Try again with a different approach", next: "a" } ] },
          end: { text: "Well done. You have worked through the scenario.", choices: [] } } } } },
      { module_id: m2.id, position: 1, title: "Reflection", kind: "reflection", estimated_minutes: 5, content: { blocks: [
        { type: "callout", tone: "info", text: NOTE },
        { type: "text", markdown: "Think about a time someone helped you settle into something new. What made the difference? Your reflection is private to you." } ] } },
      { module_id: m2.id, position: 2, title: "Knowledge check", kind: "quiz", estimated_minutes: 5, is_assessment: true, max_attempts: 3, content: { blocks: [ { type: "text", markdown: "Three short questions. You need 75% to pass, and you can try again." } ] } },
    ]), "lessons");
    const quiz = await must(db.from("lessons").select("id").eq("module_id", m2.id).eq("kind", "quiz").single(), "quiz") as { id: string };
    const qs = await must(db.from("questions").insert([
      { lesson_id: quiz.id, position: 1, kind: "multiple", prompt: "Which are the four Hertfordshire mentoring principles?", options: [{ id: "a", text: "Prepare" }, { id: "b", text: "Guide" }, { id: "c", text: "Support" }, { id: "d", text: "Enlighten" }, { id: "e", text: "Assess" }] },
      { lesson_id: quiz.id, position: 2, kind: "true_false", prompt: "The principles are sequential stages that finish at the Third Degree.", options: [{ id: "t", text: "True" }, { id: "f", text: "False" }] },
      { lesson_id: quiz.id, position: 3, kind: "single", prompt: "A newer Brother has missed meetings. Which question fits the Hertfordshire approach?", options: [{ id: "a", text: "How can we help?" }, { id: "b", text: "Why aren't you attending?" }, { id: "c", text: "Have you paid your subscription?" }] },
    ]).select("id,position"), "questions") as { id: string; position: number }[];
    await must(db.from("question_keys").insert([
      { question_id: qs.find((q) => q.position === 1)!.id, correct: ["a", "b", "c", "d"], feedback_correct: "Exactly: Prepare, Guide, Support, Enlighten.", feedback_incorrect: "The four principles are Prepare, Guide, Support and Enlighten." },
      { question_id: qs.find((q) => q.position === 2)!.id, correct: ["f"], feedback_correct: "Right. They apply continuously throughout a member's journey.", feedback_incorrect: "They are not sequential stages; they apply continuously." },
      { question_id: qs.find((q) => q.position === 3)!.id, correct: ["a"], feedback_correct: "Yes: 'How can we help?', never 'Why aren't you attending?'", feedback_incorrect: "The house phrase is 'How can we help?', never 'Why aren't you attending?'" },
    ]), "keys");
  }
  await must(db.from("badges").insert([
    { org_id: O, key: "first-course", name: "First steps", description: "Completed your first Academy course", criteria: { courses_completed: 1 } },
    { org_id: O, key: "lodge-mentor-essentials", name: "Lodge Mentor essentials", description: "Completed the essential Lodge Mentor courses", criteria: { pathway_id: pw("lodge-mentor") } },
  ]), "badges");
  await must(db.from("solomon_resources").insert([
    { org_id: O, title: "Solomon: Mentoring resources", url: "https://solomon.ugle.org.uk/", description: "UGLE's learning platform. Link only; content remains on Solomon.", pathway_id: pw("lodge-mentor"), topics: ["mentoring"] },
    { org_id: O, title: "Solomon: First Degree learning", url: "https://solomon.ugle.org.uk/", description: "Explore the First Degree at your own pace on Solomon.", pathway_id: pw("newer-brother"), topics: ["first-degree"] },
  ]), "solomon");
}

async function seedLibrary(O: string, accounts: Record<string, string>, persons: Record<string, string>) {
  const cats = await must(db.from("document_categories").select("id,key").eq("org_id", O), "cats") as { id: string; key: string }[];
  const cat = (k: string) => cats.find((c) => c.key === k)!.id;
  const docs = [
    { reference: "A1", title: "The Hertfordshire Mentoring Principles", classification: "learning", category: "lm_guidance", requires_ack: false },
    { reference: "B1", title: "Lodge Mentor's Guide", classification: "mentors", category: "lm_guidance", requires_ack: true },
    { reference: "B2", title: "Personal Mentor's Guide", classification: "mentors", category: "pm_guidance", requires_ack: false },
    { reference: "W1", title: "Area coverage working paper", classification: "leadership", category: "working", requires_ack: false },
    { reference: "P1", title: "Meeting papers template", classification: "internal", category: "templates", requires_ack: false },
  ];
  for (const d of docs) {
    const doc = await must(db.from("documents").insert({ org_id: O, reference: d.reference, title: d.title, classification: d.classification, category_id: cat(d.category),
      owner_person_id: persons.pgm, requires_ack: d.requires_ack, review_on: iso(daysAhead(200)), summary: "Synthetic placeholder file standing in for the approved document." }).select("id").single(), "doc") as { id: string };
    const pdf = await PDFDocument.create(); const page = pdf.addPage([595, 842]); const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText(`${d.reference} ${d.title}`, { x: 50, y: 780, size: 18, font, color: rgb(0, 0.21, 0.41) });
    page.drawText("Synthetic placeholder for development and testing.", { x: 50, y: 750, size: 11, font });
    const bytes = await pdf.save();
    const path = `${O}/${doc.id}/v1/${d.reference}.pdf`;
    const { error } = await db.storage.from("documents").upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (error) throw error;
    const v = await must(db.from("document_versions").insert({ org_id: O, document_id: doc.id, version_no: 1, version_label: "Issue 1, October 2026", status: "published",
      storage_path: path, file_name: `${d.reference}.pdf`, mime_type: "application/pdf", size_bytes: bytes.length, created_by: accounts.pgm,
      approved_by: accounts.pgm, approved_at: new Date().toISOString(), published_by: accounts.pgm, published_at: new Date().toISOString() }).select("id").single(), "doc version") as { id: string };
    await must(db.from("documents").update({ current_version_id: v.id }).eq("id", doc.id), "doc current");
  }
  await must(db.from("knowledge_articles").insert([
    { org_id: O, slug: "what-does-a-personal-mentor-do", title: "What does a Personal Mentor do?", kind: "faq", audience: "learning", status: "published", body_markdown: "A Personal Mentor is the one-to-one friend and guide assigned to an individual member. (Synthetic article.)", published_at: new Date().toISOString() },
    { org_id: O, slug: "recording-a-contact", title: "Recording a contact quickly", kind: "guidance", audience: "internal", status: "published", body_markdown: "Use **Log contact** on the Lodge page. A one-line summary is enough. (Synthetic article.)", published_at: new Date().toISOString() },
    { org_id: O, slug: "example-buddy-evenings", title: "Example: buddy evenings for new members", kind: "good_practice", audience: "mentors", status: "published", anonymisation_confirmed: true, body_markdown: "One Lodge pairs each new member with a Brother for the Festive Board. (Synthetic anonymised example.)", published_at: new Date().toISOString() },
  ]), "knowledge");
}

async function seedTemplatesAndWorkflows(O: string) {
  await must(db.from("email_templates").insert([
    { org_id: O, key: "invitation", name: "Invitation", kind: "transactional", is_system: true, subject: "Your invitation to the {{org_short}} Mentoring Hub", body_markdown: "Dear {{first_name}},\n\nYou have been invited to the {{org_short}} Mentoring Hub.\n\n[Accept your invitation]({{link}})\n\nThis link expires in 7 days." },
    { org_id: O, key: "event_confirmation", name: "Event confirmation", kind: "transactional", is_system: true, subject: "You're booked: {{event_title}}", body_markdown: "Dear {{first_name}},\n\nYour place at **{{event_title}}** on {{event_date}} is confirmed.\n\n[View details]({{link}})" },
    { org_id: O, key: "event_waitlist", name: "Waiting list", kind: "transactional", is_system: true, subject: "Waiting list: {{event_title}}", body_markdown: "Dear {{first_name}},\n\n{{event_title}} is full, so you are on the waiting list. We'll email you if a place comes up." },
    { org_id: O, key: "event_reminder", name: "Event reminder", kind: "transactional", is_system: true, subject: "Reminder: {{event_title}}", body_markdown: "Dear {{first_name}},\n\nA reminder that **{{event_title}}** is on {{event_date}}.\n\n[View details]({{link}})" },
    { org_id: O, key: "event_follow_up", name: "Event follow-up", kind: "transactional", is_system: true, subject: "Thank you for attending {{event_title}}", body_markdown: "Dear {{first_name}},\n\nThank you for coming. We'd value a minute of feedback.\n\n[Give feedback]({{link}})" },
    { org_id: O, key: "course_assigned", name: "Course invitation", kind: "transactional", is_system: true, subject: "A course for you: {{course_title}}", body_markdown: "Dear {{first_name}},\n\nYou have been invited to take **{{course_title}}** in the Herts Mentoring Academy.\n\n[Start learning]({{link}})" },
    { org_id: O, key: "course_reminder", name: "Course reminder", kind: "transactional", is_system: true, subject: "Pick up where you left off: {{course_title}}", body_markdown: "Dear {{first_name}},\n\nYou're part-way through **{{course_title}}**.\n\n[Continue learning]({{link}})" },
    { org_id: O, key: "digest", name: "Notification digest", kind: "transactional", is_system: true, subject: "Your {{period}} Mentoring Hub summary", body_markdown: "Dear {{first_name}},\n\n{{items}}\n\n[Open the Hub]({{link}})" },
    { org_id: O, key: "standard", name: "Standard branded layout", kind: "campaign", is_system: true, subject: "{{subject}}", body_markdown: "{{body}}" },
  ]), "templates");
  await must(db.from("workflows").insert([
    { org_id: O, name: "New Initiate: tell the allocated Assistant", description: "When an approved import records a new Initiate, notify the allocated APGMen and suggest a follow-up task. No email is sent to the member.", trigger_key: "member.initiated", enabled: true, is_system: true,
      actions: [{ type: "notify_allocated_apgmen", params: { title: "New Initiate in your area" } }, { type: "create_task", params: { title: "Welcome call to Lodge Mentor about a new Initiate", due_in_days: 14, owner: "allocated_apgmen" } }] },
    { org_id: O, name: "Lodge Mentor change: let the Assistant know", description: "Notify the allocated APGMen when a Lodge Mentor changes.", trigger_key: "lodge.mentor_changed", enabled: true, is_system: true,
      actions: [{ type: "create_task", params: { title: "Introductory call with the new Lodge Mentor", due_in_days: 21, owner: "allocated_apgmen" } }] },
    { org_id: O, name: "Course completed: congratulate", description: "In-app congratulations when a learner completes a course.", trigger_key: "course.completed", enabled: true, is_system: true,
      actions: [{ type: "notify_person", params: { title: "Course completed", body: "Well done. Your certificate is ready in My Certificates." } }] },
  ]), "workflows");
}

main().catch((e) => { console.error(e); process.exit(1); });
