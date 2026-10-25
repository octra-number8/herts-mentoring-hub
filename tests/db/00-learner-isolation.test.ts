/**
 * Brief 24.2 / Scenario 6: a Learning User must not reach another person's
 * learning history or any Provincial management information, whatever route
 * they try (direct table queries, views, RPCs, search, storage).
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { as, count, lodge, secrets, service, user } from "../helpers";

let learner: SupabaseClient;

const MANAGEMENT_TABLES = [
  "lodges", "lodge_appointments", "lodge_allocations", "lodge_mentoring_profiles", "lodge_reviews", "lodge_status_history",
  "areas", "meeting_centres", "provincial_appointments", "member_journeys", "degree_events", "contacts", "notes", "tasks",
  "visits", "cases", "case_events", "announcements", "meetings", "meeting_agenda_items", "campaigns", "campaign_recipients",
  "segments", "email_templates", "email_outbox", "import_batches", "import_rows", "import_templates", "workflows",
  "workflow_runs", "domain_events", "integrations", "integration_failures", "report_snapshots", "quarterly_reports",
  "audit_events", "invitations", "permission_grants", "access_grants", "retention_policies",
  "v_lodge_overview", "v_event_attendance",
];

beforeAll(async () => {
  learner = await as("learner1");
});

describe("Learning User isolation", () => {
  it("sees only Academy permissions in their session context", async () => {
    const { data } = await learner.rpc("my_context");
    expect(data.permissions).toEqual(["academy.learn"]);
    expect(data.portal_lodge_ids).toEqual([]);
  });

  it.each(MANAGEMENT_TABLES)("reads no rows from %s", async (table) => {
    expect(await count(learner, table)).toBe(0);
  });

  it("sees feature activations only for their own account", async () => {
    const { data } = await learner.from("feature_activations").select("account_id");
    for (const r of data ?? []) expect(r.account_id).toBe(user("learner1").accountId);
  });

  it("sees only their own person record", async () => {
    const { data } = await learner.from("persons").select("id");
    expect(data!.map((r) => r.id)).toEqual([user("learner1").personId]);
  });

  it("sees only their own Lodge membership", async () => {
    const { data } = await learner.from("lodge_memberships").select("person_id");
    expect(new Set(data!.map((r) => r.person_id))).toEqual(new Set([user("learner1").personId]));
  });

  it("cannot see another learner's learning records", async () => {
    // Give learner2 an enrolment and certificate via the service role first.
    const svc = service();
    const { data: course } = await svc.from("courses").select("id,published_version_id").not("published_version_id", "is", null).limit(1).single();
    await svc.from("enrolments").upsert({ org_id: secrets.orgId, person_id: user("learner2").personId, course_id: course!.id, course_version_id: course!.published_version_id, source: "assigned" }, { onConflict: "person_id,course_version_id" });
    const other = (t: string, col = "person_id") => count(learner, t, (q) => q.eq(col, user("learner2").personId));
    expect(await other("enrolments")).toBe(0);
    expect(await other("certificates")).toBe(0);
    expect(await other("badge_awards")).toBe(0);
    expect(await other("reflections")).toBe(0);
    expect(await other("development_plans")).toBe(0);
    expect(await other("external_learning")).toBe(0);
    expect(await other("learner_profiles")).toBe(0);
    expect(await count(learner, "v_learning_records", (q) => q.neq("person_id", user("learner1").personId))).toBe(0);
    expect(await count(learner, "v_member_overview", (q) => q.neq("id", user("learner1").personId))).toBe(0);
  });

  it("cannot read assessment answer keys", async () => {
    expect(await count(learner, "question_keys")).toBe(0);
  });

  it("only sees published course versions", async () => {
    const { data } = await learner.from("course_versions").select("status");
    expect(data!.length).toBeGreaterThan(0);
    expect(new Set(data!.map((v) => v.status))).toEqual(new Set(["published"]));
  });

  it("cannot read mentor, internal or leadership documents", async () => {
    const { data } = await learner.from("documents").select("classification");
    expect(new Set(data!.map((d) => d.classification))).toEqual(new Set(["learning"]));
  });

  it("cannot download internal documents from storage by guessing the path", async () => {
    const svc = service();
    const { data: doc } = await svc.from("documents").select("id, current_version_id, document_versions!document_versions_document_id_fkey(storage_path)").eq("classification", "leadership").single();
    const path = (doc as any).document_versions[0].storage_path as string;
    const { data, error } = await learner.storage.from("documents").download(path);
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    const { data: signed } = await learner.storage.from("documents").createSignedUrl(path, 60);
    expect(signed).toBeNull();
  });

  it("finds nothing outside their permissions through global search", async () => {
    const { data } = await learner.rpc("search_all", { p_query: "Lodge" });
    const kinds = new Set((data ?? []).map((r: { kind: string }) => r.kind));
    for (const k of ["lodge", "person", "task", "meeting", "note", "case", "document"]) expect(kinds.has(k)).toBe(false);
  });

  it("is refused by management RPCs", async () => {
    const calls: [string, Record<string, unknown>][] = [
      ["report_generate_quarterly", { p_year: 2026, p_quarter: 3 }],
      ["import_commit", { p_batch: "00000000-0000-0000-0000-000000000000" }],
      ["allocate_lodge", { p_lodge: lodge(9001).id, p_person: user("learner1").personId }],
      ["record_lodge_appointment", { p_lodge: lodge(9001).id, p_office: "lodge_mentor", p_person: user("learner1").personId }],
      ["feature_set_activation", { p_feature: "lodge_portal", p_scope: "account", p_target: user("learner1").accountId, p_actions: { read: true }, p_active: true, p_reason: "self activation" }],
      ["academy_admin_enrol", { p_person: user("learner2").personId, p_course: "00000000-0000-0000-0000-000000000000" }],
      ["academy_issue_recognition", { p_person: user("learner1").personId, p_title: "Self", p_completed_on: "2026-01-01", p_reason: "I would like one" }],
      ["account_set_status", { p_account: user("learner2").accountId, p_status: "suspended", p_reason: "test" }],
      ["retention_run", { p_policy: "00000000-0000-0000-0000-000000000000" }],
      ["event_register_person", { p_event: "00000000-0000-0000-0000-000000000000", p_person: user("learner2").personId }],
    ];
    for (const [fn, args] of calls) {
      const { error } = await learner.rpc(fn, args);
      expect(error, fn).not.toBeNull();
    }
  });

  it("cannot write to management tables", async () => {
    const { error: e1 } = await learner.from("persons").insert({ org_id: secrets.orgId, first_name: "X", last_name: "Y" });
    expect(e1).not.toBeNull();
    const { data: upd } = await learner.from("lodges").update({ name: "Hacked" }).eq("id", lodge(9001).id).select();
    expect(upd ?? []).toHaveLength(0);
    const { error: e3 } = await learner.from("cases").insert({ org_id: secrets.orgId, kind: "confidential", category_key: "confidential", title: "x", requester_account_id: user("learner1").accountId });
    expect(e3).not.toBeNull();
    const { error: e4 } = await learner.from("certificates").insert({ org_id: secrets.orgId, person_id: user("learner1").personId, kind: "course", reference: "FAKE-1", title: "Fake", learner_name: "Me", completed_on: "2026-01-01" });
    expect(e4).not.toBeNull();
  });

  it("cannot mark their own enrolment complete directly", async () => {
    const { data: e } = await learner.from("enrolments").select("id").limit(1);
    if (e && e.length) {
      const { data } = await learner.from("enrolments").update({ status: "completed" }).eq("id", e[0].id).select();
      expect(data ?? []).toHaveLength(0);
    }
  });

  it("cannot read or alter another person's audit trail or accounts", async () => {
    const { data } = await learner.from("user_accounts").select("id");
    expect(data!.map((r) => r.id)).toEqual([user("learner1").accountId]);
  });
});
