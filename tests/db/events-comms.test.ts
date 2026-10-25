/**
 * Events (registration, waiting list, check-in, attendance, feedback, ICS and
 * calendar feeds) and communications (allocated scope, Province-wide approval,
 * sending through the outbox, exclusions). Scenario 9.
 */
import { createHash, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookieFor } from "../../scripts/smoke";
import { as, count, lodge, secrets, service, user } from "../helpers";

const APP = (process.env.APP_URL ?? "http://localhost:3100").replace(/\/$/, "");
const MAILPIT = "http://127.0.0.1:55424/api/v1";
const run = randomBytes(4).toString("hex");

let lead: SupabaseClient, learner1: SupabaseClient, learner2: SupabaseClient, pm1: SupabaseClient;
let eventId: string;
const regs: Record<string, string> = {};

const iso = (minutes: number) => new Date(Date.now() + minutes * 60000).toISOString();
const err = async (p: PromiseLike<{ error: { message: string } | null }>) => (await p).error?.message ?? null;

beforeAll(async () => {
  [lead, learner1, learner2, pm1] = [await as("learninglead"), await as("learner1"), await as("learner2"), await as("pm1")];
});

describe("Workshop registration, waiting list and attendance", () => {
  it("learning lead creates and publishes a workshop with capacity 2", async () => {
    const { data, error } = await lead.from("events").insert({
      org_id: secrets.orgId, title: `Test workshop ${run}`, kind: "workshop", is_training: true, visibility: "learners", format: "hybrid",
      starts_at: iso(60), ends_at: iso(180), capacity: 2, waitlist_enabled: true, registration_mode: "hub", status: "draft", feedback_enabled: true,
    }).select("id").single();
    expect(error).toBeNull();
    eventId = data!.id;
    expect(await err(lead.from("event_joining_details").insert({ event_id: eventId, online_url: "https://meet.example.org/abc", instructions: "Join five minutes early" }))).toBeNull();
    // Drafts are invisible to learners.
    expect(await count(learner1, "events", (q) => q.eq("id", eventId))).toBe(0);
    expect(await err(lead.from("events").update({ status: "published" }).eq("id", eventId))).toBeNull();
    expect(await count(learner1, "events", (q) => q.eq("id", eventId))).toBe(1);
  });

  it("learners cannot create events or register other people", async () => {
    const ins = await learner1.from("events").insert({ org_id: secrets.orgId, title: "Nope", kind: "workshop", starts_at: iso(60), ends_at: iso(90) }).select("id");
    expect(ins.error ?? (ins.data?.length === 0 ? null : "inserted")).not.toBeNull();
    expect(await err(learner1.rpc("event_register_person", { p_event: eventId, p_person: user("learner2").personId }))).toMatch(/not permitted/i);
  });

  it("registers three people: two confirmed, the third waitlisted", async () => {
    const r1 = await learner1.rpc("event_register", { p_event: eventId });
    expect(r1.error).toBeNull();
    expect(r1.data.status).toBe("confirmed");
    const r2 = await lead.rpc("event_register_person", { p_event: eventId, p_person: user("learner2").personId });
    expect(r2.data.status).toBe("confirmed");
    const r3 = await lead.rpc("event_register_person", { p_event: eventId, p_person: user("pm1").personId });
    expect(r3.data.status).toBe("waitlisted");
    expect(r3.data.waitlist_position).toBe(1);
    regs.learner1 = r1.data.registration_id;
    regs.learner2 = r2.data.registration_id;
    regs.pm1 = r3.data.registration_id;
    // Each learner sees only their own registration.
    const { data: own } = await learner1.from("registrations").select("person_id").eq("event_id", eventId);
    expect(own!.map((r) => r.person_id)).toEqual([user("learner1").personId]);
  });

  it("joining details are only visible with a confirmed place", async () => {
    expect(await count(learner1, "event_joining_details", (q) => q.eq("event_id", eventId))).toBe(1);
    expect(await count(pm1, "event_joining_details", (q) => q.eq("event_id", eventId))).toBe(0);
  });

  it("someone else cannot cancel a registration; cancelling promotes the waiting list", async () => {
    expect(await err(learner2.rpc("event_cancel_registration", { p_registration: regs.learner1 }))).toMatch(/not permitted/i);
    expect(await err(learner1.rpc("event_cancel_registration", { p_registration: regs.learner1 }))).toBeNull();
    const { data } = await service().from("registrations").select("status, waitlist_position").eq("id", regs.pm1).single();
    expect(data).toEqual({ status: "confirmed", waitlist_position: null });
    const { data: ev } = await service().from("domain_events").select("type").eq("entity_id", regs.pm1).eq("type", "event.waitlist_promoted");
    expect(ev!.length).toBe(1);
  });

  it("checks in with the session QR secret and refuses a wrong one", async () => {
    expect(await err(learner2.rpc("event_check_in_session", { p_event: eventId, p_secret: "wrong" }))).toMatch(/not valid/i);
    const { data: secret, error } = await lead.rpc("event_set_checkin", { p_event: eventId, p_open: true, p_rotate: true });
    expect(error).toBeNull();
    expect(await err(learner2.rpc("event_check_in_session", { p_event: eventId, p_secret: "0".repeat(32) }))).toMatch(/not valid/i);
    const ok = await learner2.rpc("event_check_in_session", { p_event: eventId, p_secret: secret });
    expect(ok.error).toBeNull();
    expect(ok.data.status).toBe("attended");
    // A cancelled registrant cannot check in with the code.
    expect(await err(learner1.rpc("event_check_in_session", { p_event: eventId, p_secret: secret }))).toMatch(/confirmed place/i);
  });

  it("checks in with a personal code; only organisers can use codes", async () => {
    const { data: reg } = await lead.from("registrations").select("checkin_code").eq("id", regs.pm1).single();
    expect(await err(learner2.rpc("event_check_in_code", { p_code: reg!.checkin_code }))).toMatch(/not permitted/i);
    const r = await lead.rpc("event_check_in_code", { p_code: reg!.checkin_code });
    expect(r.error).toBeNull();
    expect(r.data.status).toBe("attended");
    const { data } = await service().from("registrations").select("status, checkin_method").eq("id", regs.pm1).single();
    expect(data).toEqual({ status: "attended", checkin_method: "qr_personal" });
  });

  it("overrides attendance with a reason, recorded in the audit log", async () => {
    expect(await err(learner2.rpc("event_set_attendance", { p_registration: regs.pm1, p_status: "no_show", p_reason: "x" }))).toMatch(/not permitted/i);
    expect(await err(lead.rpc("event_set_attendance", { p_registration: regs.pm1, p_status: "no_show", p_reason: `Left before the start ${run}` }))).toBeNull();
    let { data } = await service().from("registrations").select("status, override_reason").eq("id", regs.pm1).single();
    expect(data).toEqual({ status: "no_show", override_reason: `Left before the start ${run}` });
    expect(await err(lead.rpc("event_set_attendance", { p_registration: regs.pm1, p_status: "attended", p_reason: "Signed the paper register" }))).toBeNull();
    ({ data } = await service().from("registrations").select("status, override_reason").eq("id", regs.pm1).single());
    expect(data!.status).toBe("attended");
    const audits = await count(service(), "audit_events", (q) => q.eq("action", "registration.attendance_override").eq("entity_id", regs.pm1));
    expect(audits).toBeGreaterThanOrEqual(2);
  });

  it("accepts feedback only from the attendee, after attendance", async () => {
    expect(await err(learner1.rpc("event_feedback", { p_registration: regs.learner1, p_rating: 4, p_comment: "x" }))).toMatch(/attendance is recorded/i);
    expect(await err(pm1.rpc("event_feedback", { p_registration: regs.learner2, p_rating: 1, p_comment: "x" }))).toMatch(/not permitted/i);
    expect(await err(learner2.rpc("event_feedback", { p_registration: regs.learner2, p_rating: 6, p_comment: "x" }))).toMatch(/1 to 5/);
    expect(await err(learner2.rpc("event_feedback", { p_registration: regs.learner2, p_rating: 5, p_comment: "Very helpful" }))).toBeNull();
    const { data } = await lead.from("registrations").select("feedback_rating, feedback_comment").eq("id", regs.learner2).single();
    expect(data).toEqual({ feedback_rating: 5, feedback_comment: "Very helpful" });
  });
});

describe("Calendar files and feeds", () => {
  let internalId: string;

  beforeAll(async () => {
    const { data } = await lead.from("events").insert({
      org_id: secrets.orgId, title: `Internal planning ${run}`, kind: "prov_meeting", visibility: "internal", status: "published",
      starts_at: iso(60 * 24 * 3), ends_at: iso(60 * 24 * 3 + 90), registration_mode: "none",
    }).select("id").single();
    internalId = data!.id;
  });

  it("the ICS route refuses an event the user cannot see", async () => {
    const learnerCookie = await cookieFor("learner1");
    const refused = await fetch(`${APP}/api/events/${internalId}/ics`, { headers: { cookie: learnerCookie }, redirect: "manual" });
    expect(refused.status).toBe(404);
    expect(await refused.text()).not.toContain(run);
    const own = await fetch(`${APP}/api/events/${eventId}/ics`, { headers: { cookie: learnerCookie }, redirect: "manual" });
    expect(own.status).toBe(200);
    const body = await own.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain(`Test workshop ${run}`);
    expect(body).not.toContain("meet.example.org"); // joining details never go into calendar files
  });

  it("the ICS route serves the internal event to the Provincial team", async () => {
    const res = await fetch(`${APP}/api/events/${internalId}/ics`, { headers: { cookie: await cookieFor("learninglead") }, redirect: "manual" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
  });

  it("signed-out visitors cannot download event files", async () => {
    const res = await fetch(`${APP}/api/events/${eventId}/ics`, { redirect: "manual" });
    expect([302, 307, 401]).toContain(res.status);
  });

  it("a private feed token works by hash, can be revoked, and shows only what its owner may see", async () => {
    const token = randomBytes(24).toString("base64url");
    const hash = createHash("sha256").update(token).digest("hex");
    // Users may only create tokens for themselves.
    expect(await err(learner2.from("calendar_feed_tokens").insert({ org_id: secrets.orgId, account_id: user("learner1").accountId, token_hash: hash }))).not.toBeNull();
    expect(await err(learner2.from("calendar_feed_tokens").insert({ org_id: secrets.orgId, account_id: user("learner2").accountId, token_hash: hash, label: "Test" }))).toBeNull();
    const res = await fetch(`${APP}/api/calendar/${token}.ics`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain(`Test workshop ${run}`);
    expect(body).not.toContain(`Internal planning ${run}`);
    // The feed function is not callable by users directly.
    expect(await err(learner2.rpc("calendar_feed_events", { p_token_hash: hash }))).not.toBeNull();
    expect((await fetch(`${APP}/api/calendar/${randomBytes(24).toString("base64url")}`)).status).toBe(404);
    await learner2.from("calendar_feed_tokens").update({ revoked_at: new Date().toISOString() }).eq("token_hash", hash);
    expect((await fetch(`${APP}/api/calendar/${token}`)).status).toBe(404);
  });
});

describe("Communications (Scenario 9)", () => {
  it("learners cannot read or create campaigns, segments or templates", async () => {
    expect(await count(learner1, "campaigns")).toBe(0);
    expect(await count(learner1, "email_templates")).toBe(0);
    const ins = await learner1.from("campaigns").insert({ org_id: secrets.orgId, title: "x", subject: "x", scope: "allocated", created_by: user("learner1").accountId }).select("id");
    expect(ins.error).not.toBeNull();
  });

  it("an allocated-scope campaign by apgmen2 only reaches people in apgmen2's allocated Lodges", async () => {
    const apg = await as("apgmen2");
    // Province scope is refused for an Assistant.
    const prov = await apg.from("campaigns").insert({ org_id: secrets.orgId, title: "x", subject: "x", scope: "province", created_by: user("apgmen2").accountId }).select("id");
    expect(prov.error).not.toBeNull();
    const outsider = (await service().from("lodge_memberships").select("person_id").eq("lodge_id", lodge(9001).id).is("left_on", null).limit(1).single()).data!.person_id;
    const { data: c, error } = await apg.from("campaigns").insert({
      org_id: secrets.orgId, title: `Allocated ${run}`, subject: "Hello", body_markdown: "Dear {{first_name}}", scope: "allocated", category: "operational",
      created_by: user("apgmen2").accountId, audience: { filters: {}, include: [outsider], exclude: [] },
    }).select("id").single();
    expect(error).toBeNull();
    const { data: audience, error: e2 } = await apg.rpc("campaign_preview_audience", { p_campaign: c!.id });
    expect(e2).toBeNull();
    expect(audience!.length).toBeGreaterThan(0);
    const svc = service();
    const today = new Date().toISOString().slice(0, 10);
    const { data: allocs } = await svc.from("lodge_allocations").select("lodge_id, starts_on, ends_on").eq("person_id", user("apgmen2").personId);
    const allocated = new Set(allocs!.filter((a) => a.starts_on <= today && (!a.ends_on || a.ends_on >= today)).map((a) => a.lodge_id));
    expect(allocated.has(lodge(9009).id)).toBe(true);
    expect(allocated.has(lodge(9001).id)).toBe(false);
    const ids = audience!.map((a: { person_id: string }) => a.person_id);
    expect(ids).not.toContain(outsider);
    const [{ data: mem }, { data: appts }] = await Promise.all([
      svc.from("lodge_memberships").select("person_id, lodge_id").in("person_id", ids).is("left_on", null),
      svc.from("lodge_appointments").select("person_id, lodge_id, ends_on").in("person_id", ids),
    ]);
    for (const id of ids) {
      const inScope = mem!.some((m) => m.person_id === id && allocated.has(m.lodge_id))
        || appts!.some((a) => a.person_id === id && allocated.has(a.lodge_id) && (!a.ends_on || a.ends_on >= today));
      expect(inScope, `person ${id} is outside the allocated Lodges`).toBe(true);
    }
    // Another Assistant cannot preview it, and apgmen2 cannot approve anything.
    const other = await as("apgmen1");
    expect(await err(other.rpc("campaign_preview_audience", { p_campaign: c!.id }))).toMatch(/not permitted/i);
    expect(await err(apg.rpc("campaign_decide", { p_campaign: c!.id, p_approve: true }))).toMatch(/not permitted/i);
    await apg.rpc("campaign_cancel", { p_campaign: c!.id });
  });

  it("a Province-wide campaign needs approval, is sent by the cron job, and respects exclusions", async () => {
    const pgm = await as("pgm");
    const deputy = await as("deputy");
    const subject = `Province update ${run}`;
    const svc = service();
    const { data: members } = await svc.from("lodge_memberships").select("person_id, persons!inner(email, status)").eq("lodge_id", lodge(9010).id).is("left_on", null);
    const withEmail = members!.filter((m) => (m.persons as unknown as { email: string | null; status: string }).email && (m.persons as unknown as { status: string }).status === "active");
    expect(withEmail.length).toBeGreaterThan(2);
    const excluded = withEmail[0].person_id;
    const excludedEmail = (withEmail[0].persons as unknown as { email: string }).email;
    const { data: c, error } = await pgm.from("campaigns").insert({
      org_id: secrets.orgId, title: `Province ${run}`, subject, body_markdown: "Dear {{first_name}},\n\nA short update.", scope: "province", category: "operational",
      created_by: user("pgm").accountId, audience: { filters: { lodge_ids: [lodge(9010).id] }, include: [], exclude: [excluded] },
    }).select("id").single();
    expect(error).toBeNull();

    // Preview shows the exclusion and its reason before sending.
    const { data: preview } = await pgm.rpc("campaign_preview_audience", { p_campaign: c!.id });
    expect(preview!.find((p: { person_id: string }) => p.person_id === excluded).excluded_reason).toBe("Manually excluded");

    const sub = await pgm.rpc("campaign_submit", { p_campaign: c!.id });
    expect(sub.error).toBeNull();
    expect(sub.data).toBe("pending_approval");
    // Only drafts can be edited by the sender once submitted.
    const edit = await pgm.from("campaigns").update({ subject: "changed" }).eq("id", c!.id).select("id");
    expect(edit.data ?? []).toHaveLength(0);
    // The Deputy approves.
    const dec = await deputy.rpc("campaign_decide", { p_campaign: c!.id, p_approve: true, p_note: "Approved" });
    expect(dec.error).toBeNull();
    expect(dec.data).toBe("approved");

    for (let i = 0; i < 6; i++) {
      const res = await fetch(`${APP}/api/cron/run`, { headers: { authorization: "Bearer local-cron-secret" } });
      expect(res.status).toBe(200);
      const queued = await count(svc, "campaign_recipients", (q) => q.eq("campaign_id", c!.id).eq("status", "queued"));
      if (queued === 0) break;
    }
    const { data: camp } = await svc.from("campaigns").select("status, sent_at").eq("id", c!.id).single();
    expect(camp!.status).toBe("sent");
    const { data: recips } = await svc.from("campaign_recipients").select("person_id, email, status, exclusion_reason").eq("campaign_id", c!.id);
    const ex = recips!.find((r) => r.person_id === excluded)!;
    expect(ex.status).toBe("excluded");
    expect(ex.exclusion_reason).toBe("Manually excluded");
    const sendable = recips!.filter((r) => r.status !== "excluded");
    expect(sendable.length).toBeGreaterThan(0);
    for (const r of sendable) expect(r.status).toBe("sent");

    const mail = await (await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`subject:"${subject}"`)}&limit=500`)).json() as { messages: { To: { Address: string }[] }[] };
    const to = new Set(mail.messages.flatMap((m) => m.To.map((t) => t.Address.toLowerCase())));
    for (const r of sendable) expect(to.has(r.email.toLowerCase()), `${r.email} received the campaign`).toBe(true);
    expect(to.has(excludedEmail.toLowerCase())).toBe(false);
    // A sent campaign cannot be cancelled.
    expect(await err(pgm.rpc("campaign_cancel", { p_campaign: c!.id }))).toMatch(/no longer be cancelled/i);
  });

  it("campaign attachments: only the draft's author can upload; senders and approvers can read", async () => {
    const pgm = await as("pgm");
    const { data: c } = await pgm.from("campaigns").insert({ org_id: secrets.orgId, title: `Attach ${run}`, subject: "x", scope: "province", created_by: user("pgm").accountId }).select("id").single();
    const path = `${secrets.orgId}/comms/${c!.id}/test-${run}.pdf`;
    const file = new Blob(["%PDF-1.4 test"], { type: "application/pdf" });
    expect((await pgm.storage.from("comms-attachments").upload(path, file)).error).toBeNull();
    const apg = await as("apgmen2");
    expect((await apg.storage.from("comms-attachments").upload(`${secrets.orgId}/comms/${c!.id}/other-${run}.pdf`, file)).error).not.toBeNull();
    expect((await learner1.storage.from("comms-attachments").download(path)).error).not.toBeNull();
    expect((await (await as("deputy")).storage.from("comms-attachments").download(path)).error).toBeNull();
    await pgm.rpc("campaign_cancel", { p_campaign: c!.id });
  });

  it("members request contact detail changes; the Provincial team is notified", async () => {
    expect(await err(learner1.rpc("account_request_contact_change", { p_details: "x" }))).toMatch(/describe/i);
    const { data: id, error } = await learner1.rpc("account_request_contact_change", { p_details: `New phone number ${run}` });
    expect(error).toBeNull();
    expect(await count(learner1, "contact_change_requests", (q) => q.eq("id", id))).toBe(1);
    expect(await count(learner2, "contact_change_requests", (q) => q.eq("id", id))).toBe(0);
    expect(await err(learner1.from("contact_change_requests").insert({ org_id: secrets.orgId, person_id: user("learner1").personId, details: "direct" }))).not.toBeNull();
    const notes = await count(service(), "notifications", (q) => q.eq("type", "details_change").like("dedupe_key", `details-change:${id}:%`));
    expect(notes).toBeGreaterThan(0);
  });

  it("unsubscribe tokens are only usable by the service role", async () => {
    const { data: pref } = await service().from("comm_preferences").select("unsubscribe_token").eq("person_id", user("learner2").personId).single();
    expect(await err(learner1.rpc("unsubscribe_by_token", { p_token: pref!.unsubscribe_token, p_scope: "news" }))).not.toBeNull();
  });
});
