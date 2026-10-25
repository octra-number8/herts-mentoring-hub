/**
 * Phone-width screenshots (375x812) and axe accessibility scans of the main
 * library, reporting and dashboard pages.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { mkdirSync } from "node:fs";
import { secrets, signIn } from "./helpers";

config({ path: ".env.local", quiet: true });

test.describe.configure({ timeout: 240_000 });
const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function check(page: Page, path: string, name: string, heading: string | RegExp) {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible({ timeout: 60_000 });
  await page.waitForLoadState("networkidle");
  mkdirSync("test-results/mobile", { recursive: true });
  await page.screenshot({ path: `test-results/mobile/${name}.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${name}: page scrolls horizontally`).toBeLessThanOrEqual(1);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const summary = results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
  expect(summary, `${name}: axe violations`).toEqual([]);
}

test("leadership pages at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const { data: doc } = await svc().from("documents").select("id").eq("org_id", secrets.orgId).eq("reference", "B1").single();
  // Use the latest quarterly report, creating a draft on fresh data.
  let { data: qr } = await svc().from("quarterly_reports").select("id").eq("org_id", secrets.orgId).order("generated_at", { ascending: false }).limit(1).maybeSingle();
  if (!qr) {
    const { data: id } = await svc().rpc("admin_generate_quarterly", { p_org: secrets.orgId, p_year: 2025, p_quarter: 4 });
    qr = { id: id as string };
  }
  await signIn(page, "pgm");
  await check(page, "/dashboard", "dashboard-pgm", /^Good day/);
  await check(page, "/library", "library", "Library");
  await check(page, `/library/${doc!.id}`, "library-document", /Lodge Mentor/);
  await check(page, "/reports", "reports", "Reports");
  await check(page, "/reports/membership_cohorts", "report-membership-cohorts", /Retention by Initiation cohort/);
  await check(page, `/reports/quarterly/${qr!.id}`, "quarterly-report", /^Quarterly report:/);
});

test("Assistant dashboard at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, "apgmen1");
  await check(page, "/dashboard", "dashboard-apgmen1", /^Good day/);
});

test("learner resources at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, "learner1");
  await check(page, "/academy/resources", "academy-resources", "Resources");
});
