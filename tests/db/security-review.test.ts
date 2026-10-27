import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { as, lodge, secrets, service, user } from "../helpers";

// Regression tests for the October 2026 security review (docs/security/security-review-2026-10.md).
const MINE = () => lodge(9001).id;
const NOT_MINE = () => lodge(9012).id;

describe("Accounts cannot be relinked through the API", () => {
  it("refuses a technical administrator's direct update of another account", async () => {
    const tech = await as("techadmin");
    const svc = service();
    const before = (await svc.from("user_accounts").select("auth_user_id, mfa_required, status").eq("id", user("pgm").accountId).single()).data!;
    const res = await tech.from("user_accounts").update({ auth_user_id: null, mfa_required: false }).eq("id", user("pgm").accountId).select("id");
    expect(res.error ?? (res.data?.length === 0 ? "no rows" : null)).toBeTruthy();
    const after = (await svc.from("user_accounts").select("auth_user_id, mfa_required, status").eq("id", user("pgm").accountId).single()).data!;
    expect(after).toEqual(before);
  });

  it("refuses a user's direct update of their own account", async () => {
    const learner = await as("learner1");
    const res = await learner.from("user_accounts").update({ status: "active", status_reason: "x" }).eq("id", user("learner1").accountId).select("id");
    expect(res.error ?? (res.data?.length === 0 ? "no rows" : null)).toBeTruthy();
  });
});

describe("Audit log does not reveal mentoring or support records to technical administrators", () => {
  const ids: string[] = [];
  beforeAll(async () => {
    const svc = service();
    const { data } = await svc.from("audit_events").insert([
      { org_id: secrets.orgId, action: "update", entity_type: "cases", entity_id: "review-test-case", details: { changes: { title: { from: "a", to: "b" } } } },
      { org_id: secrets.orgId, action: "update", entity_type: "lodges", entity_id: "review-test-lodge", details: {} },
    ]).select("id");
    ids.push(...(data ?? []).map((r) => r.id));
  });
  afterAll(async () => { if (ids.length) await service().from("audit_events").delete().in("id", ids); });

  it("hides case audit entries from a technical administrator but shows ordinary ones", async () => {
    const tech = await as("techadmin");
    const { data } = await tech.from("audit_events").select("entity_type").in("entity_id", ["review-test-case", "review-test-lodge"]);
    expect((data ?? []).map((r) => r.entity_type)).toEqual(["lodges"]);
  });

  it("shows both to designated triage", async () => {
    const pgm = await as("pgm");
    const { data } = await pgm.from("audit_events").select("entity_type").in("entity_id", ["review-test-case", "review-test-lodge"]);
    expect((data ?? []).map((r) => r.entity_type).sort()).toEqual(["cases", "lodges"]);
  });
});

describe("Retention of people and cases is a leadership decision", () => {
  it("refuses a technical administrator's change to the closed-cases policy", async () => {
    const tech = await as("techadmin");
    const res = await tech.from("retention_policies").update({ retain_months: 1, enabled: true }).eq("entity_type", "cases_closed").select("id");
    expect(res.error ?? (res.data?.length === 0 ? "no rows" : null)).toBeTruthy();
    const { data } = await service().from("retention_policies").select("retain_months, enabled").eq("entity_type", "cases_closed").single();
    expect(data).toEqual({ retain_months: 72, enabled: false });
  });

  it("still lets a technical administrator manage operational retention", async () => {
    const tech = await as("techadmin");
    const res = await tech.from("retention_policies").update({ basis: "Delivery history retention (reviewed)" }).eq("entity_type", "email_outbox").select("id");
    expect(res.error).toBeNull();
    expect(res.data).toHaveLength(1);
  });
});

describe("Campaign attachments come only from the campaign's own folder", () => {
  let apg: SupabaseClient;
  let campaignId: string;
  beforeAll(async () => {
    apg = await as("apgmen1");
    const { data, error } = await apg.from("campaigns").insert({ org_id: secrets.orgId, title: "Review test", subject: "Review test", scope: "allocated" }).select("id").single();
    if (error) throw error;
    campaignId = data.id;
  });
  afterAll(async () => { if (campaignId) await service().from("campaigns").delete().eq("id", campaignId); });

  it("refuses a path in another bucket", async () => {
    const res = await apg.from("campaigns").update({ attachments: [{ bucket: "certificates", path: `${secrets.orgId}/${user("learner1").personId}/x.pdf`, filename: "x.pdf" }] }).eq("id", campaignId);
    expect(res.error?.message).toMatch(/uploaded to this campaign/);
  });

  it("refuses another campaign's folder or a path that climbs out", async () => {
    for (const path of [`${secrets.orgId}/comms/00000000-0000-0000-0000-000000000000/x.pdf`, `${secrets.orgId}/comms/${campaignId}/../../reports/x.xlsx`]) {
      const res = await apg.from("campaigns").update({ attachments: [{ bucket: "comms-attachments", path, filename: "x.pdf" }] }).eq("id", campaignId);
      expect(res.error, path).not.toBeNull();
    }
  });

  it("accepts a file in the campaign's own folder", async () => {
    const res = await apg.from("campaigns").update({ attachments: [{ bucket: "comms-attachments", path: `${secrets.orgId}/comms/${campaignId}/abc-file.pdf`, filename: "file.pdf" }] }).eq("id", campaignId);
    expect(res.error).toBeNull();
  });
});

describe("Learners' evidence stays in their own folder", () => {
  it("refuses an evidence path pointing at another learner's files", async () => {
    const l1 = await as("learner1");
    const { data: row, error } = await l1.from("external_learning").insert({ org_id: secrets.orgId, person_id: user("learner1").personId, title: "Review test", completed_on: "2026-01-01" }).select("id").single();
    if (error) throw error;
    try {
      const bad = await l1.from("external_learning").update({ evidence_path: `${user("learner2").personId}/someone-else.pdf` }).eq("id", row.id);
      expect(bad.error).not.toBeNull();
      const ok = await l1.from("external_learning").update({ evidence_path: `${user("learner1").personId}/mine.pdf` }).eq("id", row.id);
      expect(ok.error).toBeNull();
    } finally {
      await service().from("external_learning").delete().eq("id", row.id);
    }
  });
});

describe("Updating notes and contacts meets the rules for creating them", () => {
  let apg: SupabaseClient;
  beforeAll(async () => { apg = await as("apgmen1"); });

  it("refuses raising a note's visibility beyond the author's permission", async () => {
    const { data: note, error } = await apg.from("notes").insert({ org_id: secrets.orgId, subject_type: "lodge", subject_id: MINE(), lodge_id: MINE(), body: "Review test note" }).select("id").single();
    if (error) throw error;
    try {
      const res = await apg.from("notes").update({ visibility: "leadership" }).eq("id", note.id).select("id");
      expect(res.error ?? (res.data?.length === 0 ? "no rows" : null)).toBeTruthy();
      const res2 = await apg.from("notes").update({ subject_id: NOT_MINE(), lodge_id: NOT_MINE() }).eq("id", note.id).select("id");
      expect(res2.error ?? (res2.data?.length === 0 ? "no rows" : null)).toBeTruthy();
    } finally {
      await service().from("notes").delete().eq("id", note.id);
    }
  });

  it("refuses moving a contact to a Lodge the author cannot write to", async () => {
    const { data: c, error } = await apg.from("contacts").insert({ org_id: secrets.orgId, lodge_id: MINE(), method: "telephone", summary: "Review test contact" }).select("id").single();
    if (error) throw error;
    try {
      const res = await apg.from("contacts").update({ lodge_id: NOT_MINE(), shared_with_lodge: true }).eq("id", c.id).select("id");
      expect(res.error ?? (res.data?.length === 0 ? "no rows" : null)).toBeTruthy();
      const ok = await apg.from("contacts").update({ summary: "Review test contact (edited)" }).eq("id", c.id).select("id");
      expect(ok.data).toHaveLength(1);
    } finally {
      await service().from("contacts").delete().eq("id", c.id);
    }
  });
});

describe("Unsubscribe tokens are never readable through the API", () => {
  it("refuses the token column to a communications user, while preferences stay readable", async () => {
    const apg = await as("apgmen1");
    const bad = await apg.from("comm_preferences").select("person_id, unsubscribe_token").limit(1);
    expect(bad.error).not.toBeNull();
    const ok = await apg.from("comm_preferences").select("person_id, news, email_status").limit(1);
    expect(ok.error).toBeNull();
  });

  it("still lets a member change their own preferences", async () => {
    const l1 = await as("learner1");
    const res = await l1.from("comm_preferences").update({ news: true }).eq("person_id", user("learner1").personId).select("person_id");
    expect(res.error).toBeNull();
  });
});

describe("Stored email bodies are not readable through the API", () => {
  it("lets System health see delivery metadata but not message content", async () => {
    const tech = await as("techadmin");
    const meta = await tech.from("email_outbox").select("id, subject, status, last_error").limit(1);
    expect(meta.error).toBeNull();
    for (const col of ["html", "text_body", "attachments"]) {
      const res = await tech.from("email_outbox").select(`id, ${col}`).limit(1);
      expect(res.error, col).not.toBeNull();
    }
  });
});
