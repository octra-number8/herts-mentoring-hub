import { expect as baseExpect, test, type Page } from "@playwright/test";
import { lodgeId } from "./helpers";
import { runTokens, scenarioCsv, seedExisting, svc, uploadAndMap, signInRetry } from "./imports-fixtures";

// The shared local stack is busy while several suites run; allow for slow responses.
const expect = baseExpect.configure({ timeout: 45_000 });
test.describe.configure({ timeout: 360_000 });

async function decide(page: Page, batchId: string, tab: string, name: string, decision: string) {
  await page.goto(`/imports/${batchId}?tab=${tab}`);
  const row = page.getByRole("row").filter({ hasText: name }).first();
  await row.getByLabel("Decision").selectOption({ label: decision });
  await row.getByRole("button", { name: "Decide" }).click();
  await expect(row.getByText("Waiting", { exact: true })).toHaveCount(0, { timeout: 90_000 });
}

test("Scenario 11: a full report with an update, a duplicate, a conflict, an invalid row and a possible removal", async ({ page }) => {
  const L = lodgeId(9006);
  const t = runTokens(9006);
  const ids = await seedExisting(t, L);
  page.on("dialog", (d) => d.accept());
  await signInRetry(page, "pgm");
  const batchId = await uploadAndMap(page, { name: `full-report-${t.run}.csv`, csv: scenarioCsv(t), full: true, templateName: `Hermes full e2e ${t.run}` });

  // Preview tabs and counts.
  const tabs = page.getByRole("navigation", { name: "Sections" });
  for (const [label, n] of [["New", "2"], ["Updated", "1"], ["Unchanged", "1"], ["Potential duplicates", "1"], ["Conflicts", "1"], ["Invalid", "1"]] as const) {
    await expect(tabs.getByRole("link", { name: new RegExp(`^${label}\\s*${n}$`) })).toBeVisible();
  }
  await page.goto(`/imports/${batchId}?tab=update`);
  await expect(page.getByRole("row").filter({ hasText: `Haldane${t.S}` })).toContainText("piers.new@example.test");
  await page.goto(`/imports/${batchId}?tab=invalid`);
  await expect(page.getByText("Lodge No. 99999 is not a Lodge in this Province.").locator("visible=true")).toBeVisible();
  await page.goto(`/imports/${batchId}?tab=conflict`);
  await expect(page.getByText(/belongs to Corwin Ashcombe/).locator("visible=true")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve and commit" })).toHaveCount(0);

  // Resolve each pending row through the UI.
  await decide(page, batchId, "duplicate", `Wrenfield${t.S}`, "Skip");
  await decide(page, batchId, "conflict", `Blakeney${t.S}`, "Skip");
  await decide(page, batchId, "possible_removal", `Merriweather${t.S}`, "Accept");
  await page.goto(`/imports/${batchId}?tab=possible_removal`);
  await expect(page.getByText("This is a full report")).toBeVisible();
  const skipAll = page.getByRole("button", { name: "Skip all waiting" });
  if (await skipAll.count()) {
    await skipAll.click();
    await expect(skipAll).toHaveCount(0, { timeout: 20_000 });
  }

  await page.goto(`/imports/${batchId}`);
  await expect(page.getByText("Waiting for a decision").locator("..")).toContainText("0");
  await page.getByRole("button", { name: "Approve and commit" }).click();
  await expect(page.getByRole("heading", { name: "Committed" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/2 new · 1 updated · .* · 1 review tasks/)).toBeVisible();

  const db = svc();
  // Possible removal: status unchanged, a review task instead.
  expect((await db.from("persons").select("status").eq("id", ids["06"]).single()).data!.status).toBe("active");
  expect((await db.from("tasks").select("id").eq("linked_id", ids["06"]).like("title", "Check membership%")).data).toHaveLength(1);
  // Update applied; conflict and invalid rows not applied.
  expect((await db.from("persons").select("email").eq("id", ids["03"]).single()).data!.email).toBe("piers.new@example.test");
  expect((await db.from("persons").select("last_name").eq("id", ids["05"]).single()).data!.last_name).toBe(`Ashcombe${t.S}`);
  expect((await db.from("persons").select("id").eq("membership_number", `${t.P}07`)).data).toHaveLength(0);

  // Batch history shows who uploaded and approved.
  await page.goto("/imports");
  await expect(page.getByRole("row").filter({ hasText: `full-report-${t.run}.csv` })).toContainText("Committed");

  // Keep Lodge 9006 small for the next run: this run's synthetic members leave the Lodge.
  const { data: mine } = await db.from("persons").select("id").like("membership_number", `${t.P}%`);
  await db.from("lodge_memberships").update({ left_on: new Date().toISOString().slice(0, 10), leaving_reason: "other" }).in("person_id", (mine ?? []).map((m) => m.id)).eq("lodge_id", L);
});
