import { expect as baseExpect, test } from "@playwright/test";
import { lodgeId } from "./helpers";
import { chooseOption, signInPatiently, dialog, displayName, stamp, submitDialog, svc } from "./members-support-helpers";

// The shared dev server compiles pages on first visit and is busy with other agents' runs.
const expect = baseExpect.configure({ timeout: 45_000 });
test.describe.configure({ timeout: 300_000 });

// Scenario 3: an Assistant records a support request for an allocated Lodge and
// takes it through update, comment, action, escalation, resolution and reopening.

test("an Assistant takes a support request from creation to closure", async ({ page, browser }) => {
  const title = `Help with a Personal Mentor evening ${stamp()}`;
  const apgName = await displayName("apgmen1");
  const pgmName = await displayName("pgm");

  await signInPatiently(page, "apgmen1");
  await page.goto("/support/new");
  await page.locator("select[name=category_key]").selectOption({ label: "Personal Mentor guidance" });
  await page.locator("input[name=title]").fill(title);
  await page.locator("textarea[name=description]").fill("The Secretary asked for help planning an evening for new Personal Mentors.");
  await page.locator("select[name=lodge_id]").selectOption(lodgeId(9002));
  await page.locator("select[name=source]").selectOption("telephone");
  await page.getByRole("button", { name: "Create request" }).click();

  // Routed automatically to the allocated Assistant.
  await expect(page).toHaveURL(/\/support\/[0-9a-f-]{36}\?created=1/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText(new RegExp(`Request SR-\\d{4}-\\d+ created and routed to ${apgName}`))).toBeVisible();
  const caseId = page.url().match(/support\/([0-9a-f-]{36})/)![1];
  const { data: stored } = await svc().from("cases").select("reference, owner_account_id, status, kind").eq("id", caseId).single();
  expect(stored).toMatchObject({ status: "assigned", kind: "request" });
  const reference = stored!.reference as string;

  // Update status and priority.
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await dialog(page).locator("select[name=status]").selectOption("in_progress");
  await dialog(page).locator("select[name=priority]").selectOption("high");
  await submitDialog(page, "Save");
  await expect(page.getByText("In progress", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("High priority")).toBeVisible();

  // Comment visible to the requester.
  await page.locator("textarea[name=body]").fill("Spoke to the Secretary; proposing a date in March.");
  await page.getByLabel("Visible to the person who raised this").check();
  await page.getByRole("button", { name: "Add update" }).click();
  await expect(page.getByText("Update added.")).toBeVisible();
  await expect(page.getByText("Spoke to the Secretary; proposing a date in March.")).toBeVisible();
  await expect(page.getByText("Shared with requester")).toBeVisible();

  // An action becomes a task linked to the case.
  await page.getByRole("button", { name: "Add action" }).click();
  await dialog(page).locator("input[name=title]").fill(`Book the room ${title}`);
  await submitDialog(page, "Save");
  await expect(page.getByRole("link", { name: `Book the room ${title}` })).toBeVisible();
  const { data: task } = await svc().from("tasks").select("linked_type, linked_id, owner_account_id").eq("title", `Book the room ${title}`).single();
  expect(task).toMatchObject({ linked_type: "case", linked_id: caseId });

  // Escalate to the Provincial Grand Mentor.
  await page.getByRole("button", { name: "Escalate", exact: true }).click();
  await chooseOption(dialog(page).locator("select[name=to_account_id]"), pgmName);
  await dialog(page).locator("textarea[name=note]").fill("A Provincial visit would help here.");
  await submitDialog(page, "Escalate");
  await expect(page.getByText("Escalated", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(`Escalated to ${pgmName}`)).toBeVisible();

  // The Provincial Grand Mentor is notified.
  const pgmContext = await browser.newContext();
  const pgmPage = await pgmContext.newPage();
  await signInPatiently(pgmPage, "pgm");
  await pgmPage.goto("/notifications?show=all");
  const note = pgmPage.locator("li", { hasText: reference }).filter({ hasText: "Support request escalated to you" });
  await expect(note.first()).toBeVisible();
  await pgmContext.close();

  // Resolve with an outcome.
  await page.reload();
  await page.getByRole("button", { name: "Record outcome" }).click();
  await dialog(page).getByLabel("Resolved").check();
  await dialog(page).locator("textarea[name=outcome]").fill("Provincial visit arranged for March.");
  await submitDialog(page, "Save outcome");
  await expect(page.getByText("Resolved", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Outcome: Provincial visit arranged for March.")).toBeVisible();

  // Reopen, then close.
  await page.getByRole("button", { name: "Reopen" }).click();
  await dialog(page).locator("textarea[name=reason]").fill("The Lodge asked for a second date.");
  await submitDialog(page, "Reopen");
  await expect(page.getByRole("button", { name: "Record outcome" })).toBeVisible();
  await page.getByRole("button", { name: "Record outcome" }).click();
  await dialog(page).getByLabel("Closed").check();
  await dialog(page).locator("textarea[name=outcome]").fill("Both dates arranged. Nothing further.");
  await submitDialog(page, "Save outcome");
  await expect(page.getByRole("button", { name: "Reopen" })).toBeVisible();

  const { data: events } = await svc().from("case_events").select("kind, data").eq("case_id", caseId).order("created_at");
  const statuses = events!.filter((e) => e.kind === "status_change").map((e) => (e.data as { to: string }).to);
  expect(statuses).toEqual(["in_progress", "escalated", "resolved", "in_progress", "closed"]);
  const { data: final } = await svc().from("cases").select("status, outcome, closed_at, priority").eq("id", caseId).single();
  expect(final).toMatchObject({ status: "closed", outcome: "Both dates arranged. Nothing further.", priority: "high" });
  expect(final!.closed_at).toBeTruthy();
});

test("a request raised by the Provincial Grand Mentor reaches the allocated Assistant's list", async ({ page, browser }) => {
  const title = `Speaker for an installation ${stamp()}`;
  await signInPatiently(page, "pgm");
  await page.goto(`/support/new?lodge=${lodgeId(9003)}`);
  await page.locator("select[name=category_key]").selectOption({ label: "Presentation or speaker" });
  await page.locator("input[name=title]").fill(title);
  await expect(page.locator("select[name=lodge_id]")).toHaveValue(lodgeId(9003));
  await page.getByRole("button", { name: "Create request" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  const ctx = await browser.newContext();
  const apg = await ctx.newPage();
  await signInPatiently(apg, "apgmen1");
  await apg.goto("/support?view=assigned");
  await expect(apg.getByRole("tab", { selected: true }).or(apg.getByRole("link", { name: "Assigned to me" })).first()).toBeVisible();
  await expect(apg.getByRole("link", { name: title })).toBeVisible();
  await ctx.close();
});
