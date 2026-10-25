/** Inserting and reading back in one statement (INSERT ... RETURNING) works for permitted users. */
import { describe, expect, it } from "vitest";
import { as, count, lodge, secrets, user } from "../helpers";

describe("insert returning", () => {
  it("returns new notes, tasks, cases, meetings, events, course versions", async () => {
    const apg = await as("apgmen1");
    const L = lodge(9001).id;
    const note = await apg.from("notes").insert({ org_id: secrets.orgId, subject_type: "lodge", subject_id: L, lodge_id: L, visibility: "ordinary", body: "Returning test", author_account_id: user("apgmen1").accountId }).select("id").single();
    expect(note.error).toBeNull();
    const task = await apg.from("tasks").insert({ org_id: secrets.orgId, title: "Returning test", lodge_id: L, owner_account_id: user("apgmen1").accountId }).select("id").single();
    expect(task.error).toBeNull();
    const kase = await apg.from("cases").insert({ org_id: secrets.orgId, kind: "request", category_key: "training", title: "Returning test", lodge_id: L }).select("id, reference").single();
    expect(kase.error).toBeNull();
    const pgm = await as("pgm");
    const meeting = await pgm.from("meetings").insert({ org_id: secrets.orgId, title: "Returning test", starts_at: new Date().toISOString() }).select("id").single();
    expect(meeting.error).toBeNull();
    const lead = await as("learninglead");
    const ev = await lead.from("events").insert({ org_id: secrets.orgId, title: "Returning test", kind: "workshop", starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + 3600000).toISOString() }).select("id").single();
    expect(ev.error).toBeNull();
    const author = await as("author");
    const course = await author.from("courses").insert({ org_id: secrets.orgId, slug: `returning-${Date.now()}`, title: "Returning test" }).select("id").single();
    expect(course.error).toBeNull();
    const v = await author.from("course_versions").insert({ org_id: secrets.orgId, course_id: course.data!.id, version_no: 1, title: "Returning test" }).select("id").single();
    expect(v.error).toBeNull();
  });

  it("does not widen read access for others", async () => {
    const learner = await as("learner1");
    expect(await count(learner, "tasks")).toBe(0);
    expect(await count(learner, "notes")).toBe(0);
    expect(await count(learner, "meetings")).toBe(0);
    expect(await count(learner, "cases")).toBe(0);
    const apg3 = await as("apgmen3");
    expect(await count(apg3, "notes", (q) => q.eq("body", "Returning test"))).toBe(0);
    expect(await count(apg3, "cases", (q) => q.eq("kind", "confidential"))).toBe(0);
  });
});

describe("event check-in codes", () => {
  it("are readable by organisers only", async () => {
    const svc = (await import("../helpers")).service();
    const { data: ev } = await svc.from("events").select("id").eq("title", "Lodge Mentor workshop").single();
    expect(await count(await as("learninglead"), "event_checkin_secrets", (q) => q.eq("event_id", ev!.id))).toBe(1);
    expect(await count(await as("lm1"), "event_checkin_secrets")).toBe(0);
    expect(await count(await as("learner1"), "event_checkin_secrets")).toBe(0);
  });
});
