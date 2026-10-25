/**
 * Dashboards, personalisation, standard reports with exports, the report
 * builder and global search, driven through the real UI.
 */
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { secrets, signIn } from "./helpers";

config({ path: ".env.local", quiet: true });

const expect = baseExpect.configure({ timeout: 45_000 });
test.describe.configure({ timeout: 180_000 });
const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now().toString(36);

const panelTitles = (page: Page) => page.locator("main section h2").allInnerTexts();

test("the Provincial Grand Mentor's dashboard shows the Provincial panels", async ({ page }) => {
  await signIn(page, "pgm");
  await page.goto("/dashboard");
  for (const t of ["At a glance", "Needs attention", "Degree progression", "New Initiates (last 90 days)", "Upcoming events"]) {
    await expect(page.getByRole("heading", { name: t })).toBeVisible();
  }
  await expect(page.getByRole("figure", { name: "Initiations, Passings and Raisings by quarter" })).toBeVisible();
  await expect(page.locator(".recharts-surface").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "My Lodges" })).toHaveCount(0);
});

test("an Assistant's dashboard shows their Lodges, and their customised layout persists", async ({ page }) => {
  await svc().from("saved_views").delete().eq("page", "dashboard").eq("account_id", secrets.users.apgmen1.accountId);
  await signIn(page, "apgmen1");
  await page.goto("/dashboard");
  for (const t of ["My Lodges", "My tasks", "Support requests", "Planned visits", "Training opportunities"]) await expect(page.getByRole("heading", { name: t })).toBeVisible();
  await expect(page.locator("#panel-my_lodges").getByRole("link", { name: "Brookfield Lodge No. 9001" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "At a glance" })).toHaveCount(0);
  const before = await panelTitles(page);
  expect(before.indexOf("My tasks")).toBeLessThan(before.indexOf("Support requests"));

  await page.getByRole("button", { name: "Customise" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("checkbox", { name: "Training opportunities", exact: true }).uncheck();
  await dlg.getByRole("button", { name: "Move Support requests up" }).click();
  await dlg.getByRole("button", { name: "Save layout" }).click();
  await expect(dlg).toBeHidden();

  await page.reload();
  await expect(page.getByRole("heading", { name: "My Lodges" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Training opportunities" })).toHaveCount(0);
  const after = await panelTitles(page);
  expect(after.indexOf("Support requests")).toBeLessThan(after.indexOf("My tasks"));

  // Reset restores the standard layout.
  await page.getByRole("button", { name: "Customise" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reset to the standard layout" }).click();
  await page.waitForURL(/\/dashboard\?done=reset/);
  await expect(page.getByText("Your dashboard is back to the standard layout.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Training opportunities" })).toBeVisible();
});

test("a standard report runs with filters and exports CSV and Excel", async ({ page }) => {
  await signIn(page, "pgm");
  await page.goto("/reports");
  await page.getByRole("link", { name: "Lodge mentoring activity" }).click();
  await expect(page.getByRole("heading", { name: "Lodge mentoring activity" })).toBeVisible();
  await page.locator("select[name=area]").selectOption({ label: "North Area" });
  await page.locator("input[name=from]").fill("2026-01-01");
  await page.getByRole("button", { name: "Apply" }).click();
  await page.waitForURL(/area=.*from=2026-01-01|from=2026-01-01.*area=/);
  await expect(page.getByRole("figure", { name: "Activity by area" })).toBeVisible();
  const rows = page.getByRole("table", { name: "Lodge mentoring activity" }).locator("tbody tr");
  await expect(rows.first()).toBeVisible();
  for (const text of await rows.locator("td:nth-child(3)").allInnerTexts()) expect(text).toBe("North Area");

  for (const [labelText, ext] of [["CSV", "csv"], ["Excel", "xlsx"]] as const) {
    const menu = page.locator("details", { has: page.locator("summary", { hasText: "Export" }) });
    if (!(await menu.evaluate((e) => (e as HTMLDetailsElement).open))) await menu.locator("summary").click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: labelText, exact: true }).click()]);
    expect(download.suggestedFilename()).toMatch(new RegExp(`^Lodge mentoring activity \\d{4}-\\d{2}-\\d{2}\\.${ext}$`));
    const file = readFileSync((await download.path())!);
    if (ext === "csv") {
      const lines = file.toString("utf8").replace(/^﻿/, "").trim().split(/\r\n/);
      expect(lines[0]).toContain("Lodge,Area");
      for (const l of lines.slice(1)) expect(l).toContain("North Area");
    } else {
      expect(file.subarray(0, 2).toString()).toBe("PK");
    }
  }
});

test("a custom report is built, saved and re-opened", async ({ page }) => {
  const name = `E2E coverage by area ${stamp}`;
  await signIn(page, "pgm");
  await page.goto("/reports/builder");
  await page.getByLabel("Dataset").selectOption({ label: "Lodge Mentor coverage and allocations" });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Group by").selectOption({ label: "Lodge Mentor position" });
  await page.getByLabel("Chart").selectOption({ label: "Bar chart" });
  await page.getByRole("button", { name: "Run report" }).click();
  await expect(page.getByRole("figure", { name: "Records by lodge mentor position" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "In place" })).toBeVisible();

  await page.getByRole("button", { name: "Save report" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Name").fill(name);
  await dlg.getByLabel("Share with colleagues who have report access").check();
  await dlg.getByRole("button", { name: "Save report" }).click();
  await page.waitForURL(/\/reports\/builder\?saved=/);
  await expect(page.getByRole("heading", { name })).toBeVisible();

  await page.goto("/reports");
  await page.getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByLabel("Group by")).toHaveValue("coverage");
  await expect(page.getByRole("cell", { name: "In place" })).toBeVisible();

  const { data } = await svc().from("saved_reports").select("id, dataset, shared, config").eq("name", name).single();
  expect(data).toMatchObject({ dataset: "lodge_coverage", shared: true, config: { group: "coverage", chart: "hbar" } });
  await svc().from("saved_reports").delete().eq("id", data!.id);
});

test("global search finds a Lodge", async ({ page }) => {
  await signIn(page, "pgm");
  await page.goto("/dashboard");
  await page.getByLabel("Search the Hub").fill("Brookfield");
  await page.getByLabel("Search the Hub").press("Enter");
  await page.waitForURL(/\/search\?q=Brookfield/);
  await expect(page.getByRole("heading", { name: /^Lodges \(/ })).toBeVisible();
  await page.getByRole("link", { name: "Brookfield Lodge No. 9001", exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/lodges/${secrets.lodges.find((l: { number: number }) => l.number === 9001).id}`));
});
