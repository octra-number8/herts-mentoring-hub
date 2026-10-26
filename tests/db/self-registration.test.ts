import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { anon, as, count, lodge, secrets, service, user } from "../helpers";

vi.mock("server-only", () => ({}));

const letters = () => Array.from({ length: 6 }, () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]).join("");
const RUN = Date.now().toString(36).toLowerCase();
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

/** A current member of a Lodge, as an approved import would hold him. */
async function member(opts: { email: string; lodgeNo?: number; status?: string; left?: boolean }) {
  const db = service();
  const { data: p, error } = await db.from("persons").insert({ org_id: secrets.orgId, first_name: "Selwyn", last_name: `Join${letters()}`,
    email: opts.email, status: opts.status ?? "active", source: "import" }).select("id").single();
  if (error) throw error;
  await db.from("lodge_memberships").insert({ org_id: secrets.orgId, person_id: p!.id, lodge_id: lodge(opts.lodgeNo ?? 9001).id, is_primary: true,
    joined_on: "2020-01-01", ...(opts.left ? { left_on: "2024-01-01", leaving_reason: "resigned" } : {}) });
  return p!.id as string;
}

describe("self-registration (/join)", () => {
  const db = service();

  it("gives a current member an invited Learner account and a 24-hour link by email", async () => {
    const { requestSelfRegistration } = await import("@/server/admin/invitations");
    const email = `join-${RUN}@example.test`;
    const personId = await member({ email });
    expect(await requestSelfRegistration(db as never, email.toUpperCase())).toBe("invited");

    const { data: acct } = await db.from("user_accounts").select("id, status").eq("person_id", personId).single();
    expect(acct!.status).toBe("invited");
    const { data: ras } = await db.from("role_assignments").select("roles(key)").eq("account_id", acct!.id);
    expect((ras as unknown as { roles: { key: string } }[]).map((r) => r.roles.key)).toEqual(["learner"]);
    const { data: inv } = await db.from("invitations").select("id, role_keys, expires_at, invited_by, email").eq("person_id", personId).single();
    expect(inv!.role_keys).toEqual(["learner"]);
    expect(inv!.invited_by).toBeNull();
    expect(inv!.email).toBe(email);
    const hours = (new Date(inv!.expires_at).getTime() - Date.now()) / 3600000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThan(24.1);
    const { data: mail } = await db.from("email_outbox").select("category, to_email, subject, text_body").eq("idempotency_key", `invitation:${inv!.id}`).single();
    expect(mail!.category).toBe("security");
    expect(mail!.to_email).toBe(email);
    expect(mail!.subject).toBe("Set up your Herts Mentoring Academy account");
    expect(mail!.text_body).toContain("/invite/");
    expect(mail!.text_body).toContain("24 hours");
    expect(await count(db, "audit_events", (q) => q.eq("entity_id", inv!.id).eq("action", "invitation.self_requested"))).toBe(1);

    // A second request within five minutes sends nothing new.
    expect(await requestSelfRegistration(db as never, email)).toBe("throttled");
    expect(await count(db, "invitations", (q) => q.eq("person_id", personId))).toBe(1);

    // After that, a new link replaces the old one and keeps any roles the team has added.
    await db.from("invitations").update({ created_at: new Date(Date.now() - 600_000).toISOString() }).eq("id", inv!.id);
    const { data: pm } = await db.from("roles").select("id").eq("org_id", secrets.orgId).eq("key", "personal_mentor").single();
    await db.from("role_assignments").insert({ org_id: secrets.orgId, account_id: acct!.id, role_id: pm!.id, reason: "test" });
    expect(await requestSelfRegistration(db as never, email)).toBe("invited");
    const { data: invs } = await db.from("invitations").select("revoked_at, role_keys").eq("person_id", personId).order("created_at");
    expect(invs![0].revoked_at).not.toBeNull();
    expect(invs![1].revoked_at).toBeNull();
    expect([...invs![1].role_keys].sort()).toEqual(["learner", "personal_mentor"]);
  });

  it("creates nothing for unknown addresses, former members, members with no Lodge or shared addresses", async () => {
    const { requestSelfRegistration } = await import("@/server/admin/invitations");
    expect(await requestSelfRegistration(db as never, `nobody-${RUN}@example.test`)).toBe("no_match");

    const resigned = `resigned-${RUN}@example.test`;
    await member({ email: resigned, status: "resigned" });
    expect(await requestSelfRegistration(db as never, resigned)).toBe("no_match");

    const left = `left-${RUN}@example.test`;
    await member({ email: left, left: true });
    expect(await requestSelfRegistration(db as never, left)).toBe("no_match");

    const shared = `shared-${RUN}@example.test`;
    const a = await member({ email: shared }), b = await member({ email: shared, lodgeNo: 9002 });
    expect(await requestSelfRegistration(db as never, shared)).toBe("shared_email");
    expect(await count(db, "user_accounts", (q) => q.in("person_id", [a, b]))).toBe(0);
  });

  it("reminds a member who already has an account how to sign in", async () => {
    const { requestSelfRegistration } = await import("@/server/admin/invitations");
    const { data: me } = await db.from("persons").select("email").eq("id", user("learner1").personId).single();
    await db.from("lodge_memberships").upsert({ org_id: secrets.orgId, person_id: user("learner1").personId, lodge_id: lodge(9003).id, joined_on: "2019-05-05" },
      { onConflict: "person_id,lodge_id,joined_on" });
    expect(await requestSelfRegistration(db as never, me!.email)).toBe("has_account");
    const { data: mail } = await db.from("email_outbox").select("subject, text_body").like("idempotency_key", `self-registration-existing:${user("learner1").personId}:%`).limit(1).single();
    expect(mail!.subject).toBe("You already have a Mentoring Hub account");
    expect(mail!.text_body).toContain("/forgot-password");
  });

  it("cannot be called by the public or by signed-in users", async () => {
    const args = { p_org: secrets.orgId, p_email: `x-${RUN}@example.test`, p_token_hash: hash(RUN) };
    const { error: e1 } = await anon().rpc("request_self_registration", args);
    expect(e1).not.toBeNull();
    const { error: e2 } = await (await as("pgm")).rpc("request_self_registration", args);
    expect(e2).not.toBeNull();
  });
});

describe("accounts follow membership status", () => {
  const db = service();

  it("suspends the account and withdraws links when a member leaves, and restores it if he returns", async () => {
    const { requestSelfRegistration } = await import("@/server/admin/invitations");
    const email = `leaver-${RUN}@example.test`;
    const personId = await member({ email });
    await requestSelfRegistration(db as never, email);

    await db.from("persons").update({ status: "resigned" }).eq("id", personId);
    const { data: a1 } = await db.from("user_accounts").select("status, status_reason").eq("person_id", personId).single();
    expect(a1).toEqual({ status: "suspended", status_reason: "Membership ended (resigned)" });
    expect(await count(db, "invitations", (q) => q.eq("person_id", personId).is("revoked_at", null))).toBe(0);

    await db.from("persons").update({ status: "active" }).eq("id", personId);
    const { data: a2 } = await db.from("user_accounts").select("status, status_reason").eq("person_id", personId).single();
    expect(a2).toEqual({ status: "invited", status_reason: null });
  });

  it("blocks sign-in for an active account whose member has died, and leaves suspensions by the team alone", async () => {
    const lr = user("learner2");
    await db.from("persons").update({ status: "deceased" }).eq("id", lr.personId);
    const c = await as("learner2");
    const { data: ctx } = await c.rpc("my_context");
    expect(ctx?.account_id ?? null).toBeNull();
    await db.from("persons").update({ status: "active" }).eq("id", lr.personId);
    expect((await db.from("user_accounts").select("status").eq("id", lr.accountId).single()).data!.status).toBe("active");

    await db.from("user_accounts").update({ status: "suspended", status_reason: "Suspended by the team" }).eq("id", lr.accountId);
    await db.from("persons").update({ status: "ceased" }).eq("id", lr.personId);
    await db.from("persons").update({ status: "active" }).eq("id", lr.personId);
    expect((await db.from("user_accounts").select("status").eq("id", lr.accountId).single()).data!.status).toBe("suspended");
    await db.from("user_accounts").update({ status: "active", status_reason: null }).eq("id", lr.accountId);
  });
});

describe("Lodge learning", () => {
  const db = service();
  const L1 = lodge(9001).id, L9 = lodge(9009).id;
  let personId = "";

  beforeAll(async () => {
    personId = await member({ email: `lodgelearner-${RUN}@example.test` });
    const { data: version } = await db.from("course_versions").select("id, course_id").eq("org_id", secrets.orgId).eq("status", "published").limit(1).single();
    const { error } = await db.from("enrolments").insert({ org_id: secrets.orgId, person_id: personId, course_id: version!.course_id, course_version_id: version!.id, status: "completed", completed_at: new Date().toISOString() });
    if (error) throw error;
  });
  afterAll(async () => {
    const pgm = await as("pgm");
    await pgm.rpc("feature_set_activation", { p_feature: "lodge_portal", p_scope: "account", p_target: user("lm1").accountId, p_actions: null, p_active: false, p_reason: "Lodge learning test complete" });
  });

  it("lists current members with account status and courses, without answers or reflections", async () => {
    const { data, error } = await (await as("learninglead")).rpc("lodge_learning", { p_lodge: L1 });
    expect(error).toBeNull();
    const row = data!.find((r: { person_id: string }) => r.person_id === personId);
    expect(row.account_status).toBeNull();
    expect(row.courses).toHaveLength(1);
    expect(row.courses[0].status).toBe("completed");
    expect(Object.keys(row.courses[0]).sort()).toEqual(["completed_at", "course_id", "lessons_completed", "lessons_required", "status", "title"]);
    expect(data!.every((r: { person_id: string }) => r.person_id)).toBe(true);
  });

  it("is visible to the APGMen for allocated Lodges only", async () => {
    const ap = await as("apgmen1");
    expect((await ap.rpc("lodge_learning", { p_lodge: L1 })).error).toBeNull();
    expect((await ap.rpc("lodge_learning", { p_lodge: L9 })).error).not.toBeNull();
    expect((await (await as("pgm")).rpc("lodge_learning", { p_lodge: L9 })).error).toBeNull();
  });

  it("is hidden from learners, Personal Mentors and the team, and from Lodge Mentors until the portal is activated", async () => {
    for (const k of ["learner1", "pm1", "team", "lm1"]) expect((await (await as(k)).rpc("lodge_learning", { p_lodge: L1 })).error, k).not.toBeNull();
    const pgm = await as("pgm");
    await pgm.rpc("feature_set_activation", { p_feature: "lodge_portal", p_scope: "account", p_target: user("lm1").accountId,
      p_actions: { read: true, create: false, update: false, export: false }, p_active: true, p_reason: "Lodge learning test" });
    const lm = await as("lm1");
    expect((await lm.rpc("lodge_learning", { p_lodge: L1 })).error).toBeNull();
    expect((await lm.rpc("lodge_learning", { p_lodge: lodge(9002).id })).error).not.toBeNull();
  });
});
