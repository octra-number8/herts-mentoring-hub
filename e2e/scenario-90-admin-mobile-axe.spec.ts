import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { lodgeId, secrets } from "./helpers";
import { svc, signInRetry } from "./imports-fixtures";

// The shared local stack is busy while several suites run; allow for slow responses.
const expect = baseExpect.configure({ timeout: 45_000 });
test.describe.configure({ timeout: 360_000 });

const TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

async function check(page: Page, path: string, name: string) {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.screenshot({ path: `test-results/mobile/${name}.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${name} scrolls sideways`).toBeLessThanOrEqual(1);
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`), name).toEqual([]);
}

test("imports, allocations and administration pages work at phone width and pass axe", async ({ page }) => {
  const db = svc();
  const { data: batch } = await db.from("import_batches").select("id").eq("status", "committed").order("created_at", { ascending: false }).limit(1).single();
  await signInRetry(page, "pgm");
  await check(page, `/imports/${batch!.id}?tab=update`, "import-preview");
  await check(page, "/allocations", "allocations");
  await check(page, "/admin/users", "admin-users");
  await check(page, `/admin/users/${secrets.users.lm2.accountId}`, "admin-user-detail");
  await check(page, "/admin/features", "admin-features");
});

test("the Lodge Mentor portal works at phone width and passes axe", async ({ page }) => {
  const db = svc();
  const lm2 = secrets.users.lm2;
  const { data: act } = await db.from("feature_activations").insert({ org_id: secrets.orgId, feature_key: "lodge_portal", scope_type: "account", account_id: lm2.accountId,
    actions: { read: true, create: true, update: true, approve: false, export: true }, reason: "Accessibility check", active: true }).select("id").single();
  try {
    await signInRetry(page, "lm2");
    await check(page, `/portal/${lodgeId(9002)}`, "portal-lodge");
    await check(page, `/portal/${lodgeId(9002)}?tab=support`, "portal-support");
  } finally {
    await db.from("feature_activations").update({ active: false, deactivated_at: new Date().toISOString() }).eq("id", act!.id);
  }
});
