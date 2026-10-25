import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { as, count, lodge, secrets, service, user } from "../helpers";

vi.mock("server-only", () => ({}));

const APP = (process.env.APP_URL ?? "http://localhost:3100").replace(/\/$/, "");
const letters = () => Array.from({ length: 5 }, () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]).join("");
const RUN = Date.now().toString(36).toUpperCase();
const P = `X${RUN}-`;            // unique synthetic membership-number prefix
const S = `Qz${letters()}`;      // unique surname suffix (letters only)
const recentIso = new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10);
const recent = recentIso.split("-").reverse().join("/");
const csv = readFileSync("tests/fixtures/imports/scenario-11.csv", "utf8").replaceAll("{P}", P).replaceAll("{S}", S).replaceAll("{RECENT}", recent);

async function page(cookie: string, path: string) {
  return fetch(APP + path, { headers: { cookie }, redirect: "manual" });
}

describe("membership import: staging, decisions and commit (Scenarios 1 and 11)", () => {
  const svc = service();
  const L1 = lodge(9001).id;
  const ids: Record<string, string> = {};
  let batchId = "";
  const started = new Date().toISOString();

  beforeAll(async () => {
    // Existing members the report will meet: an update, an unchanged row, a conflict and an absentee.
    const people = [
      { k: "03", first_name: "Piers", last_name: `Haldane${S}`, email: "piers.old@example.test" },
      { k: "04", first_name: "Tobias", last_name: `Wrenfield${S}`, email: "tobias.wrenfield@example.test" },
      { k: "05", first_name: "Corwin", last_name: `Ashcombe${S}`, email: null },
      { k: "06", first_name: "Dunstan", last_name: `Merriweather${S}`, email: null },
    ];
    for (const p of people) {
      const { data, error } = await svc.from("persons").insert({ org_id: secrets.orgId, title: "Bro", first_name: p.first_name, last_name: p.last_name, email: p.email,
        membership_number: `${P}${p.k}`, status: "active", source: "import" }).select("id").single();
      if (error) throw error;
      ids[p.k] = data!.id;
      await svc.from("lodge_memberships").insert({ org_id: secrets.orgId, person_id: data!.id, lodge_id: L1, is_primary: true, joined_on: "2019-01-01", source: "import" });
    }
    await svc.from("degree_events").insert({ org_id: secrets.orgId, person_id: ids["04"], lodge_id: L1, kind: "initiation", event_date: "2020-05-06", source: "import" });
    await svc.from("degree_events").insert({ org_id: secrets.orgId, person_id: ids["03"], lodge_id: L1, kind: "initiation", event_date: "2019-02-02", source: "import" });
  });

  it("refuses imports to people without imports.run", async () => {
    const apg = await as("apgmen1");
    const { error } = await apg.from("import_batches").insert({ org_id: secrets.orgId, source: "hermes", file_name: "x.csv" });
    expect(error).not.toBeNull();
    const learner = await as("learner1");
    expect(await count(learner, "import_rows")).toBe(0);
    const { error: e2 } = await learner.rpc("import_commit", { p_batch: "00000000-0000-0000-0000-000000000000" });
    expect(e2).not.toBeNull();
  });

  it("stages a full report with every outcome", async () => {
    const { parseCsv } = await import("@/server/imports/parse");
    const { suggestMapping } = await import("@/server/imports/mapping");
    const { stageTable } = await import("@/server/imports/stage");
    const pgm = await as("pgm");
    const { data: b, error } = await pgm.from("import_batches").insert({ org_id: secrets.orgId, source: "hermes", file_name: `scenario-11-${RUN}.csv`, is_partial: false }).select("id").single();
    expect(error).toBeNull();
    batchId = b!.id;
    const table = parseCsv(csv);
    const stats = await stageTable(pgm as never, { batchId, table, mapping: suggestMapping(table.headers), isPartial: false });
    expect(stats).toMatchObject({ rows: 7, new: 2, update: 1, unchanged: 1, duplicate: 1, conflict: 1, invalid: 1, is_partial: false });

    const { data: rows } = await pgm.from("import_rows").select("id, row_no, outcome, decision, matched_person_id, diff").eq("batch_id", batchId).order("row_no");
    const by = (n: number) => rows!.find((r) => r.row_no === n)!;
    expect(by(3)).toMatchObject({ outcome: "update", matched_person_id: ids["03"] });
    expect((by(3).diff as Record<string, unknown>).email).toEqual({ from: "piers.old@example.test", to: "piers.new@example.test" });
    expect(by(4).outcome).toBe("unchanged");
    expect(by(5).outcome).toBe("duplicate");
    expect(by(6)).toMatchObject({ outcome: "conflict", matched_person_id: ids["05"] });
    expect(by(7)).toMatchObject({ outcome: "invalid", decision: "skip" });
    const removal = rows!.find((r) => r.outcome === "possible_removal" && r.matched_person_id === ids["06"]);
    expect(removal?.decision).toBe("pending");

    const { data: batch } = await pgm.from("import_batches").select("status").eq("id", batchId).single();
    expect(batch!.status).toBe("validated");
  });

  it("refuses to commit while decisions are pending, then commits only authoritative changes", async () => {
    const pgm = await as("pgm");
    const { error: pendingErr } = await pgm.rpc("import_commit", { p_batch: batchId });
    expect(pendingErr?.message).toMatch(/Resolve every/);

    // Decide: skip the duplicate and the conflict; send our absentee for review; skip other absentees (seeded members).
    await pgm.from("import_rows").update({ decision: "skip" }).eq("batch_id", batchId).in("outcome", ["duplicate", "conflict"]);
    await pgm.from("import_rows").update({ decision: "skip" }).eq("batch_id", batchId).eq("outcome", "possible_removal").neq("matched_person_id", ids["06"]);
    await pgm.from("import_rows").update({ decision: "accept" }).eq("batch_id", batchId).eq("matched_person_id", ids["06"]);

    const { data: res, error } = await pgm.rpc("import_commit", { p_batch: batchId });
    expect(error).toBeNull();
    expect(res).toMatchObject({ created: 2, updated: 1, review_tasks: 1 });
    expect(res.new_initiates).toBe(1);

    const db = service();
    // Scenario 11: an omission never changes status; a full report creates a review task instead.
    const { data: absent } = await db.from("persons").select("status").eq("id", ids["06"]).single();
    expect(absent!.status).toBe("active");
    expect(await count(db, "tasks", (q) => q.eq("linked_id", ids["06"]).like("title", "Check membership%"))).toBe(1);
    expect(await count(db, "lodge_memberships", (q) => q.eq("person_id", ids["06"]).is("left_on", null))).toBe(1);
    // The update applied; the conflict and invalid rows did not.
    const { data: upd } = await db.from("persons").select("email").eq("id", ids["03"]).single();
    expect(upd!.email).toBe("piers.new@example.test");
    const { data: conflict } = await db.from("persons").select("last_name").eq("id", ids["05"]).single();
    expect(conflict!.last_name).toBe(`Ashcombe${S}`);
    expect(await count(db, "persons", (q) => q.eq("membership_number", `${P}07`))).toBe(0);
    const { data: batch } = await db.from("import_batches").select("status, approved_by, stats").eq("id", batchId).single();
    expect(batch!.status).toBe("committed");
    expect(batch!.approved_by).toBe(user("pgm").accountId);
    expect(await count(db, "audit_events", (q) => q.eq("entity_id", batchId).eq("action", "import.committed"))).toBe(1);
  });

  it("Scenario 1: the new Initiate gets a Lodge link and journey; the Assistant is notified after the cron run; no email to the member", async () => {
    const db = service();
    const { data: person } = await db.from("persons").select("id, status").eq("membership_number", `${P}01`).single();
    expect(person).toBeTruthy();
    ids["01"] = person!.id;
    expect(await count(db, "lodge_memberships", (q) => q.eq("person_id", person!.id).eq("lodge_id", L1).is("left_on", null))).toBe(1);
    const { data: journey } = await db.from("member_journeys").select("stage").eq("person_id", person!.id).single();
    expect(journey!.stage).toBe("entered_apprentice");
    expect(await count(db, "degree_events", (q) => q.eq("person_id", person!.id).eq("kind", "initiation").eq("event_date", recentIso))).toBe(1);
    expect(await count(db, "domain_events", (q) => q.eq("type", "member.initiated").eq("entity_id", person!.id))).toBe(1);

    const cron = await fetch(`${APP}/api/cron/run`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    expect(cron.status).toBe(200);
    // The domain event may already have been processed by a concurrent run; either way it is done now.
    const { data: ev } = await db.from("domain_events").select("id, processed_at").eq("type", "member.initiated").eq("entity_id", person!.id).single();
    expect(ev!.processed_at).not.toBeNull();
    const { data: runs } = await db.from("workflow_runs").select("status, results, workflows!inner(trigger_key)").eq("domain_event_id", ev!.id);
    expect(runs!.some((r) => r.status === "succeeded")).toBe(true);
    const apgAccount = user("apgmen1").accountId;
    expect(await count(db, "notifications", (q) => q.eq("account_id", apgAccount).eq("type", "workflow:member.initiated").gte("created_at", started))).toBeGreaterThan(0);
    expect(await count(db, "email_outbox", (q) => q.eq("to_person_id", person!.id))).toBe(0);
  });

  it("a partial report never sends absentees for review", async () => {
    const { parseCsv } = await import("@/server/imports/parse");
    const { suggestMapping } = await import("@/server/imports/mapping");
    const { stageTable } = await import("@/server/imports/stage");
    const pgm = await as("pgm");
    const { data: b } = await pgm.from("import_batches").insert({ org_id: secrets.orgId, source: "hermes", file_name: `partial-${RUN}.csv`, is_partial: true }).select("id").single();
    const table = parseCsv(csv.split("\n").slice(0, 2).join("\n"));
    await stageTable(pgm as never, { batchId: b!.id, table, mapping: suggestMapping(table.headers), isPartial: true });
    const { data: removals } = await pgm.from("import_rows").select("decision").eq("batch_id", b!.id).eq("outcome", "possible_removal");
    expect(removals!.length).toBeGreaterThan(0);
    expect(removals!.every((r) => r.decision === "skip")).toBe(true);
    const { error } = await pgm.rpc("import_cancel", { p_batch: b!.id });
    expect(error).toBeNull();
    const { data: after } = await pgm.from("import_batches").select("status").eq("id", b!.id).single();
    expect(after!.status).toBe("cancelled");
  });
});

describe("invitations", () => {
  it("creates an invited account with roles, stores only the token hash and queues a security email", async () => {
    const { createInvitation, resendInvitation } = await import("@/server/admin/invitations");
    const pgm = await as("pgm");
    const email = `invitee-${RUN.toLowerCase()}@example.test`;
    const res = await createInvitation(pgm as never, service() as never, { firstName: "Rowan", lastName: `Kestell${letters()}`, title: "Bro", email, roles: ["lodge_mentor"] });
    const db = service();
    const { data: inv } = await db.from("invitations").select("token_hash, expires_at, role_keys, email, person_id").eq("id", res.invitation_id).single();
    expect(inv!.token_hash).toBe(createHash("sha256").update(res.token).digest("hex"));
    expect(inv!.token_hash).not.toContain(res.token);
    const days = (new Date(inv!.expires_at).getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
    expect(inv!.role_keys).toEqual(["lodge_mentor"]);
    const { data: acc } = await db.from("user_accounts").select("status, auth_user_id").eq("id", res.account_id).single();
    expect(acc).toMatchObject({ status: "invited", auth_user_id: null });
    const { data: ra } = await db.from("role_assignments").select("roles(key)").eq("account_id", res.account_id);
    expect(ra!.map((r) => (r.roles as unknown as { key: string }).key)).toEqual(["lodge_mentor"]);
    // A Lodge Mentor learner invitation never opens the portal.
    expect(await count(db, "feature_activations", (q) => q.eq("account_id", res.account_id))).toBe(0);
    const { data: mail } = await db.from("email_outbox").select("category, to_email, html").eq("idempotency_key", `invitation:${res.invitation_id}`).single();
    expect(mail).toMatchObject({ category: "security", to_email: email });
    expect(mail!.html).toContain(`/invite/${res.token}`);
    expect(await count(db, "audit_events", (q) => q.eq("entity_id", res.invitation_id).eq("action", "invitation.created"))).toBe(1);

    // The invitation page recognises the raw token.
    const pageRes = await fetch(`${APP}/invite/${res.token}`);
    expect(await pageRes.text()).toMatch(/Welcome, (<!-- -->)?Rowan/);

    // Resending revokes the old link.
    const again = await resendInvitation(pgm as never, service() as never, res.invitation_id);
    const { data: old } = await db.from("invitations").select("revoked_at").eq("id", res.invitation_id).single();
    expect(old!.revoked_at).not.toBeNull();
    expect(again.token).not.toBe(res.token);
    const { error: revokeErr } = await pgm.rpc("admin_revoke_invitation", { p_invitation: again.invitation_id });
    expect(revokeErr).toBeNull();
  });

  it("refuses invitations without admin.users, and leadership roles without admin.roles", async () => {
    const hash = "a".repeat(64);
    const learner = await as("learner1");
    const { error: e1 } = await learner.rpc("admin_create_invitation", { p_person: null as never, p_title: null as never, p_first: "A", p_last: "B", p_email: "a@example.test", p_roles: ["learner"], p_token_hash: hash, p_message: null as never });
    expect(e1).not.toBeNull();
    const tech = await as("techadmin");
    const { error: e2 } = await tech.rpc("admin_create_invitation", { p_person: null as never, p_title: null as never, p_first: "A", p_last: `B${letters()}`, p_email: `lead-${RUN.toLowerCase()}@example.test`, p_roles: ["prov_grand_mentor"], p_token_hash: hash, p_message: null as never });
    expect(e2?.message).toMatch(/leadership/);
    const { error: e3 } = await tech.rpc("admin_create_invitation", { p_person: null as never, p_title: null as never, p_first: "Tamsin", p_last: `Learner${letters()}`, p_email: `learner-${RUN.toLowerCase()}@example.test`, p_roles: ["learner"], p_token_hash: createHash("sha256").update(RUN + "t").digest("hex"), p_message: null as never });
    expect(e3).toBeNull();
  });
});

describe("Lodge Mentor portal activation (Scenario 14, UI level)", () => {
  const lm2 = user("lm2");
  const L2 = lodge(9002).id;
  const deactivate = async () => {
    const pgm = await as("pgm");
    await pgm.rpc("feature_set_activation", { p_feature: "lodge_portal", p_scope: "account", p_target: lm2.accountId, p_actions: {}, p_active: false, p_reason: "End of portal test" });
  };
  afterAll(deactivate);

  it("is a 404 until activated, works once activated, and is a 404 again after deactivation", async () => {
    const { cookieFor } = await import("../../scripts/smoke");
    await deactivate();
    expect((await page(await cookieFor("lm2"), "/portal")).status).toBe(404);
    expect((await page(await cookieFor("lm2"), `/portal/${L2}`)).status).toBe(404);

    const lm = await as("lm2");
    const { error: refused } = await lm.rpc("feature_set_activation", { p_feature: "lodge_portal", p_scope: "account", p_target: lm2.accountId, p_actions: { read: true }, p_active: true, p_reason: "Trying to activate myself" });
    expect(refused).not.toBeNull();

    const pgm = await as("pgm");
    const { error } = await pgm.rpc("feature_set_activation", { p_feature: "lodge_portal", p_scope: "account", p_target: lm2.accountId,
      p_actions: { read: true, create: true, update: true, approve: false, export: true }, p_active: true, p_reason: "Pilot agreed for test" });
    expect(error).toBeNull();

    const cookie = await cookieFor("lm2");
    const home = await page(cookie, "/portal");
    expect(home.status).toBe(307);
    expect(home.headers.get("location")).toContain(`/portal/${L2}`);
    for (const tab of ["", "?tab=members", "?tab=support", "?tab=activity"]) {
      const r = await page(cookie, `/portal/${L2}${tab}`);
      expect(r.status, tab).toBe(200);
      expect(await r.text()).not.toMatch(/Application error|Unhandled Runtime Error/);
    }
    expect((await page(cookie, `/portal/${lodge(9001).id}`)).status).toBe(404);
    const exp = await page(cookie, `/portal/${L2}/export`);
    expect(exp.status).toBe(200);
    expect(exp.headers.get("content-type")).toContain("text/csv");

    // Approved mentoring arrangements: writable for the portal Lodge only.
    const lmDb = await as("lm2");
    const { error: own } = await lmDb.from("lodge_mentoring_profiles").upsert({ lodge_id: L2, org_id: secrets.orgId, personal_mentors_for_new_members: "yes", arrangements: "Each Initiate meets his Personal Mentor before the ceremony." });
    expect(own).toBeNull();
    const { error: other } = await lmDb.from("lodge_mentoring_profiles").upsert({ lodge_id: lodge(9001).id, org_id: secrets.orgId, personal_mentors_for_new_members: "no" });
    expect(other).not.toBeNull();
    // Portal support request for their Lodge.
    const { error: req } = await lmDb.from("cases").insert({ org_id: secrets.orgId, kind: "request", category_key: "general_advice", title: "Help with a mentoring evening", lodge_id: L2,
      requester_account_id: lm2.accountId, requester_person_id: lm2.personId, source: "lodge_portal" });
    expect(req).toBeNull();

    await deactivate();
    const after = await cookieFor("lm2");
    expect((await page(after, `/portal/${L2}`)).status).toBe(404);
    expect((await page(after, "/portal")).status).toBe(404);
    // Academy access is untouched.
    expect((await page(after, "/academy")).status).toBe(200);
  });
});

describe("technical administrator", () => {
  it("maintains accounts and health without seeing mentoring records", async () => {
    const { cookieFor } = await import("../../scripts/smoke");
    const cookie = await cookieFor("techadmin");
    expect((await page(cookie, "/admin/users")).status).toBe(200);
    expect((await page(cookie, "/admin/health")).status).toBe(200);
    expect((await page(cookie, "/support")).status).toBe(404);
    expect((await page(cookie, "/members")).status).toBe(404);
    expect((await page(cookie, "/imports")).status).toBe(404);
    const tech = await as("techadmin");
    expect(await count(tech, "member_journeys")).toBe(0);
    expect(await count(tech, "cases")).toBe(0);
    expect(await count(tech, "contacts")).toBe(0);
    expect(await count(tech, "user_accounts")).toBeGreaterThan(5);
  });
});

describe("allocations", () => {
  it("allocates and ends an allocation; an Assistant cannot", async () => {
    const L40 = lodge(9040).id;
    const apg = await as("apgmen1");
    const { error: refused } = await apg.rpc("allocate_lodge", { p_lodge: L40, p_person: user("apgmen2").personId });
    expect(refused).not.toBeNull();
    const pgm = await as("pgm");
    const { data: allocId, error } = await pgm.rpc("allocate_lodge", { p_lodge: L40, p_person: user("apgmen2").personId, p_kind: "primary", p_reason: "Allocation test" });
    expect(error).toBeNull();
    const { error: endErr } = await pgm.rpc("end_allocation", { p_allocation: allocId, p_effective: new Date().toISOString().slice(0, 10) });
    expect(endErr).toBeNull();
    const { data: a } = await pgm.from("lodge_allocations").select("ends_on").eq("id", allocId).single();
    expect(a!.ends_on).not.toBeNull();
  });
});

describe("workflow dry run", () => {
  it("returns the steps without creating anything", async () => {
    const { dryRunWorkflow } = await import("@/server/workflows/engine");
    const pgm = await as("pgm");
    const { data: wf } = await pgm.from("workflows").select("id, name").eq("trigger_key", "member.initiated").eq("is_system", true).limit(1).single();
    const db = service();
    const since = new Date().toISOString();
    const res = await dryRunWorkflow(pgm as never, wf!.id);
    expect(res.event).not.toBeNull();
    expect(res.steps.length).toBeGreaterThan(0);
    expect(res.steps.every((s) => /^Would|^No one|^Skipped/.test(s.detail))).toBe(true);
    // Nothing this workflow would create exists as a result of the dry run.
    expect(await count(db, "tasks", (q) => q.gte("created_at", since).eq("description", `Created by workflow "${wf!.name}".`))).toBe(0);
    expect(await count(db, "notifications", (q) => q.gte("created_at", since).eq("type", "workflow:member.initiated"))).toBe(0);
    expect(await count(db, "workflow_runs", (q) => q.gte("created_at", since).eq("workflow_id", wf!.id))).toBe(0);

    const learner = await as("learner1");
    const { error } = await learner.rpc("workflow_run_retry", { p_run: "00000000-0000-0000-0000-000000000000" });
    expect(error).not.toBeNull();
  });
});

describe("account status", () => {
  it("suspension bans sign-in at the auth layer and reactivation restores it; never deletes the auth user", async () => {
    const { setAccountStatus } = await import("@/server/admin/accounts");
    const db = service();
    const email = `suspend-${RUN.toLowerCase()}@example.test`;
    const { data: created } = await db.auth.admin.createUser({ email, password: `Pw-${RUN}-long-enough`, email_confirm: true });
    const { data: person } = await db.from("persons").insert({ org_id: secrets.orgId, first_name: "Morwen", last_name: `Status${letters()}`, email, source: "invitation" }).select("id").single();
    const { data: acc } = await db.from("user_accounts").insert({ org_id: secrets.orgId, person_id: person!.id, auth_user_id: created.user!.id, status: "active" }).select("id").single();

    const learner = await as("learner1");
    const { error: refused } = await learner.rpc("account_set_status", { p_account: acc!.id, p_status: "suspended", p_reason: "Not allowed" });
    expect(refused).not.toBeNull();

    const pgm = await as("pgm");
    await setAccountStatus(pgm as never, db as never, acc!.id, "suspended", "Test suspension");
    const { data: banned } = await db.auth.admin.getUserById(created.user!.id);
    expect(new Date((banned.user as unknown as { banned_until: string }).banned_until).getTime()).toBeGreaterThan(Date.now());
    const { error: signIn } = await (await import("../helpers")).anon().auth.signInWithPassword({ email, password: `Pw-${RUN}-long-enough` });
    expect(signIn).not.toBeNull();

    await setAccountStatus(pgm as never, db as never, acc!.id, "active", "Test reactivation");
    const { data: restored } = await db.auth.admin.getUserById(created.user!.id);
    const until = (restored.user as unknown as { banned_until?: string | null }).banned_until;
    expect(!until || new Date(until).getTime() <= Date.now()).toBe(true);
    expect(await count(db, "audit_events", (q) => q.eq("entity_id", acc!.id).eq("action", "auth.sign_in_blocked"))).toBe(1);
  });
});
