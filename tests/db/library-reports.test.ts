/**
 * Library, search, quarterly report, dataset exports and scheduled reports.
 * Creates its own records (other suites share the database) and checks
 * refusals as well as successes.
 */
import { execSync } from "node:child_process";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { as, count, lodge, secrets, service, user } from "../helpers";
import { cookieFor } from "../../scripts/smoke";

vi.mock("server-only", () => ({}));

const APP = (process.env.APP_URL ?? "http://localhost:3100").replace(/\/$/, "");
const stamp = Date.now().toString(36);
const PDF = new Blob(["%PDF-1.4\n% synthetic test file\n"], { type: "application/pdf" });

let pgm: SupabaseClient, learner: SupabaseClient, lm: SupabaseClient, apg3: SupabaseClient;

beforeAll(async () => {
  pgm = await as("pgm");
  learner = await as("learner1");
  lm = await as("lm1");
  apg3 = await as("apgmen3");
});

async function categoryId(key: string) {
  const { data } = await service().from("document_categories").select("id").eq("org_id", secrets.orgId).eq("key", key).single();
  return data!.id as string;
}

async function newVersion(c: SupabaseClient, docId: string, no: number) {
  const { data: v, error } = await c.from("document_versions").insert({ org_id: secrets.orgId, document_id: docId, version_no: no, version_label: `Issue ${no}` }).select("id").single();
  expect(error).toBeNull();
  const path = `${secrets.orgId}/${docId}/${v!.id}/test-${no}.pdf`;
  const up = await c.storage.from("documents").upload(path, PDF, { contentType: "application/pdf" });
  expect(up.error).toBeNull();
  const { data: upd } = await c.from("document_versions").update({ storage_path: path, file_name: `test-${no}.pdf` }).eq("id", v!.id).select("id");
  expect(upd).toHaveLength(1);
  return { id: v!.id as string, path };
}

async function publish(c: SupabaseClient, versionId: string) {
  for (const to of ["review", "approved", "published"]) {
    const { error } = await c.rpc("document_transition_version", { p_version: versionId, p_to: to });
    expect(error, `-> ${to}`).toBeNull();
  }
}

describe("document lifecycle", () => {
  let docId: string, v1: { id: string; path: string }, v2: { id: string; path: string };

  it("a Provincial Grand Mentor creates, uploads, approves and publishes a document", async () => {
    const { data: doc, error } = await pgm.from("documents").insert({
      org_id: secrets.orgId, reference: `T-${stamp}`, title: "Test guidance for mentors", category_id: await categoryId("lm_guidance"),
      classification: "mentors", requires_ack: true, renew_ack_on_revision: true,
    }).select("id").single();
    expect(error).toBeNull();
    docId = doc!.id;
    v1 = await newVersion(pgm, docId, 1);
    // A draft cannot jump straight to published.
    expect((await pgm.rpc("document_transition_version", { p_version: v1.id, p_to: "published" })).error).not.toBeNull();
    await publish(pgm, v1.id);
    const { data: d } = await pgm.from("documents").select("current_version_id").eq("id", docId).single();
    expect(d!.current_version_id).toBe(v1.id);
  });

  it("publishing a new issue supersedes the previous one", async () => {
    v2 = await newVersion(pgm, docId, 2);
    await publish(pgm, v2.id);
    const { data } = await pgm.from("document_versions").select("id, status").eq("document_id", docId).order("version_no");
    expect(data!.map((v) => v.status)).toEqual(["superseded", "published"]);
    const { data: d } = await pgm.from("documents").select("current_version_id").eq("id", docId).single();
    expect(d!.current_version_id).toBe(v2.id);
  });

  it("acknowledgement is recorded against the precise version", async () => {
    expect((await lm.rpc("document_acknowledge", { p_version: v2.id })).error).toBeNull();
    const { data } = await service().from("document_acknowledgements").select("document_version_id").eq("person_id", user("lm1").personId).in("document_version_id", [v1.id, v2.id]);
    expect(data!.map((a) => a.document_version_id)).toEqual([v2.id]);
    // A superseded issue cannot be acknowledged.
    expect((await lm.rpc("document_acknowledge", { p_version: v1.id })).error).not.toBeNull();
  });

  it("a learner cannot see or download mentor, internal or leadership documents, even by guessing the path", async () => {
    expect(await count(learner, "documents", (q) => q.in("classification", ["mentors", "internal", "leadership"]))).toBe(0);
    expect(await count(learner, "document_versions", (q) => q.eq("document_id", docId))).toBe(0);
    expect((await learner.storage.from("documents").download(v2.path)).error).not.toBeNull();
    expect((await learner.storage.from("documents").createSignedUrl(v2.path, 60)).error).not.toBeNull();
    const { data: w1 } = await service().from("documents").select("current_version_id, document_versions!documents_current_version_fk(storage_path)").eq("reference", "W1").single();
    const leaderPath = (w1!.document_versions as unknown as { storage_path: string }).storage_path;
    expect((await learner.storage.from("documents").download(leaderPath)).error).not.toBeNull();
    expect((await learner.rpc("document_acknowledge", { p_version: v2.id })).error).not.toBeNull();
  });

  it("a learner cannot upload or create documents", async () => {
    const up = await learner.storage.from("documents").upload(`${secrets.orgId}/x-${stamp}/y/z.pdf`, PDF);
    expect(up.error).not.toBeNull();
    const ins = await learner.from("documents").insert({ org_id: secrets.orgId, reference: `L-${stamp}`, title: "x", classification: "learning" });
    expect(ins.error).not.toBeNull();
  });

  it("a learner sees published learning documents and can download them", async () => {
    const { data } = await learner.from("documents").select("reference, classification, current_version_id");
    expect(data!.length).toBeGreaterThan(0);
    expect(new Set(data!.map((d) => d.classification))).toEqual(new Set(["learning"]));
    const { data: v } = await learner.from("document_versions").select("storage_path").eq("id", data![0].current_version_id!).single();
    expect((await learner.storage.from("documents").download(v!.storage_path!)).error).toBeNull();
  });

  it("an Assistant cannot approve or publish documents", async () => {
    const apg1 = await as("apgmen1");
    const v3 = await newVersion(pgm, docId, 3);
    expect((await pgm.rpc("document_transition_version", { p_version: v3.id, p_to: "review" })).error).toBeNull();
    expect((await apg1.rpc("document_transition_version", { p_version: v3.id, p_to: "approved" })).error).not.toBeNull();
    const { data } = await service().from("document_versions").select("status").eq("id", v3.id).single();
    expect(data!.status).toBe("review");
  });

  it("knowledge examples cannot be published without anonymisation confirmed", async () => {
    const slug = `example-${stamp}`;
    const { data: a, error } = await pgm.from("knowledge_articles").insert({ org_id: secrets.orgId, slug, title: "Example", kind: "example", body_markdown: "Synthetic.", audience: "mentors" }).select("id").single();
    expect(error).toBeNull();
    expect((await pgm.rpc("knowledge_publish", { p_article: a!.id })).error).not.toBeNull();
    await pgm.from("knowledge_articles").update({ anonymisation_confirmed: true }).eq("id", a!.id);
    expect((await pgm.rpc("knowledge_publish", { p_article: a!.id })).error).toBeNull();
    expect(await count(learner, "knowledge_articles", (q) => q.eq("id", a!.id))).toBe(0);
    expect(await count(lm, "knowledge_articles", (q) => q.eq("id", a!.id))).toBe(1);
  });
});

describe("global search", () => {
  it("returns no management results to a learner", async () => {
    for (const term of ["lodge", "mentor", "9001", "a"]) {
      const { data, error } = await learner.rpc("search_all", { p_query: term, p_limit: 20 });
      expect(error).toBeNull();
      const kinds = new Set((data ?? []).map((r: { kind: string }) => r.kind));
      for (const k of ["lodge", "person", "task", "meeting", "note", "case"]) expect(kinds.has(k), `${term}: ${k}`).toBe(false);
    }
    const { data: docs } = await learner.rpc("search_all", { p_query: "guide", p_limit: 20 });
    const ids = (docs ?? []).filter((r: { kind: string }) => r.kind === "document").map((r: { id: string }) => r.id);
    if (ids.length) {
      const { data } = await service().from("documents").select("classification").in("id", ids);
      expect(new Set(data!.map((d) => d.classification))).toEqual(new Set(["learning"]));
    }
  });

  it("returns management results to the Provincial Grand Mentor", async () => {
    const { data } = await pgm.rpc("search_all", { p_query: String(lodge(9001).number), p_limit: 8 });
    expect((data ?? []).some((r: { kind: string }) => r.kind === "lodge")).toBe(true);
  });
});

describe("quarterly report", () => {
  const YEAR = 2019, Q = 2;
  let id: string;

  beforeAll(async () => {
    await service().from("quarterly_reports").delete().eq("org_id", secrets.orgId).eq("year", YEAR).eq("quarter", Q);
  });

  it("is refused to an Assistant and to a learner", async () => {
    expect((await apg3.rpc("report_generate_quarterly", { p_year: YEAR, p_quarter: Q })).error).not.toBeNull();
    expect((await learner.rpc("report_generate_quarterly", { p_year: YEAR, p_quarter: Q })).error).not.toBeNull();
    expect((await learner.rpc("report_period_data", { p_start: "2019-04-01", p_end: "2019-06-30" })).error).not.toBeNull();
  });

  it("is generated, approved and published by the Provincial Grand Mentor", async () => {
    const { data, error } = await pgm.rpc("report_generate_quarterly", { p_year: YEAR, p_quarter: Q });
    expect(error).toBeNull();
    id = data as string;
    const { data: snap } = await pgm.from("quarterly_reports").select("status, snapshot_id, report_snapshots(data)").eq("id", id).single();
    expect(snap!.status).toBe("draft");
    expect((snap!.report_snapshots as unknown as { data: { lodges: unknown; previous: unknown } }).data.previous).toBeTruthy();

    const { data: upd } = await pgm.from("quarterly_reports").update({ narrative: { summary: "Draft summary." }, observations: "Test." }).eq("id", id).select("id");
    expect(upd).toHaveLength(1);
    expect(await count(apg3, "quarterly_reports", (q) => q.eq("id", id))).toBe(0);
    expect((await apg3.rpc("report_quarterly_transition", { p_report: id, p_to: "review" })).error).not.toBeNull();

    for (const to of ["review", "approved", "published"]) expect((await pgm.rpc("report_quarterly_transition", { p_report: id, p_to: to })).error, to).toBeNull();
    const { data: done } = await pgm.from("quarterly_reports").select("status, snapshot_id").eq("id", id).single();
    expect(done!.status).toBe("published");

    // Fixed once approved: no regeneration, no narrative edits, same snapshot.
    expect((await pgm.rpc("report_generate_quarterly", { p_year: YEAR, p_quarter: Q })).error).not.toBeNull();
    const { data: edit } = await pgm.from("quarterly_reports").update({ observations: "Changed" }).eq("id", id).select("id");
    expect(edit ?? []).toHaveLength(0);
    const { data: after } = await pgm.from("quarterly_reports").select("snapshot_id, observations").eq("id", id).single();
    expect(after).toEqual({ snapshot_id: done!.snapshot_id, observations: "Test." });
  });

  it("the PDF downloads for the Provincial Grand Mentor and is refused to an Assistant", async () => {
    const res = await fetch(`${APP}/api/reports/quarterly/${id}/pdf`, { headers: { cookie: await cookieFor("pgm") } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(new TextDecoder().decode((await res.arrayBuffer()).slice(0, 5))).toBe("%PDF-");
    const refused = await fetch(`${APP}/api/reports/quarterly/${id}/pdf`, { headers: { cookie: await cookieFor("apgmen3") } });
    expect(refused.status).toBe(404);
  });
});

describe("dataset export over HTTP", () => {
  it("gives an Assistant only the Lodges whose activity they may see", async () => {
    const res = await fetch(`${APP}/api/export/lodge_activity?format=csv`, { headers: { cookie: await cookieFor("apgmen1") } });
    expect(res.status).toBe(200);
    const lines = (await res.text()).replace(/^﻿/, "").trim().split(/\r\n/).slice(1);
    const numbers = lines.map((l) => Number(l.split(",")[0]));
    expect(numbers.length).toBeGreaterThan(0);
    for (const n of numbers) expect(n >= 9001 && n <= 9008, `Lodge ${n}`).toBe(true);
  });

  it("refuses a learner and an Assistant without membership reporting", async () => {
    expect((await fetch(`${APP}/api/export/lodge_activity?format=csv`, { headers: { cookie: await cookieFor("learner1") } })).status).toBe(404);
    expect((await fetch(`${APP}/api/export/membership_cohorts?format=csv`, { headers: { cookie: await cookieFor("apgmen1") } })).status).toBe(404);
  });

  it("exports membership cohorts to the Provincial Grand Mentor as Excel", async () => {
    const res = await fetch(`${APP}/api/export/membership_cohorts?format=xlsx`, { headers: { cookie: await cookieFor("pgm") } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("spreadsheetml");
  });
});

describe("scheduled reports", () => {
  it("emails the owner an Excel file built with the owner's own access", async () => {
    if (!process.env.SUPABASE_JWT_SECRET) {
      const env = execSync("npx supabase status -o env", { encoding: "utf8" });
      process.env.SUPABASE_JWT_SECRET = env.match(/^JWT_SECRET="?([^"\n]+)"?/m)?.[1];
    }
    const svc = service();
    const { data: saved, error } = await svc.from("saved_reports").insert({
      org_id: secrets.orgId, owner_account_id: user("apgmen1").accountId, name: `Scheduled ${stamp}`, dataset: "lodge_activity",
      config: { dataset: "lodge_activity", columns: ["lodge_number", "lodge", "contacts"], filters: {} }, schedule: "weekly",
    }).select("id").single();
    expect(error).toBeNull();
    // A learner cannot read it; the owner can.
    expect(await count(learner, "saved_reports", (q) => q.eq("id", saved!.id))).toBe(0);
    expect(await count(await as("apgmen1"), "saved_reports", (q) => q.eq("id", saved!.id))).toBe(1);

    const { processScheduledReports } = await import("@/server/jobs/scheduled-reports");
    const stats = await processScheduledReports(svc as never);
    expect(stats.failed).toBe(0);
    const { data: mail } = await svc.from("email_outbox").select("to_email, attachments, subject").like("idempotency_key", `scheduled-report:${saved!.id}:%`);
    expect(mail).toHaveLength(1);
    const att = (mail![0].attachments as { bucket: string; path: string }[])[0];
    expect(att.path.startsWith(`${secrets.orgId}/reports/${saved!.id}/`)).toBe(true);
    const { data: file } = await svc.storage.from(att.bucket).download(att.path);
    expect(file!.size).toBeGreaterThan(1000);

    // Not sent again within the period.
    await processScheduledReports(svc as never);
    expect(await count(svc, "email_outbox", (q) => q.like("idempotency_key", `scheduled-report:${saved!.id}:%`))).toBe(1);
    await svc.from("email_outbox").delete().like("idempotency_key", `scheduled-report:${saved!.id}:%`).in("status", ["queued"]);
    await svc.from("saved_reports").delete().eq("id", saved!.id);
  });
});
