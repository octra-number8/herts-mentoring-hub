import { expect as baseExpect, test } from "@playwright/test";
import { lodgeId, secrets } from "./helpers";
import { svc, signInRetry } from "./imports-fixtures";

// The shared local stack is busy while several suites run; allow for slow responses.
const expect = baseExpect.configure({ timeout: 45_000 });
test.describe.configure({ timeout: 360_000 });

test("Scenario 14: leadership activates the Lodge Mentor portal for lm2, he uses it, and deactivation closes it again", async ({ page, browser }) => {
  const db = svc();
  const lm2 = secrets.users.lm2;
  const L2 = lodgeId(9002);
  const run = Date.now().toString(36);
  // Start closed, whatever an earlier interrupted run left behind.
  await db.from("feature_activations").update({ active: false, deactivated_at: new Date().toISOString() }).eq("feature_key", "lodge_portal").eq("account_id", lm2.accountId).eq("active", true);
  const { data: person } = await db.from("persons").select("display_name").eq("id", lm2.personId).single();
  const lmName = person!.display_name as string;

  // Leadership activates the portal with chosen actions and a reason.
  await signInRetry(page, "pgm");
  await page.goto("/admin/features");
  await page.getByRole("button", { name: "Activate the portal" }).click();
  const dialog = page.getByRole("dialog", { name: "Activate the Lodge Mentor portal" });
  await dialog.getByRole("radio", { name: "One Lodge Mentor" }).check();
  await dialog.getByRole("combobox", { name: /^Lodge Mentor/ }).selectOption(lm2.accountId);
  await expect(dialog.getByRole("checkbox", { name: /View their Lodge/ })).toBeChecked();
  await dialog.getByRole("checkbox", { name: /Propose Lodge changes/ }).check();
  await dialog.getByLabel("Reason", { exact: false }).fill(`Pilot agreed at the leadership meeting ${run}`);
  await dialog.getByRole("button", { name: "Activate" }).click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });
  const active = page.getByRole("row").filter({ hasText: lmName });
  await expect(active).toBeVisible();
  await expect(active).toContainText("Changes and arrangements");

  // lm2 signs in and lands in his own Lodge.
  const ctx = await browser.newContext();
  const lm = await ctx.newPage();
  await signInRetry(lm, "lm2");
  await lm.goto("/academy");
  await expect(lm.getByRole("link", { name: "My Lodge" }).first()).toHaveAttribute("href", "/portal");
  await lm.goto("/portal");
  await expect(lm).toHaveURL(new RegExp(`/portal/${L2}`), { timeout: 60_000 });
  await expect(lm.getByRole("heading", { level: 1 })).toContainText("No. 9002");
  await lm.goto(`/portal/${lodgeId(9001)}`);
  await expect(lm.getByRole("heading", { name: "We could not find that page" })).toBeVisible();

  // Propose a change to Lodge information.
  await lm.goto(`/portal/${L2}`);
  await lm.getByRole("button", { name: "Propose a change" }).click();
  const propose = lm.getByRole("dialog", { name: "Propose a change to Lodge information" });
  await propose.getByLabel("Meeting pattern").fill(`Second Thursday, September to May (${run})`);
  await propose.getByRole("button", { name: "Send proposal" }).click();
  await expect(propose).toBeHidden({ timeout: 60_000 });
  await expect(lm.getByText(`Meeting pattern: Second Thursday, September to May (${run})`)).toBeVisible();
  expect((await db.from("lodge_change_proposals").select("status").eq("lodge_id", L2).eq("proposed_by", lm2.accountId).contains("changes", { meeting_pattern: `Second Thursday, September to May (${run})` })).data).toHaveLength(1);

  // Raise a support request for his Lodge.
  await lm.goto(`/portal/${L2}?tab=support`);
  await lm.getByRole("button", { name: "Ask for support" }).click();
  const req = lm.getByRole("dialog", { name: "How can we help?" });
  await req.getByRole("combobox", { name: /What is it about/ }).selectOption("general_advice");
  await req.getByLabel("Summary", { exact: false }).fill(`Help planning a mentoring evening ${run}`);
  await req.getByLabel("Details", { exact: false }).fill("We would welcome a speaker for our newer Brethren.");
  await req.getByRole("button", { name: "Send request" }).click();
  await expect(req).toBeHidden({ timeout: 60_000 });
  await expect(lm.getByRole("row").filter({ hasText: `Help planning a mentoring evening ${run}` })).toBeVisible();
  const { data: c } = await db.from("cases").select("source, lodge_id").eq("title", `Help planning a mentoring evening ${run}`).single();
  expect(c).toMatchObject({ source: "lodge_portal", lodge_id: L2 });

  // Leadership deactivates.
  await page.goto("/admin/features");
  await page.getByRole("row").filter({ hasText: lmName }).getByRole("button", { name: "Deactivate" }).click();
  const off = page.getByRole("dialog", { name: /^Remove portal access/ });
  await off.getByLabel("Reason", { exact: false }).fill(`Pilot finished ${run}`);
  await off.getByRole("button", { name: "Deactivate" }).click();
  await expect(off).toBeHidden({ timeout: 60_000 });
  await expect(page.getByRole("row").filter({ hasText: lmName })).toHaveCount(0);

  // The portal is gone for lm2; the Academy still works.
  await lm.goto("/portal");
  await expect(lm.getByRole("heading", { name: "We could not find that page" })).toBeVisible();
  await lm.goto(`/portal/${L2}`);
  await expect(lm.getByRole("heading", { name: "We could not find that page" })).toBeVisible();
  await lm.goto("/academy");
  await expect(lm.getByRole("navigation", { name: "Academy" })).toBeVisible();
  await expect(lm.getByRole("link", { name: "My Lodge" })).toHaveCount(0);
  await ctx.close();
});
