import { expect as baseExpect, test, type Browser, type Page } from "@playwright/test";
import { lodgeId } from "./helpers";
import { chooseOption, signInPatiently, displayName, stamp, svc } from "./members-support-helpers";

// The shared dev server compiles pages on first visit and is busy with other agents' runs.
const expect = baseExpect.configure({ timeout: 45_000 });
test.describe.configure({ timeout: 300_000 });

// Scenario 4: a confidential concern is raised by a Provincial team member, stays
// invisible to everyone else, and is triaged by designated leadership.

async function as(browser: Browser, key: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signInPatiently(page, key);
  return page;
}
const notFound = (page: Page) => expect(page.getByRole("heading", { name: "We could not find that page" })).toBeVisible();

test("a confidential concern is hidden from others and triaged by leadership", async ({ page, browser }) => {
  const word = `Juniper${stamp()}`;
  const title = `Concern about a Brother ${word}`;

  // Submitted by a Provincial team member through the separate route.
  await signInPatiently(page, "team");
  await page.goto("/support/confidential/new");
  await expect(page.getByText("The Hub does not manage welfare, safeguarding or disciplinary cases.", { exact: false })).toBeVisible();
  await page.locator("input[name=title]").fill(title);
  await page.locator("textarea[name=description]").fill("Something leadership should know about. Synthetic test text.");
  await page.locator("select[name=lodge_id]").selectOption(lodgeId(9001));
  // The acknowledgement is required before submitting.
  await expect(page.getByRole("button", { name: "Submit confidentially" })).toBeDisabled();
  await page.getByLabel("I have read the guidance above").check();
  await page.getByRole("button", { name: "Submit confidentially" }).click();
  await expect(page).toHaveURL(/\/support\/[0-9a-f-]{36}\?submitted=1/);
  await expect(page.getByText(/Your concern CC-\d{4}-\d+ has been received/)).toBeVisible();
  const caseId = page.url().match(/support\/([0-9a-f-]{36})/)![1];
  const { data: stored } = await svc().from("cases").select("kind, status, owner_account_id").eq("id", caseId).single();
  expect(stored).toEqual({ kind: "confidential", status: "triage", owner_account_id: null });

  // The allocated Assistant for that Lodge cannot find it anywhere.
  const apg1 = await as(browser, "apgmen1");
  await apg1.goto("/support?view=all&status=any");
  await expect(apg1.getByRole("heading", { name: "Support" })).toBeVisible();
  await expect(apg1.getByText(word)).toHaveCount(0);
  await apg1.goto(`/search?q=${word}`);
  await expect(apg1.getByText(`Nothing found for "${word}"`)).toBeVisible();
  await expect(apg1.getByRole("link", { name: new RegExp(word) })).toHaveCount(0);
  await apg1.goto(`/lodges/${lodgeId(9001)}?tab=support`);
  await expect(apg1.getByRole("heading", { name: "Support requests" })).toBeVisible();
  await expect(apg1.getByText(word)).toHaveCount(0);
  await apg1.goto(`/support/${caseId}`);
  await notFound(apg1);
  await apg1.context().close();

  // Leadership sees it in Confidential triage and assigns it to apgmen2.
  const pgm = await as(browser, "pgm");
  await pgm.goto("/support?view=triage");
  await pgm.getByRole("link", { name: title }).click();
  await expect(pgm.getByRole("heading", { name: title })).toBeVisible();
  await expect(pgm.getByRole("heading", { name: "Triage" })).toBeVisible();
  await pgm.getByLabel("Assign to a Provincial team member").check();
  await chooseOption(pgm.locator("select[name=owner_account_id]"), await displayName("apgmen2"));
  await pgm.locator("textarea[name=note]").fill("Please have a quiet word.");
  await pgm.getByRole("button", { name: "Record decision" }).click();
  await expect(pgm.getByText("Assigned. Access has been granted and recorded.")).toBeVisible();
  await expect(pgm.getByRole("heading", { name: "Triage" })).toHaveCount(0);
  // Opening it was recorded.
  const { count } = await svc().from("audit_events").select("id", { count: "exact", head: true }).eq("action", "sensitive.viewed").eq("entity_id", caseId);
  expect(count).toBeGreaterThan(0);
  await pgm.context().close();

  // The assignee can open it; another Assistant still cannot.
  const apg2 = await as(browser, "apgmen2");
  await apg2.goto(`/support/${caseId}`);
  await expect(apg2.getByRole("heading", { name: title })).toBeVisible();
  await expect(apg2.getByText("Confidential", { exact: true }).first()).toBeVisible();
  await apg2.context().close();

  const apg3 = await as(browser, "apgmen3");
  await apg3.goto(`/support/${caseId}`);
  await notFound(apg3);
  await apg3.context().close();

  // The person who raised it sees its status, without internal detail.
  await page.goto("/support?view=raised");
  await expect(page.getByRole("link", { name: title })).toBeVisible();
});
