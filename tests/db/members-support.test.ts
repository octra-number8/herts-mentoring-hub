import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { as, count, lodge, secrets, service, user } from "../helpers";
import { promptFilter } from "../../src/server/members/prompt";

// Members, support requests and confidential concerns, tasks, team meetings.
// apgmen1 is allocated Lodges 9001-9008; apgmen2 9009-9016. Each test creates what it needs.

const clients = new Map<string, SupabaseClient>();
/** Sign in once per user; retry once if a TOTP code was just used by another sign-in. */
async function signIn(key: string): Promise<SupabaseClient> {
  if (clients.has(key)) return clients.get(key)!;
  let c: SupabaseClient;
  try { c = await as(key); } catch { await new Promise((r) => setTimeout(r, 31000)); c = await as(key); }
  clients.set(key, c);
  return c;
}
const acct = (k: string) => user(k).accountId;
const stamp = () => `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
const ORG = () => secrets.orgId;
/**
 * Insert with a client-generated id. tasks, notes and meetings cannot be read back
 * in the same INSERT ... RETURNING (their read policies call definer functions that
 * look the row up), so the app generates ids the same way.
 */
async function insertWithId(c: SupabaseClient, table: string, row: Record<string, unknown>) {
  const id = crypto.randomUUID();
  const { error } = await c.from(table).insert({ ...row, id });
  return { data: error ? null : { id }, error };
}

async function memberOf(lodgeNumber: number): Promise<string> {
  const { data } = await service().from("lodge_memberships").select("person_id, persons!inner(is_restricted, status)")
    .eq("lodge_id", lodge(lodgeNumber).id).is("left_on", null).eq("persons.is_restricted", false).eq("persons.status", "active").limit(1).single();
  return data!.person_id;
}

let pgm: SupabaseClient, apg1: SupabaseClient, apg2: SupabaseClient, team: SupabaseClient, learner: SupabaseClient, lead: SupabaseClient;
beforeAll(async () => {
  pgm = await signIn("pgm");
  apg1 = await signIn("apgmen1");
  apg2 = await signIn("apgmen2");
  team = await signIn("team");
  learner = await signIn("learner1");
  lead = await signIn("learninglead");
});

describe("Members: mentoring journeys", () => {
  it("an Assistant sees journeys only for members of allocated Lodges, but basic details province-wide", async () => {
    const mine = new Set(secrets.lodges.filter((l) => l.number >= 9001 && l.number <= 9008).map((l) => l.id));
    const { data: journeys, error } = await apg1.from("member_journeys").select("person_id");
    expect(error).toBeNull();
    expect(journeys!.length).toBeGreaterThan(0);
    const { data: ms } = await service().from("lodge_memberships").select("person_id, lodge_id").in("person_id", journeys!.map((j) => j.person_id)).is("left_on", null);
    for (const j of journeys!) expect(ms!.filter((m) => m.person_id === j.person_id).some((m) => mine.has(m.lodge_id))).toBe(true);

    const outside = await memberOf(9012);
    expect(await count(apg1, "persons", (q) => q.eq("id", outside))).toBe(1);
    expect(await count(apg1, "member_journeys", (q) => q.eq("person_id", outside))).toBe(0);
    const { data: row } = await apg1.from("v_member_overview").select("stage, personal_mentor_allocated").eq("id", outside).single();
    expect(row!.stage).toBeNull();
    expect(row!.personal_mentor_allocated).toBeNull();
    // apgmen2 holds that Lodge and does see the journey, if one exists.
    const svcHas = await count(service(), "member_journeys", (q) => q.eq("person_id", outside));
    expect(await count(apg2, "member_journeys", (q) => q.eq("person_id", outside))).toBe(svcHas);
  });

  it("an Assistant can update a journey in an allocated Lodge and is refused elsewhere", async () => {
    const inside = await memberOf(9002);
    const outside = await memberOf(9012);
    const ok = await apg1.from("member_journeys").upsert({ org_id: ORG(), person_id: inside, stage: "fellow_craft", royal_arch: "informed", journey_status: "active", next_review_on: "2027-03-01" }, { onConflict: "person_id" }).select("stage, royal_arch");
    expect(ok.error).toBeNull();
    expect(ok.data![0]).toMatchObject({ stage: "fellow_craft", royal_arch: "informed" });
    const no = await apg1.from("member_journeys").upsert({ org_id: ORG(), person_id: outside, stage: "master_mason" }, { onConflict: "person_id" }).select("id");
    expect(no.error).not.toBeNull();
  });

  it("records a Personal Mentor allocation: Yes/No/Unknown with date and who confirmed it; the mentor's identity is optional", async () => {
    const inside = await memberOf(9003);
    const res = await apg1.from("member_journeys").upsert({
      org_id: ORG(), person_id: inside, personal_mentor_allocated: "yes", personal_mentor_confirmed_on: "2026-10-20",
      personal_mentor_confirmed_by: user("apgmen1").personId, personal_mentor_person_id: null, personal_mentor_review_on: "2027-04-20",
    }, { onConflict: "person_id" }).select("personal_mentor_allocated, personal_mentor_confirmed_on, personal_mentor_confirmed_by, personal_mentor_person_id");
    expect(res.error).toBeNull();
    expect(res.data![0]).toMatchObject({ personal_mentor_allocated: "yes", personal_mentor_confirmed_on: "2026-10-20", personal_mentor_confirmed_by: user("apgmen1").personId, personal_mentor_person_id: null });
    const bad = await apg1.from("member_journeys").update({ personal_mentor_allocated: "maybe" }).eq("person_id", inside);
    expect(bad.error).not.toBeNull();
    // Learners and Provincial team members without write permission are refused.
    const t = await team.from("member_journeys").update({ personal_mentor_allocated: "no" }).eq("person_id", inside).select("id");
    expect(t.data ?? []).toHaveLength(0);
    expect(await count(learner, "member_journeys")).toBe(0);
    // Directory filter on the allocation works through the view.
    expect(await count(apg1, "v_member_overview", (q) => q.eq("id", inside).eq("personal_mentor_allocated", "yes"))).toBe(1);
  });

  it("records local corrections that imports will not overwrite, within the Assistant's scope only", async () => {
    const inside = await memberOf(9004);
    const outside = await memberOf(9012);
    const email = `corrected-${stamp()}@example.test`;
    const ok = await apg1.rpc("person_record_correction", { p_person: inside, p_field: "email", p_value: email, p_reason: "Confirmed by telephone" });
    expect(ok.error).toBeNull();
    const { data: p } = await service().from("persons").select("email, local_corrections").eq("id", inside).single();
    expect(p!.email).toBe(email);
    expect((p!.local_corrections as Record<string, { value: string; reason: string; by: string }>).email).toMatchObject({ value: email, reason: "Confirmed by telephone", by: acct("apgmen1") });
    const no = await apg1.rpc("person_record_correction", { p_person: outside, p_field: "email", p_value: email, p_reason: "Trying" });
    expect(no.error?.message).toMatch(/allocated/);
    const noReason = await apg1.rpc("person_record_correction", { p_person: inside, p_field: "phone", p_value: "01234", p_reason: "" });
    expect(noReason.error).not.toBeNull();
    const field = await apg1.rpc("person_record_correction", { p_person: inside, p_field: "membership_number", p_value: "1", p_reason: "Not allowed" });
    expect(field.error).not.toBeNull();
    expect((await learner.rpc("person_record_correction", { p_person: inside, p_field: "email", p_value: email, p_reason: "Nope" })).error).not.toBeNull();
    const cleared = await apg1.rpc("person_clear_correction", { p_person: inside, p_field: "email" });
    expect(cleared.error).toBeNull();
    const { data: p2 } = await service().from("persons").select("local_corrections").eq("id", inside).single();
    expect(p2!.local_corrections).not.toHaveProperty("email");
  });

  it("logs contacts and notes about a person; a mention notifies without granting access", async () => {
    const inside = await memberOf(9005);
    const c = await apg1.from("contacts").insert({ org_id: ORG(), person_id: inside, method: "telephone", summary: `Chat ${stamp()}`, owner_account_id: acct("apgmen1"), created_by: acct("apgmen1") }).select("id").single();
    expect(c.error).toBeNull();
    expect(await count(apg2, "contacts", (q) => q.eq("id", c.data!.id))).toBe(0);
    const n = await insertWithId(apg1, "notes", { org_id: ORG(), subject_type: "person", subject_id: inside, visibility: "ordinary", body: "Enjoying the Lodge", author_account_id: acct("apgmen1") });
    expect(n.error).toBeNull();
    expect((await apg1.from("note_mentions").insert({ note_id: n.data!.id, account_id: acct("apgmen2") })).error).toBeNull();
    expect(await count(service(), "notifications", (q) => q.eq("account_id", acct("apgmen2")).eq("type", "mention").eq("link", `/members/${inside}`))).toBeGreaterThan(0);
    expect(await count(apg2, "notes", (q) => q.eq("id", n.data!.id))).toBe(0);
    // An Assistant cannot write an ordinary note about someone outside his Lodges.
    const outside = await memberOf(9012);
    expect((await insertWithId(apg1, "notes", { org_id: ORG(), subject_type: "person", subject_id: outside, visibility: "ordinary", body: "x", author_account_id: acct("apgmen1") })).error).not.toBeNull();
  });

  it("the progression prompt filter combines with other filters", async () => {
    const { data, error } = await pgm.from("v_member_overview").select("id, initiated_on, passed_on, raised_on, stage").eq("status", "active").not("stage", "is", null).or(promptFilter()).or("first_name.ilike.%a%,last_name.ilike.%a%");
    expect(error).toBeNull();
    for (const m of data!) {
      expect(m.raised_on).toBeNull();
      expect(m.passed_on || m.initiated_on).toBeTruthy();
    }
  });
});

describe("Support requests (Scenarios 3 and 4)", () => {
  it("creates a request for an allocated Lodge, routes it to the Assistant, updates, escalates and closes it", async () => {
    const lodgeId = lodge(9006).id;
    const title = `Help with a Personal Mentor evening ${stamp()}`;
    const created = await pgm.from("cases").insert({ org_id: ORG(), reference: "pending", kind: "request", category_key: "personal_mentor_guidance", title,
      lodge_id: lodgeId, requester_account_id: acct("pgm"), requester_person_id: user("pgm").personId, priority: "normal", source: "telephone" })
      .select("id, reference, owner_account_id, status, due_on").single();
    expect(created.error).toBeNull();
    const c = created.data!;
    expect(c.reference).toMatch(/^SR-\d{4}-\d{4,}$/);
    expect(c.owner_account_id).toBe(acct("apgmen1"));
    expect(c.status).toBe("assigned");
    expect(c.due_on).toBeTruthy();
    expect(await count(service(), "notifications", (q) => q.eq("account_id", acct("apgmen1")).eq("link", `/support/${c.id}`))).toBe(1);

    // The routed Assistant sees and works it; another Assistant cannot.
    expect(await count(apg2, "cases", (q) => q.eq("id", c.id))).toBe(0);
    const no = await apg2.from("cases").update({ status: "in_progress" }).eq("id", c.id).select("id");
    expect(no.data ?? []).toHaveLength(0);
    const upd = await apg1.from("cases").update({ status: "in_progress", priority: "high" }).eq("id", c.id).select("status");
    expect(upd.data![0].status).toBe("in_progress");
    expect((await apg1.from("case_events").insert({ org_id: ORG(), case_id: c.id, kind: "comment", body: "Spoke to the Secretary.", visible_to_requester: true, created_by: acct("apgmen1") })).error).toBeNull();
    // An action becomes a task linked to the case.
    const task = await insertWithId(apg1, "tasks", { org_id: ORG(), title: "Book the room", owner_account_id: acct("apgmen1"), linked_type: "case", linked_id: c.id, lodge_id: lodgeId, created_by: acct("apgmen1") });
    expect(task.error).toBeNull();
    expect((await insertWithId(apg2, "tasks", { org_id: ORG(), title: "x", linked_type: "case", linked_id: c.id, created_by: acct("apgmen2") })).error).not.toBeNull();

    // Escalate to the Provincial Grand Mentor.
    const esc = await apg1.rpc("case_escalate", { p_case: c.id, p_to_account: acct("pgm"), p_note: "Needs a Provincial visit" });
    expect(esc.error).toBeNull();
    expect(await count(service(), "notifications", (q) => q.eq("account_id", acct("pgm")).eq("type", "case_escalated").eq("link", `/support/${c.id}`))).toBe(1);
    expect((await apg2.rpc("case_escalate", { p_case: c.id, p_to_account: acct("apgmen2"), p_note: "x" })).error).not.toBeNull();

    // Close with an outcome; status history is recorded by the database.
    const close = await pgm.from("cases").update({ status: "resolved", outcome: "Visit arranged for March." }).eq("id", c.id).select("status, closed_at");
    expect(close.data![0].status).toBe("resolved");
    expect(close.data![0].closed_at).toBeTruthy();
    const { data: events } = await pgm.from("case_events").select("kind, data").eq("case_id", c.id).order("created_at");
    const statuses = events!.filter((e) => e.kind === "status_change").map((e) => (e.data as { to: string }).to);
    expect(statuses).toEqual(["in_progress", "escalated", "resolved"]);
    expect(events!.some((e) => e.kind === "escalation")).toBe(true);

    // Reopen clears the closure.
    const reopen = await apg1.from("cases").update({ status: "in_progress" }).eq("id", c.id).select("closed_at");
    expect(reopen.data![0].closed_at).toBeNull();
    // The Lodge overview counts it; requests never change kind.
    expect((await pgm.from("cases").update({ kind: "confidential" }).eq("id", c.id)).error).not.toBeNull();
    // Learners see nothing.
    expect(await count(learner, "cases")).toBe(0);
    expect(await count(learner, "case_events")).toBe(0);
  });

  it("refuses ordinary requests from people without case permissions", async () => {
    const r = await team.from("cases").insert({ org_id: ORG(), reference: "pending", kind: "request", category_key: "general_advice", title: "x", requester_account_id: acct("team") });
    expect(r.error).not.toBeNull();
    const l = await learner.from("cases").insert({ org_id: ORG(), reference: "pending", kind: "request", category_key: "general_advice", title: "x", requester_account_id: acct("learner1") });
    expect(l.error).not.toBeNull();
  });
});

describe("Confidential concerns", () => {
  it("accepts a concern from a Provincial team member, hides it from others, and lets leadership triage it", async () => {
    const lodgeId = lodge(9001).id;
    const before = (await apg1.from("v_lodge_overview").select("open_requests").eq("id", lodgeId).single()).data!.open_requests;
    const sub = await team.from("cases").insert({ org_id: ORG(), reference: "pending", kind: "confidential", category_key: "confidential", title: `Concern ${stamp()}`,
      description: "Details for leadership", lodge_id: lodgeId, requester_account_id: acct("team"), requester_person_id: user("team").personId }).select("id, reference, status, owner_account_id").single();
    expect(sub.error).toBeNull();
    const cc = sub.data!;
    expect(cc.reference).toMatch(/^CC-/);
    expect(cc.status).toBe("triage");
    expect(cc.owner_account_id).toBeNull();
    // Designated leadership are notified without content.
    const { data: notes } = await service().from("notifications").select("title, body").eq("account_id", acct("pgm")).eq("link", `/support/${cc.id}`);
    expect(notes).toHaveLength(1);
    expect(notes![0].body).not.toContain("Details for leadership");

    // Invisible to the allocated Assistant, other team users and learners, and to Lodge counts.
    expect(await count(apg1, "cases", (q) => q.eq("id", cc.id))).toBe(0);
    expect(await count(apg1, "case_events", (q) => q.eq("case_id", cc.id))).toBe(0);
    expect(await count(lead, "cases", (q) => q.eq("id", cc.id))).toBe(0);
    expect(await count(learner, "cases", (q) => q.eq("id", cc.id))).toBe(0);
    expect((await apg1.from("v_lodge_overview").select("open_requests").eq("id", lodgeId).single()).data!.open_requests).toBe(before);
    const search = await apg1.rpc("search_all", { p_query: "Concern" });
    expect(JSON.stringify(search.data ?? [])).not.toContain(cc.id);
    // A concern raised by someone else is invisible to the team member too.
    const other = await apg2.from("cases").insert({ org_id: ORG(), reference: "pending", kind: "confidential", category_key: "confidential", title: `Other ${stamp()}`,
      requester_account_id: acct("apgmen2") }).select("id").single();
    expect(other.error).toBeNull();
    expect(await count(team, "cases", (q) => q.eq("id", other.data!.id))).toBe(0);
    // Without the submit permission the confidential route is refused.
    expect((await learner.from("cases").insert({ org_id: ORG(), reference: "pending", kind: "confidential", category_key: "confidential", title: "x", requester_account_id: acct("learner1") })).error).not.toBeNull();

    // Only triage holders can triage.
    expect((await apg1.rpc("case_triage", { p_case: cc.id, p_action: "close", p_note: "x" })).error).not.toBeNull();
    expect((await team.rpc("case_triage", { p_case: cc.id, p_action: "close", p_note: "x" })).error).not.toBeNull();

    // Opening it is recorded.
    expect((await pgm.rpc("log_sensitive_access", { p_entity_type: "case", p_entity_id: cc.id })).error).toBeNull();
    expect(await count(service(), "audit_events", (q) => q.eq("action", "sensitive.viewed").eq("entity_id", cc.id).eq("actor_account_id", acct("pgm")))).toBeGreaterThan(0);

    // Assign with an access grant: the assignee now sees this concern only.
    const assign = await pgm.rpc("case_triage", { p_case: cc.id, p_action: "assign", p_owner: acct("apgmen1"), p_note: "Please speak to the Brother" });
    expect(assign.error).toBeNull();
    expect(await count(apg1, "cases", (q) => q.eq("id", cc.id))).toBe(1);
    expect(await count(apg1, "cases", (q) => q.eq("id", other.data!.id))).toBe(0);
    expect(await count(service(), "access_grants", (q) => q.eq("entity_id", cc.id).eq("account_id", acct("apgmen1")))).toBe(1);
    // Still never in the Lodge count or ordinary list for others.
    expect(await count(apg2, "cases", (q) => q.eq("id", cc.id))).toBe(0);
    expect((await apg1.from("v_lodge_overview").select("open_requests").eq("id", lodgeId).single()).data!.open_requests).toBe(before);
    // The requester sees only updates shared with them.
    await pgm.from("case_events").insert({ org_id: ORG(), case_id: cc.id, kind: "comment", body: "Internal only", created_by: acct("pgm") });
    await pgm.from("case_events").insert({ org_id: ORG(), case_id: cc.id, kind: "comment", body: "Thank you, we are on it", visible_to_requester: true, created_by: acct("pgm") });
    const { data: reqEvents } = await team.from("case_events").select("body").eq("case_id", cc.id);
    expect(reqEvents!.map((e) => e.body)).toEqual(["Thank you, we are on it"]);
    // Restricted notes: leadership only, on the case.
    const rn = await insertWithId(pgm, "notes", { org_id: ORG(), subject_type: "case", subject_id: cc.id, visibility: "restricted", body: "Restricted detail", author_account_id: acct("pgm") });
    expect(rn.error).toBeNull();
    expect(await count(apg1, "notes", (q) => q.eq("id", rn.data!.id))).toBe(0);
    expect(await count(team, "notes", (q) => q.eq("id", rn.data!.id))).toBe(0);
  });

  it("refers a concern through an existing procedure and records where", async () => {
    const sub = await team.from("cases").insert({ org_id: ORG(), reference: "pending", kind: "confidential", category_key: "confidential", title: `Welfare ${stamp()}`, requester_account_id: acct("team") }).select("id").single();
    expect((await pgm.rpc("case_triage", { p_case: sub.data!.id, p_action: "refer", p_note: "Handed over" })).error).not.toBeNull();
    const ref = await pgm.rpc("case_triage", { p_case: sub.data!.id, p_action: "refer", p_referred_to: "Provincial Grand Almoner (welfare procedure)", p_note: "Handed over" });
    expect(ref.error).toBeNull();
    const { data } = await pgm.from("cases").select("status, referred_to").eq("id", sub.data!.id).single();
    expect(data).toMatchObject({ status: "referred", referred_to: "Provincial Grand Almoner (welfare procedure)" });
  });
});

describe("Tasks", () => {
  it("runs a task lifecycle: create, comment, reassign with notification, complete", async () => {
    const t = await insertWithId(apg1, "tasks", { org_id: ORG(), title: `Ring the Secretary ${stamp()}`, owner_account_id: acct("apgmen1"), due_on: "2026-10-01", priority: "high", created_by: acct("apgmen1") });
    expect(t.error).toBeNull();
    const id = t.data!.id;
    expect((await apg1.from("task_comments").insert({ org_id: ORG(), task_id: id, body: "Left a message", created_by: acct("apgmen1") })).error).toBeNull();
    // Overdue view: open and past due.
    expect(await count(apg1, "tasks", (q) => q.eq("id", id).lt("due_on", "2026-10-25").in("status", ["open", "in_progress", "waiting"]))).toBe(1);
    // apgmen2 cannot see or change it yet.
    expect(await count(apg2, "tasks", (q) => q.eq("id", id))).toBe(0);
    const re = await apg1.from("tasks").update({ owner_account_id: acct("apgmen2") }).eq("id", id).select("owner_account_id");
    expect(re.data![0].owner_account_id).toBe(acct("apgmen2"));
    expect(await count(service(), "notifications", (q) => q.eq("account_id", acct("apgmen2")).eq("type", "task_assigned").eq("link", `/tasks/${id}`))).toBe(1);
    const done = await apg2.from("tasks").update({ status: "done" }).eq("id", id).select("status, completed_at, completed_by");
    expect(done.data![0]).toMatchObject({ status: "done", completed_by: acct("apgmen2") });
    expect(done.data![0].completed_at).toBeTruthy();
    // History is audited and visible to those with audit access only.
    expect(await count(pgm, "audit_events", (q) => q.eq("entity_type", "tasks").eq("entity_id", id))).toBeGreaterThanOrEqual(3);
    expect(await count(apg1, "audit_events", (q) => q.eq("entity_type", "tasks").eq("entity_id", id))).toBe(0);
    // Leadership with tasks.manage_all sees it.
    expect(await count(pgm, "tasks", (q) => q.eq("id", id))).toBe(1);
  });

  it("refuses a learner: no tasks, no comments, no creation", async () => {
    expect(await count(learner, "tasks")).toBe(0);
    expect(await count(learner, "task_comments")).toBe(0);
    const ins = await insertWithId(learner, "tasks", { org_id: ORG(), title: "x", owner_account_id: acct("learner1"), created_by: acct("learner1") });
    expect(ins.error).not.toBeNull();
    const { data: anyTask } = await service().from("tasks").select("id").limit(1).single();
    const upd = await learner.from("tasks").update({ status: "done" }).eq("id", anyTask!.id).select("id");
    expect(upd.data ?? []).toHaveLength(0);
    expect((await learner.from("task_comments").insert({ org_id: ORG(), task_id: anyTask!.id, body: "x", created_by: acct("learner1") })).error).not.toBeNull();
  });
});

describe("Team workspace", () => {
  it("creates a meeting with agenda, attendance, minutes and decisions; an action creates a linked task", async () => {
    const word = `Ravenglass${Date.now()}`;
    const m = await insertWithId(pgm, "meetings", { org_id: ORG(), title: `Team meeting ${stamp()}`, kind: "team", starts_at: "2026-11-20T18:30:00Z", location: "Provincial Office", online_url: "https://meet.example.test/abc", created_by: acct("pgm") });
    expect(m.error).toBeNull();
    const id = m.data!.id;
    const item = await pgm.from("meeting_agenda_items").insert({ meeting_id: id, position: 1, title: "Lodge Mentor coverage", presenter_person_id: user("apgmen1").personId, document_url: "https://example.test/paper.pdf" }).select("id").single();
    expect(item.error).toBeNull();
    expect((await pgm.from("meeting_agenda_items").insert({ meeting_id: id, position: 2, title: "Bad link", document_url: "javascript:alert(1)" })).error).not.toBeNull();
    expect((await pgm.from("meeting_attendees").insert([{ meeting_id: id, person_id: user("apgmen1").personId }, { meeting_id: id, person_id: user("team").personId }])).error).toBeNull();
    expect((await pgm.from("meeting_attendees").update({ attendance: "apologies" }).eq("meeting_id", id).eq("person_id", user("team").personId)).error).toBeNull();
    expect((await pgm.from("meetings").update({ minutes: `We discussed ${word} and agreed next steps.`, minutes_status: "draft" }).eq("id", id)).error).toBeNull();
    const approved = await pgm.from("meetings").update({ minutes_status: "approved", minutes_approved_by: acct("pgm") }).eq("id", id).select("minutes_status");
    expect(approved.data![0].minutes_status).toBe("approved");
    expect((await pgm.from("meeting_decisions").insert({ meeting_id: id, agenda_item_id: item.data!.id, decision: "Each Assistant to confirm coverage by December.", recorded_by: acct("pgm") })).error).toBeNull();

    // Action becomes a task linked to the meeting, in the owner's task list.
    const task = await insertWithId(pgm, "tasks", { org_id: ORG(), title: "Confirm coverage", owner_account_id: acct("apgmen1"), linked_type: "meeting", linked_id: id, due_on: "2026-12-01", created_by: acct("pgm") });
    expect(task.error).toBeNull();
    const { data: mine } = await apg1.from("tasks").select("id, linked_type, linked_id").eq("owner_account_id", acct("apgmen1")).eq("linked_type", "meeting").eq("linked_id", id);
    expect(mine).toHaveLength(1);

    // Team members read it; only meetings.manage may change it.
    expect(await count(team, "meetings", (q) => q.eq("id", id))).toBe(1);
    expect(await count(team, "meeting_decisions", (q) => q.eq("meeting_id", id))).toBe(1);
    const tm = await team.from("meetings").update({ minutes_status: "draft" }).eq("id", id).select("id");
    expect(tm.data ?? []).toHaveLength(0);
    expect((await insertWithId(team, "meetings", { org_id: ORG(), title: "x", kind: "team", starts_at: "2026-11-21T10:00:00Z" })).error).not.toBeNull();
    expect((await apg1.from("meeting_decisions").insert({ meeting_id: id, decision: "x" })).error).not.toBeNull();

    // Searchable meeting history via the generated tsvector.
    const found = await team.from("meetings").select("id").textSearch("search", word, { type: "websearch", config: "english" });
    expect(found.data!.map((r) => r.id)).toContain(id);

    // Learners see nothing of it.
    expect(await count(learner, "meetings")).toBe(0);
    expect(await count(learner, "meeting_agenda_items")).toBe(0);
  });

  it("hides leadership meetings except from leadership and those invited", async () => {
    const m = await insertWithId(pgm, "meetings", { org_id: ORG(), title: `Leadership ${stamp()}`, kind: "leadership", starts_at: "2026-11-25T18:30:00Z", created_by: acct("pgm") });
    expect(m.error).toBeNull();
    expect(await count(apg1, "meetings", (q) => q.eq("id", m.data!.id))).toBe(0);
    expect(await count(team, "meetings", (q) => q.eq("id", m.data!.id))).toBe(0);
    await pgm.from("meeting_attendees").insert({ meeting_id: m.data!.id, person_id: user("apgmen1").personId });
    expect(await count(apg1, "meetings", (q) => q.eq("id", m.data!.id))).toBe(1);
  });

  it("posts announcements and team notes within their audiences", async () => {
    const a = await pgm.from("announcements").insert({ org_id: ORG(), title: "Leadership note", body: "For leadership", audience: "leadership", pinned: true, created_by: acct("pgm") }).select("id").single();
    expect(a.error).toBeNull();
    expect(await count(apg1, "announcements", (q) => q.eq("id", a.data!.id))).toBe(0);
    expect((await apg1.from("announcements").insert({ org_id: ORG(), title: "x", body: "x", audience: "team" })).error).not.toBeNull();
    const n = await insertWithId(team, "notes", { org_id: ORG(), subject_type: "general", visibility: "team", body: `Team note ${stamp()}`, author_account_id: acct("team") });
    expect(n.error).toBeNull();
    expect(await count(apg1, "notes", (q) => q.eq("id", n.data!.id))).toBe(1);
    expect(await count(learner, "notes", (q) => q.eq("id", n.data!.id))).toBe(0);
    expect((await team.from("notes").insert({ org_id: ORG(), subject_type: "general", visibility: "leadership", body: "x", author_account_id: acct("team") })).error).not.toBeNull();
  });
});
