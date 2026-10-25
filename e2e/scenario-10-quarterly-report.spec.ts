/**
 * Scenario 10: the quarterly report. Generated from a frozen snapshot, narrative
 * edited, reviewed, approved and published by leadership, downloaded as a PDF.
 * Refused to an Assistant.
 */
import { expect as baseExpect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { secrets, signIn } from "./helpers";

config({ path: ".env.local", quiet: true });

// Server actions on the shared dev server can be slow while other suites run.
const expect = baseExpect.configure({ timeout: 45_000 });
test.describe.configure({ timeout: 180_000 });
const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const YEAR = 2024, QUARTER = 1;
const stamp = Date.now().toString(36);

test.beforeAll(async () => {
  // This spec owns 2024 Q1: start each run from no report for that quarter.
  await svc().from("quarterly_reports").delete().eq("org_id", secrets.orgId).eq("year", YEAR).eq("quarter", QUARTER);
});

test("leadership generates, edits, approves, publishes and downloads the quarterly report", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await signIn(page, "pgm");
  await page.goto("/reports/quarterly");
  await page.getByRole("button", { name: "Generate report" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Year").selectOption(String(YEAR));
  await dialog.getByLabel("Quarter").selectOption(String(QUARTER));
  await dialog.getByRole("button", { name: "Generate" }).click();
  await page.waitForURL(/\/reports\/quarterly\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop()!;
  await expect(page.getByRole("heading", { name: `Quarterly report: Quarter ${QUARTER} ${YEAR}` })).toBeVisible();
  await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();

  // Suggested sentences prefill the narrative; edit two sections and save.
  const summary = page.getByLabel("Summary");
  await expect(summary).toHaveValue(/During Quarter 1 2024/);
  await summary.fill(`Summary written in the browser ${stamp}.`);
  await page.getByLabel("Observations").fill(`Observation ${stamp}.`);
  await page.getByRole("button", { name: "Save narrative" }).click();
  await expect(page.getByText("Narrative saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Summary")).toHaveValue(`Summary written in the browser ${stamp}.`);

  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText("Submitted for review by Provincial leadership.")).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/Report approved/)).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Report published.")).toBeVisible();
  await page.reload();
  await expect(page.getByText(/This report was approved/)).toBeVisible();
  await expect(page.getByText(`Observation ${stamp}.`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save narrative" })).toHaveCount(0);

  const { data } = await svc().from("quarterly_reports").select("status, narrative, observations").eq("id", id).single();
  expect(data).toMatchObject({ status: "published", observations: `Observation ${stamp}.` });
  expect((data!.narrative as { summary: string }).summary).toBe(`Summary written in the browser ${stamp}.`);

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download PDF" }).click()]);
  expect(download.suggestedFilename()).toBe(`Quarterly report Q${QUARTER} ${YEAR}.pdf`);
  const res = await page.request.get(`/api/reports/quarterly/${id}/pdf`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  expect((await res.body()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("an Assistant is refused the quarterly report", async ({ page }) => {
  const { data } = await svc().from("quarterly_reports").select("id").eq("org_id", secrets.orgId).limit(1).single();
  await signIn(page, "apgmen3");
  await page.goto("/reports");
  await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();
  for (const path of ["/reports/quarterly", `/reports/quarterly/${data!.id}`]) {
    const res = await page.goto(path);
    expect(new URL(page.url()).pathname, path).toBe(path);
    expect(res!.status(), path).toBe(404);
  }
  const pdf = await page.request.get(`/api/reports/quarterly/${data!.id}/pdf`);
  expect(pdf.status()).toBe(404);
  await page.goto("/reports");
  await expect(page.getByRole("link", { name: "Open" })).toHaveCount(0);
});
