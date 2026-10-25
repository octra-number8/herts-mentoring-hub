import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { as, count, lodge, secrets, service, user } from "../helpers";

// apgmen1 is allocated Lodges 9001-9008; apgmen2 9009-9016. 9039/9040 are unallocated.
const MINE = () => lodge(9001).id;
const NOT_MINE = () => lodge(9012).id;

describe("Multi-factor authentication", () => {
  it("withholds every permission from a privileged account until MFA is verified", async () => {
    const c = await as("apgmen1", { mfa: false });
    const { data } = await c.rpc("my_context");
    expect(data.mfa_required).toBe(true);
    expect(data.aal).toBe("aal1");
    expect(data.permissions).toEqual([]);
    expect(await count(c, "lodges")).toBe(0);
  });

  it("grants the role's permissions once MFA is verified", async () => {
    const c = await as("apgmen1");
    const { data } = await c.rpc("my_context");
    expect(data.aal).toBe("aal2");
    expect(data.permissions).toContain("lodges.read");
    expect(await count(c, "lodges")).toBe(40);
  });
});

describe("Assistant Provincial Grand Mentor scope", () => {
  let apg: SupabaseClient;
  beforeAll(async () => { apg = await as("apgmen1"); });

  it("views ordinary Lodge information across the Province", async () => {
    expect(await count(apg, "lodges")).toBe(40);
    expect(await count(apg, "v_lodge_overview")).toBe(40);
  });

  it("edits allocated Lodges only", async () => {
    const ok = await apg.from("lodges").update({ meeting_pattern: "2nd Monday" }).eq("id", MINE()).select();
    expect(ok.data).toHaveLength(1);
    const no = await apg.from("lodges").update({ meeting_pattern: "Changed" }).eq("id", NOT_MINE()).select();
    expect(no.data ?? []).toHaveLength(0);
  });

  it("reads contacts only for allocated Lodges", async () => {
    const { data } = await apg.from("contacts").select("lodge_id");
    const mine = new Set(secrets.lodges.filter((l) => l.number <= 9008).map((l) => l.id));
    expect(data!.length).toBeGreaterThan(0);
    for (const r of data!) expect(mine.has(r.lodge_id)).toBe(true);
  });

  it("sees basic membership province-wide but detailed journeys only in allocated Lodges", async () => {
    const svc = service();
    const totalPeople = await count(svc, "persons");
    expect(await count(apg, "persons")).toBe(totalPeople);
    const { data: journeys } = await apg.from("v_member_overview").select("lodge_id, stage").not("stage", "is", null);
    const mine = new Set(secrets.lodges.filter((l) => l.number <= 9008).map((l) => l.id));
    expect(journeys!.length).toBeGreaterThan(0);
    for (const j of journeys!) expect(mine.has(j.lodge_id)).toBe(true);
  });

  it("cannot read leadership notes, even on an allocated Lodge", async () => {
    const { data } = await apg.from("notes").select("visibility").eq("subject_id", MINE());
    expect(data!.map((n) => n.visibility)).not.toContain("leadership");
  });

  it("cannot see confidential concerns, even about an allocated Lodge", async () => {
    expect(await count(apg, "cases", (q) => q.eq("kind", "confidential"))).toBe(0);
    const { data } = await apg.from("v_lodge_overview").select("open_requests").eq("id", MINE()).single();
    const svc = service();
    const ordinary = await count(svc, "cases", (q) => q.eq("lodge_id", MINE()).eq("kind", "request"));
    expect(data!.open_requests).toBe(ordinary);
  });

  it("receives ordinary support requests routed from allocated Lodges", async () => {
    const { data } = await apg.from("cases").select("owner_account_id, lodge_id").eq("lodge_id", MINE());
    expect(data!.length).toBeGreaterThan(0);
    expect(data!.every((c) => c.owner_account_id === user("apgmen1").accountId)).toBe(true);
  });

  it("cannot manage allocations or assign roles", async () => {
    const { error } = await apg.rpc("allocate_lodge", { p_lodge: NOT_MINE(), p_person: user("apgmen1").personId });
    expect(error).not.toBeNull();
    const { error: e2 } = await apg.from("role_assignments").insert({ org_id: secrets.orgId, account_id: user("apgmen1").accountId, role_id: (await service().from("roles").select("id").eq("key", "prov_grand_mentor").single()).data!.id });
    expect(e2).not.toBeNull();
  });
});

describe("Confidential concerns", () => {
  it("are visible to designated leadership triage", async () => {
    for (const k of ["pgm", "deputy"]) {
      const c = await as(k);
      expect(await count(c, "cases", (q) => q.eq("kind", "confidential"))).toBe(1);
    }
  });

  it("are not visible to the Provincial team, technical admin or Lodge-level views", async () => {
    for (const k of ["team", "techadmin", "learninglead"]) {
      const c = await as(k);
      expect(await count(c, "cases", (q) => q.eq("kind", "confidential")), k).toBe(0);
    }
  });

  it("cannot be re-labelled as an ordinary request", async () => {
    const pgm = await as("pgm");
    const { data: cc } = await pgm.from("cases").select("id").eq("kind", "confidential").single();
    const { error } = await pgm.from("cases").update({ kind: "request" }).eq("id", cc!.id);
    expect(error).not.toBeNull();
  });

  it("become visible to an assignee only through triage, and the grant is audited", async () => {
    const pgm = await as("pgm");
    const { data: cc } = await pgm.from("cases").select("id").eq("kind", "confidential").single();
    const apg2 = await as("apgmen2");
    expect(await count(apg2, "cases", (q) => q.eq("id", cc!.id))).toBe(0);
    const { error } = await pgm.rpc("case_triage", { p_case: cc!.id, p_action: "assign", p_owner: user("apgmen2").accountId, p_note: "Best placed to help" });
    expect(error).toBeNull();
    expect(await count(apg2, "cases", (q) => q.eq("id", cc!.id))).toBe(1);
    expect(await count(service(), "audit_events", (q) => q.eq("entity_type", "access_grants"))).toBeGreaterThan(0);
    // A different Assistant still cannot see it.
    const apg3 = await as("apgmen3");
    expect(await count(apg3, "cases", (q) => q.eq("id", cc!.id))).toBe(0);
  });
});

describe("Technical administrator", () => {
  it("maintains accounts without reading confidential mentoring information", async () => {
    const t = await as("techadmin");
    const { data } = await t.rpc("my_context");
    expect(data.permissions).toContain("admin.users");
    for (const table of ["cases", "notes", "contacts", "member_journeys", "visits", "tasks", "lodges"]) {
      expect(await count(t, table), table).toBe(0);
    }
  });
});

describe("Learning and Development contributor", () => {
  it("can author courses without unrelated Provincial access", async () => {
    const a = await as("author");
    const { data } = await a.rpc("my_context");
    expect(data.permissions).toEqual(expect.arrayContaining(["academy.author", "academy.learn"]));
    expect(data.permissions).not.toContain("hub.access_management");
    expect(await count(a, "lodges")).toBe(0);
    expect(await count(a, "persons")).toBe(1);
    expect(await count(a, "course_versions", (q) => q.eq("status", "draft"))).toBeGreaterThan(0);
  });

  it("cannot approve or publish", async () => {
    const a = await as("author");
    const { data: v } = await a.from("course_versions").select("id").eq("status", "draft").limit(1).single();
    await a.rpc("academy_transition_version", { p_version: v!.id, p_to: "review" });
    const { error } = await a.rpc("academy_transition_version", { p_version: v!.id, p_to: "approved" });
    expect(error).not.toBeNull();
    // Return it to draft for other tests.
    const lead = await as("learninglead");
    await lead.rpc("academy_transition_version", { p_version: v!.id, p_to: "draft", p_note: "test reset" });
  });

  it("cannot move a course's published pointer directly", async () => {
    const lead = await as("learninglead");
    const { data: c } = await lead.from("courses").select("id").not("published_version_id", "is", null).limit(1).single();
    const { error } = await lead.from("courses").update({ published_version_id: null }).eq("id", c!.id);
    expect(error).not.toBeNull();
  });
});

describe("Feature activation never widens permissions", () => {
  const svc = service();
  afterAll(async () => {
    await svc.from("feature_settings").update({ enabled: true }).eq("feature_key", "management");
    await svc.from("feature_activations").update({ active: false }).eq("account_id", user("learner1").accountId);
  });

  it("disabling a module removes it even from leadership", async () => {
    await svc.from("feature_settings").update({ enabled: false }).eq("feature_key", "management");
    const pgm = await as("pgm");
    expect(await count(pgm, "lodges")).toBe(0);
    await svc.from("feature_settings").update({ enabled: true }).eq("feature_key", "management");
    expect(await count(await as("pgm"), "lodges")).toBe(40);
  });

  it("activating the Lodge portal for someone without the role or appointment grants nothing", async () => {
    await svc.from("feature_activations").insert({ org_id: secrets.orgId, feature_key: "lodge_portal", scope_type: "account", account_id: user("learner1").accountId, actions: { read: true, create: true, update: true, export: true }, reason: "test" });
    const l = await as("learner1");
    expect(await count(l, "lodges")).toBe(0);
    const { data } = await l.rpc("my_context");
    expect(data.portal_lodge_ids).toEqual([]);
  });
});

describe("Scenario 14: future Lodge Mentor activation", () => {
  let pgm: SupabaseClient;
  let enrolmentsBefore = 0;
  beforeAll(async () => {
    pgm = await as("pgm");
    const lm = await as("lm1");
    const { data: course } = await lm.from("courses").select("id").not("published_version_id", "is", null).limit(1).single();
    await lm.rpc("academy_enrol", { p_course: course!.id });
    enrolmentsBefore = await count(lm, "enrolments");
  });

  it("is disabled for ordinary Lodge Mentor accounts by default", async () => {
    const lm = await as("lm1");
    const { data } = await lm.rpc("my_context");
    expect(data.permissions).toEqual(["academy.learn", "docs.read.mentors"]);
    expect(await count(lm, "lodges")).toBe(0);
    expect(await count(lm, "member_journeys")).toBe(0);
  });

  it("1-3. enabling for one user exposes their Lodge only", async () => {
    const { error } = await pgm.rpc("feature_set_activation", { p_feature: "lodge_portal", p_scope: "account", p_target: user("lm1").accountId,
      p_actions: { read: true, create: true, update: true, export: false }, p_active: true, p_reason: "Scenario 14 controlled test" });
    expect(error).toBeNull();
    const lm = await as("lm1");
    const { data: lodges } = await lm.from("lodges").select("id");
    expect(lodges!.map((l) => l.id)).toEqual([lodge(9001).id]);
    const { data: ctx } = await lm.rpc("my_context");
    expect(ctx.portal_lodge_ids).toEqual([lodge(9001).id]);
    // New-member mentoring information for their Lodge only
    const { data: journeys } = await lm.from("v_member_overview").select("lodge_id").not("stage", "is", null);
    expect(journeys!.length).toBeGreaterThan(0);
    expect(new Set(journeys!.map((j) => j.lodge_id))).toEqual(new Set([lodge(9001).id]));
    // Unrelated Lodges and Provincial records stay restricted
    expect(await count(lm, "lodges", (q) => q.eq("id", lodge(9002).id))).toBe(0);
    expect(await count(lm, "contacts")).toBe(0);
    expect(await count(lm, "notes")).toBe(0);
    expect(await count(lm, "cases", (q) => q.eq("kind", "confidential"))).toBe(0);
    expect(await count(lm, "lodge_allocations")).toBe(0);
    // Can raise a support request for their Lodge, and propose a change
    const { error: e1 } = await lm.from("cases").insert({ org_id: secrets.orgId, kind: "request", category_key: "training", title: "Portal request", lodge_id: lodge(9001).id, requester_account_id: user("lm1").accountId, source: "lodge_portal" });
    expect(e1).toBeNull();
    const { error: e2 } = await lm.from("cases").insert({ org_id: secrets.orgId, kind: "request", category_key: "training", title: "Other Lodge", lodge_id: lodge(9002).id, requester_account_id: user("lm1").accountId, source: "lodge_portal" });
    expect(e2).not.toBeNull();
    const { error: e3 } = await lm.from("lodge_change_proposals").insert({ org_id: secrets.orgId, lodge_id: lodge(9001).id, proposed_by: user("lm1").accountId, changes: { meeting_pattern: "3rd Monday" } });
    expect(e3).toBeNull();
    // Export not activated
    const { data: ctx2 } = await lm.rpc("my_context");
    expect(ctx2.permissions).not.toContain("lodge_portal.export");
  });

  it("4-5. disabling removes management access again", async () => {
    const { error } = await pgm.rpc("feature_set_activation", { p_feature: "lodge_portal", p_scope: "account", p_target: user("lm1").accountId, p_actions: null, p_active: false, p_reason: "Scenario 14 complete" });
    expect(error).toBeNull();
    const lm = await as("lm1");
    expect(await count(lm, "lodges")).toBe(0);
    expect(await count(lm, "member_journeys")).toBe(0);
    const { data } = await lm.rpc("my_context");
    expect(data.portal_lodge_ids).toEqual([]);
  });

  it("6. learning history is unaffected", async () => {
    const lm = await as("lm1");
    expect(await count(lm, "enrolments")).toBe(enrolmentsBefore);
    const { data } = await lm.rpc("my_context");
    expect(data.permissions).toContain("academy.learn");
  });

  it("can be activated Lodge by Lodge, reaching only that Lodge's current Lodge Mentor", async () => {
    await pgm.rpc("feature_set_activation", { p_feature: "lodge_portal", p_scope: "lodge", p_target: lodge(9002).id, p_actions: { read: true }, p_active: true, p_reason: "Lodge-level pilot" });
    const lm2 = await as("lm2");
    const { data } = await lm2.from("lodges").select("id");
    expect(data!.map((l) => l.id)).toEqual([lodge(9002).id]);
    const lm1 = await as("lm1");
    expect(await count(lm1, "lodges")).toBe(0);
    await pgm.rpc("feature_set_activation", { p_feature: "lodge_portal", p_scope: "lodge", p_target: lodge(9002).id, p_actions: null, p_active: false, p_reason: "Pilot ended" });
    expect(await count(await as("lm2"), "lodges")).toBe(0);
  });
});
