import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { secrets } from "./helpers";

config({ path: ".env.local", quiet: true });

export const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const letters = (n = 5) => Array.from({ length: n }, () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]).join("");

/** Unique tokens for one run of the synthetic Scenario 11 report. */
export function runTokens(lodgeNumber: number) {
  const run = `${Date.now().toString(36)}${letters(2)}`.toUpperCase();
  const recent = new Date(Date.now() - 20 * 86400000);
  return {
    run, P: `E${run}-`, S: `Qe${letters()}`, L: String(lodgeNumber),
    recentIso: recent.toISOString().slice(0, 10),
    recent: recent.toISOString().slice(0, 10).split("-").reverse().join("/"),
  };
}

export function scenarioCsv(t: ReturnType<typeof runTokens>, lines?: number) {
  const all = readFileSync("tests/fixtures/imports/scenario-11.csv", "utf8")
    .replaceAll("{P}", t.P).replaceAll("{S}", t.S).replaceAll("{L}", t.L).replaceAll("{RECENT}", t.recent);
  return lines ? all.split("\n").slice(0, lines).join("\n") + "\n" : all;
}

/** Existing members the report meets: an update, an unchanged row, a conflict and an absentee. */
export async function seedExisting(t: ReturnType<typeof runTokens>, lodgeId: string) {
  const db = svc();
  const ids: Record<string, string> = {};
  for (const p of [
    { k: "03", first_name: "Piers", last_name: `Haldane${t.S}`, email: "piers.old@example.test" },
    { k: "04", first_name: "Tobias", last_name: `Wrenfield${t.S}`, email: "tobias.wrenfield@example.test" },
    { k: "05", first_name: "Corwin", last_name: `Ashcombe${t.S}`, email: null },
    { k: "06", first_name: "Dunstan", last_name: `Merriweather${t.S}`, email: null },
  ]) {
    const { data, error } = await db.from("persons").insert({ org_id: secrets.orgId, title: "Bro", first_name: p.first_name, last_name: p.last_name, email: p.email,
      membership_number: `${t.P}${p.k}`, status: "active", source: "import" }).select("id").single();
    if (error) throw error;
    ids[p.k] = data!.id;
    await db.from("lodge_memberships").insert({ org_id: secrets.orgId, person_id: data!.id, lodge_id: lodgeId, is_primary: true, joined_on: "2019-01-01", source: "import" });
  }
  await db.from("degree_events").insert([
    { org_id: secrets.orgId, person_id: ids["04"], lodge_id: lodgeId, kind: "initiation", event_date: "2020-05-06", source: "import" },
    { org_id: secrets.orgId, person_id: ids["03"], lodge_id: lodgeId, kind: "initiation", event_date: "2019-02-02", source: "import" },
  ]);
  return ids;
}

/** Upload through /imports/new, choosing to map the columns by hand, and stage it. Returns the batch id. */
export async function uploadAndMap(page: Page, opts: { name: string; csv: string; full: boolean; templateName: string }) {
  await page.goto("/imports/new");
  await page.getByLabel("Report file", { exact: false }).setInputFiles({ name: opts.name, mimeType: "text/csv", buffer: Buffer.from(opts.csv) });
  await page.getByLabel("Source", { exact: false }).selectOption("hermes");
  await page.getByLabel("Report format").selectOption("manual");
  await page.getByRole("radio", { name: opts.full ? /full membership/ : /Part of the membership/ }).check();
  await page.getByRole("button", { name: "Upload and check" }).click();
  await expect(page.getByRole("heading", { name: "Match the columns" })).toBeVisible({ timeout: 90_000 });
  const batchId = page.url().split("/imports/")[1].split(/[?#]/)[0];
  // Suggested mappings are preselected; confirm the key ones.
  await expect(page.getByLabel("Hub field for Membership No")).toHaveValue("membership_number");
  await expect(page.getByLabel("Hub field for Surname")).toHaveValue("last_name");
  await page.getByLabel("Hub field for Date Initiated").selectOption("initiated_on");
  await page.getByLabel("Save as a template (optional)").fill(opts.templateName);
  await page.getByRole("button", { name: "Check rows" }).click();
  await expect(page.getByRole("heading", { name: "Match the columns" })).toHaveCount(0, { timeout: 90_000 });
  await expect(page.getByText("Rows in file")).toBeVisible();
  return batchId;
}

/**
 * Sign in, retrying when the shared helper gives up on a slow page (the local
 * stack is shared by several suites, and a global sign-out elsewhere can end a session).
 */
export async function signInRetry(page: Page, key: string) {
  const { signIn } = await import("./helpers");
  for (let attempt = 1; ; attempt++) {
    try {
      await signIn(page, key);
      return;
    } catch (e) {
      if (attempt >= 3) throw e;
      await page.context().clearCookies();
    }
  }
}
