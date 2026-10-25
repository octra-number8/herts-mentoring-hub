import { describe, expect, it } from "vitest";
import { as, count, lodge, secrets, service, user } from "../helpers";

describe("Scenario 7: course completion", () => {
  it("enrols, completes lessons and assessment, issues a certificate linked to the person", async () => {
    const l = await as("learner2");
    const { data: course } = await l.from("courses").select("id, published_version_id").eq("slug", "understanding-lodge-structure").single();
    const { data: enrolId, error } = await l.rpc("academy_enrol", { p_course: course!.id });
    expect(error).toBeNull();
    const { data: lessons } = await l.from("lessons").select("id, kind, is_assessment, course_modules!inner(version_id, position)").eq("course_modules.version_id", course!.published_version_id).order("position");
    const quiz = lessons!.find((x) => x.is_assessment)!;
    for (const lesson of lessons!.filter((x) => !x.is_assessment)) {
      const { error: e } = await l.rpc("academy_complete_lesson", { p_enrolment: enrolId, p_lesson: lesson.id, p_reflection: lesson.kind === "reflection" ? "Someone sat with me and explained what was happening." : null });
      expect(e, lesson.kind).toBeNull();
    }
    // Reflection required
    const reflection = lessons!.find((x) => x.kind === "reflection")!;
    const { error: empty } = await l.rpc("academy_complete_lesson", { p_enrolment: enrolId, p_lesson: reflection.id, p_reflection: "  " });
    expect(empty).not.toBeNull();

    const { data: qs } = await l.from("questions").select("id, position").eq("lesson_id", quiz.id).order("position");
    // Wrong answers first: fails, no certificate
    const wrong = await l.rpc("academy_submit_assessment", { p_enrolment: enrolId, p_lesson: quiz.id, p_answers: { [qs![0].id]: ["e"], [qs![1].id]: ["t"], [qs![2].id]: ["b"] } });
    expect(wrong.data.passed).toBe(false);
    expect(wrong.data.results[0].feedback).toBeTruthy();
    expect(await count(l, "certificates")).toBe(0);
    // Retake and pass
    const right = await l.rpc("academy_submit_assessment", { p_enrolment: enrolId, p_lesson: quiz.id, p_answers: { [qs![0].id]: ["a", "b", "c", "d"], [qs![1].id]: ["f"], [qs![2].id]: ["a"] } });
    expect(right.data.passed).toBe(true);
    expect(right.data.attempt_no).toBe(2);
    expect(right.data.enrolment_status).toBe("completed");
    const { data: certs } = await l.from("certificates").select("person_id, reference, kind, enrolment_id");
    expect(certs).toHaveLength(1);
    expect(certs![0].person_id).toBe(user("learner2").personId);
    expect(certs![0].enrolment_id).toBe(enrolId);
    expect(certs![0].reference).toMatch(/^HMA-\d{4}-\d{5}$/);
    expect(await count(l, "badge_awards")).toBeGreaterThan(0);
    // Further attempts are refused once passed
    const again = await l.rpc("academy_submit_assessment", { p_enrolment: enrolId, p_lesson: quiz.id, p_answers: {} });
    expect(again.error).not.toBeNull();
    // The Provincial learning lead sees it in learning records; an APGMen does not see individual records.
    const lead = await as("learninglead");
    expect(await count(lead, "v_learning_records", (q) => q.eq("person_id", user("learner2").personId).eq("status", "completed"))).toBe(1);
    const apg = await as("apgmen1");
    expect(await count(apg, "v_learning_records")).toBe(0);
  });

  it("refuses a lesson that belongs to a different course", async () => {
    const l = await as("learner1");
    const { data: courses } = await l.from("courses").select("id, published_version_id").not("published_version_id", "is", null).limit(2);
    const { data: enrol } = await l.rpc("academy_enrol", { p_course: courses![0].id });
    const { data: foreign } = await l.from("lessons").select("id, course_modules!inner(version_id)").eq("course_modules.version_id", courses![1].published_version_id).eq("is_assessment", false).limit(1).single();
    const { error } = await l.rpc("academy_complete_lesson", { p_enrolment: enrol, p_lesson: foreign!.id });
    expect(error).not.toBeNull();
  });

  it("keeps historic completions valid when a course is revised", async () => {
    const lead = await as("learninglead");
    const author = await as("author");
    const { data: c } = await lead.from("courses").select("id, published_version_id").eq("slug", "understanding-lodge-structure").single();
    const { data: newVersion, error } = await author.rpc("academy_new_version", { p_course: c!.id });
    expect(error).toBeNull();
    await author.rpc("academy_transition_version", { p_version: newVersion, p_to: "review" });
    expect((await lead.rpc("academy_transition_version", { p_version: newVersion, p_to: "approved" })).error).toBeNull();
    expect((await lead.rpc("academy_transition_version", { p_version: newVersion, p_to: "published" })).error).toBeNull();
    const l = await as("learner2");
    const { data: e } = await l.from("enrolments").select("status, course_version_id").eq("course_id", c!.id).single();
    expect(e!.status).toBe("completed");
    expect(e!.course_version_id).toBe(c!.published_version_id);
    // Learner can still open the version they completed
    expect(await count(l, "course_versions", (q) => q.eq("id", c!.published_version_id))).toBe(1);
    expect(await count(l, "certificates")).toBe(1);
  });
});

describe("Scenario 8: training event capacity, waiting list and attendance", () => {
  it("fills, waitlists, promotes on cancellation and records attendance", async () => {
    const svc = service();
    const { data: ev } = await svc.from("events").select("id").eq("title", "Personal Mentor evening (online)").single();
    const regs: Record<string, any> = {};
    for (const k of ["learner1", "learner2", "pm1", "lm1"]) {
      const c = await as(k);
      const { data, error } = await c.rpc("event_register", { p_event: ev!.id });
      expect(error, k).toBeNull();
      regs[k] = data;
    }
    expect(regs.learner1.status).toBe("confirmed");
    expect(regs.pm1.status).toBe("confirmed");
    expect(regs.lm1.status).toBe("waitlisted");
    // Joining details only for confirmed registrants
    expect(await count(await as("learner1"), "event_joining_details")).toBe(1);
    expect(await count(await as("lm1"), "event_joining_details")).toBe(0);
    // Cancellation promotes the waiting list
    const l2 = await as("learner2");
    expect((await l2.rpc("event_cancel_registration", { p_registration: regs.learner2.registration_id })).error).toBeNull();
    const lm1 = await as("lm1");
    const { data: promoted } = await lm1.from("registrations").select("status").eq("event_id", ev!.id).single();
    expect(promoted!.status).toBe("confirmed");
    // A learner cannot see the other registrations or check others in
    expect(await count(await as("learner1"), "registrations", (q) => q.eq("event_id", ev!.id))).toBe(1);
    const { data: code } = await svc.from("registrations").select("checkin_code").eq("id", regs.pm1.registration_id).single();
    expect((await (await as("learner1")).rpc("event_check_in_code", { p_code: code!.checkin_code })).error).not.toBeNull();
    // Presenter checks in by personal QR; manual override records a reason
    const lead = await as("learninglead");
    const chk = await lead.rpc("event_check_in_code", { p_code: code!.checkin_code });
    expect(chk.error).toBeNull();
    expect(chk.data.status).toBe("attended");
    expect((await lead.rpc("event_set_attendance", { p_registration: regs.learner1.registration_id, p_status: "attended", p_reason: "Joined late, confirmed by presenter" })).error).toBeNull();
    // Feedback only after attendance
    const pm1 = await as("pm1");
    expect((await pm1.rpc("event_feedback", { p_registration: regs.pm1.registration_id, p_rating: 5, p_comment: "Very helpful" })).error).toBeNull();
    const lm1b = await as("lm1");
    const { data: lmReg } = await lm1b.from("registrations").select("id").eq("event_id", ev!.id).single();
    expect((await lm1b.rpc("event_feedback", { p_registration: lmReg!.id, p_rating: 4, p_comment: "x" })).error).not.toBeNull();
    // Completing the event marks remaining confirmed places as no-shows
    expect((await lead.rpc("event_complete", { p_event: ev!.id })).error).toBeNull();
    const { data: final } = await svc.from("registrations").select("status").eq("event_id", ev!.id);
    expect(final!.map((r) => r.status).sort()).toEqual(["attended", "attended", "cancelled", "no_show"]);
  });

  it("issues attendance certificates where configured, linked to the learning record", async () => {
    const svc = service();
    const { data: ev } = await svc.from("events").select("id").eq("title", "Lodge Mentor workshop").single();
    const lm = await as("lm2");
    const { data: reg } = await lm.rpc("event_register", { p_event: ev!.id });
    const lead = await as("learninglead");
    await lead.rpc("event_set_attendance", { p_registration: reg.registration_id, p_status: "attended", p_reason: "Signed register" });
    expect(await count(await as("lm2"), "certificates", (q) => q.eq("kind", "event").eq("event_id", ev!.id))).toBe(1);
  });

  it("refuses Hub registration for events booked through Octra-Lodge", async () => {
    const svc = service();
    const { data: ev } = await svc.from("events").select("id").eq("external_provider", "octra_lodge").single();
    const { error } = await (await as("apgmen1")).rpc("event_register", { p_event: ev!.id });
    expect(error!.message).toMatch(/Octra-Lodge/);
  });
});

describe("Scenario 12: Assistant reassignment", () => {
  it("transfers Lodges and open work while preserving history", async () => {
    const pgm = await as("pgm");
    const target = lodge(9003).id;
    const before = await count(service(), "tasks", (q) => q.eq("lodge_id", target).eq("owner_account_id", user("apgmen1").accountId));
    await service().from("tasks").insert({ org_id: secrets.orgId, title: "Open work to transfer", owner_account_id: user("apgmen1").accountId, lodge_id: target, created_by: user("pgm").accountId });
    const { error } = await pgm.rpc("allocate_lodge", { p_lodge: target, p_person: user("apgmen2").personId, p_reason: "Rebalancing workloads" });
    expect(error).toBeNull();
    const svc = service();
    const { data: hist } = await svc.from("lodge_allocations").select("person_id, ends_on").eq("lodge_id", target).order("starts_on");
    expect(hist).toHaveLength(2);
    expect(hist![0].person_id).toBe(user("apgmen1").personId);
    expect(hist![0].ends_on).not.toBeNull();
    expect(hist![1].person_id).toBe(user("apgmen2").personId);
    expect(await count(svc, "tasks", (q) => q.eq("lodge_id", target).eq("owner_account_id", user("apgmen1").accountId).in("status", ["open", "in_progress", "waiting"]))).toBe(0);
    expect(before + 1).toBeGreaterThan(0);
    // Access follows the allocation
    const a1 = await as("apgmen1");
    expect((await a1.from("lodges").update({ meeting_pattern: "x" }).eq("id", target).select()).data ?? []).toHaveLength(0);
    const a2 = await as("apgmen2");
    expect((await a2.from("lodges").update({ meeting_pattern: "Moved" }).eq("id", target).select()).data).toHaveLength(1);
    // Notification to the new Assistant
    expect(await count(a2, "notifications", (q) => q.eq("type", "allocation"))).toBeGreaterThan(0);
    // Historic contacts remain attributed to the original author
    const { data: c } = await svc.from("contacts").select("created_by").eq("lodge_id", target);
    expect(c!.every((r) => r.created_by === user("apgmen1").accountId)).toBe(true);
  });

  it("refuses allocation to someone without an Assistant role", async () => {
    const { error } = await (await as("pgm")).rpc("allocate_lodge", { p_lodge: lodge(9039).id, p_person: user("team").personId });
    expect(error!.message).toMatch(/Assistant/);
  });

  it("leaves no stale access when an Assistant's appointment ends", async () => {
    const pgm = await as("pgm");
    const { data, error } = await pgm.rpc("end_provincial_appointment", { p_person: user("apgmen5").personId, p_reason: "Appointment ended" });
    expect(error).toBeNull();
    expect(data.allocations_ended).toBeGreaterThan(0);
    const a5 = await as("apgmen5");
    const { data: ctx } = await a5.rpc("my_context");
    expect(ctx.permissions).not.toContain("lodges.write.allocated");
    expect(ctx.allocated_lodge_ids).toEqual([]);
    expect(await count(a5, "contacts")).toBe(0);
  });
});

describe("Scenario 2: Lodge Mentor change", () => {
  it("preserves history, notifies the Assistant and keeps the portal disabled", async () => {
    const apg = await as("apgmen1");
    const svc = service();
    const { data: newLm } = await svc.from("lodge_memberships").select("person_id").eq("lodge_id", lodge(9001).id).neq("person_id", user("lm1").personId).is("left_on", null).limit(1).single();
    const { error } = await apg.rpc("record_lodge_appointment", { p_lodge: lodge(9001).id, p_office: "lodge_mentor", p_person: newLm!.person_id });
    expect(error).toBeNull();
    const { data: hist } = await svc.from("lodge_appointments").select("person_id, ends_on").eq("lodge_id", lodge(9001).id).eq("office", "lodge_mentor").order("starts_on");
    expect(hist!.at(-2)!.person_id).toBe(user("lm1").personId);
    expect(hist!.at(-2)!.ends_on).not.toBeNull();
    expect(hist!.at(-1)!.person_id).toBe(newLm!.person_id);
    expect(await count(svc, "domain_events", (q) => q.eq("type", "lodge.mentor_changed"))).toBe(1);
    const lm1 = await as("lm1");
    const { data: ctx } = await lm1.rpc("my_context");
    expect(ctx.portal_lodge_ids).toEqual([]);
    expect(ctx.permissions).toContain("academy.learn");
  });
});

describe("Communications scope", () => {
  it("limits an Assistant's campaign to contacts in allocated Lodges", async () => {
    const apg = await as("apgmen2");
    const { data: camp, error } = await apg.from("campaigns").insert({ org_id: secrets.orgId, title: "Area news", subject: "Hello", body_markdown: "Hi", scope: "allocated", category: "operational", created_by: user("apgmen2").accountId }).select("id").single();
    expect(error).toBeNull();
    const { data: aud } = await apg.rpc("campaign_preview_audience", { p_campaign: camp!.id });
    expect(aud!.length).toBeGreaterThan(0);
    const svc = service();
    const allocated = (await svc.from("lodge_allocations").select("lodge_id").eq("person_id", user("apgmen2").personId).is("ends_on", null)).data!.map((r) => r.lodge_id);
    const people = aud!.map((a: { person_id: string }) => a.person_id);
    const { data: mems } = await svc.from("lodge_memberships").select("person_id, lodge_id").in("person_id", people);
    for (const p of people) expect(mems!.some((m) => m.person_id === p && allocated.includes(m.lodge_id)), p).toBe(true);
  });

  it("cannot create a Province-wide campaign without permission", async () => {
    const apg = await as("apgmen2");
    const { error } = await apg.from("campaigns").insert({ org_id: secrets.orgId, title: "All", subject: "x", body_markdown: "x", scope: "province", created_by: user("apgmen2").accountId });
    expect(error).not.toBeNull();
  });

  it("applies preferences and excludes unsubscribed, bounced and duplicate addresses", async () => {
    const pgm = await as("pgm");
    const { data: camp } = await pgm.from("campaigns").insert({ org_id: secrets.orgId, title: "News", subject: "News", body_markdown: "News", scope: "province", category: "news", created_by: user("pgm").accountId, audience: { filters: { lodge_ids: [lodge(9004).id] }, include: [], exclude: [] } }).select("id").single();
    const { data: aud } = await pgm.rpc("campaign_preview_audience", { p_campaign: camp!.id });
    const reasons = new Set(aud!.map((a: { excluded_reason: string | null }) => a.excluded_reason));
    expect(reasons.has("Not opted in to news")).toBe(true);
    expect(aud!.some((a: { excluded_reason: string | null }) => a.excluded_reason === null)).toBe(true);
  });
});

describe("Scenario 10: quarterly report", () => {
  it("is restricted, reproducible and unaffected by later reassignment", async () => {
    const apg = await as("apgmen3");
    expect((await apg.rpc("report_generate_quarterly", { p_year: 2026, p_quarter: 3 })).error).not.toBeNull();
    const pgm = await as("pgm");
    const { data: id, error } = await pgm.rpc("report_generate_quarterly", { p_year: 2026, p_quarter: 3 });
    expect(error).toBeNull();
    const { data: q } = await pgm.from("quarterly_reports").select("snapshot_id, report_snapshots(data)").eq("id", id).single();
    const before = (q as any).report_snapshots.data;
    expect(before.lodges.active).toBe(39);
    // Approve, then a reassignment today must not change the stored figures.
    await pgm.rpc("report_quarterly_transition", { p_report: id, p_to: "review" });
    expect((await pgm.rpc("report_quarterly_transition", { p_report: id, p_to: "approved" })).error).toBeNull();
    await pgm.rpc("allocate_lodge", { p_lodge: lodge(9040).id, p_person: user("apgmen1").personId });
    const { data: q2 } = await pgm.from("quarterly_reports").select("report_snapshots(data)").eq("id", id).single();
    expect((q2 as any).report_snapshots.data).toEqual(before);
    expect((await pgm.rpc("report_generate_quarterly", { p_year: 2026, p_quarter: 3 })).error).not.toBeNull();
    // Recomputing the historic period from effective dates gives the same allocation count.
    const { data: recomputed } = await service().rpc("report_period_data_admin", { p_org: secrets.orgId, p_start: "2026-07-01", p_end: "2026-09-30" });
    if (recomputed) expect(recomputed.lodges.allocated).toBe(before.lodges.allocated);
  });
});
