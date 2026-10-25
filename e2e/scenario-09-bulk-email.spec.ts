/**
 * Scenario 9: a Province-wide email built in the UI by the Provincial Grand Mentor,
 * checked (recipient preview with exclusions and reasons, test email), submitted,
 * approved by the Deputy, sent by the background jobs, with delivery shown.
 */
import { expect as baseExpect, test, type Browser, type Page } from "@playwright/test";
import { latestEmail, runJobs, secrets, signIn as sharedSignIn } from "./helpers";
import { serviceClient } from "./academy-fixtures";

// The shared dev server is busy while other suites run: allow for slow renders.
const expect = baseExpect.configure({ timeout: 20_000 });

/** The shared sign-in waits only 5s for the MFA page and other suites sign in as the same users; under load, try again. */
async function signIn(page: import("@playwright/test").Page, key: string) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await sharedSignIn(page, key);
    } catch (e) {
      if (attempt >= 3) throw e;
      await page.context().clearCookies();
    }
  }
}

const stamp = `${Date.now()}`;
const subject = `Province update ${stamp}`;
const lodge = secrets.lodges.find((l: { number: number }) => l.number === 9010) as { id: string; name: string; number: number };

async function as(browser: Browser, key: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  page.on("dialog", (d) => d.accept());
  await signIn(page, key);
  return page;
}

test("a Province-wide campaign is previewed, tested, approved and sent", async ({ browser }) => {
  test.setTimeout(240_000);
  const started = new Date();
  const pgm = await as(browser, "pgm");

  // --- Create the draft ---------------------------------------------------------------
  await pgm.goto("/communications");
  await pgm.getByRole("button", { name: "New campaign" }).click();
  const dialog = pgm.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: false }).fill(`E2E campaign ${stamp}`);
  await dialog.getByLabel("Province-wide").check();
  await dialog.getByRole("button", { name: "Create draft" }).click();
  await pgm.waitForURL(/\/communications\/[0-9a-f-]{36}$/);
  const campaignId = pgm.url().split("/").pop()!;

  // --- Message ----------------------------------------------------------------------
  await pgm.getByLabel("Subject line", { exact: false }).fill(subject);
  await pgm.getByLabel("Message", { exact: true }).fill("Dear {{first_name}},\n\nA short **update** from the Provincial mentoring team.");
  await pgm.getByLabel("Operational").check();
  await pgm.getByRole("button", { name: "Save draft" }).click();
  await expect(pgm.getByText("Saved.", { exact: true })).toBeVisible();
  await expect(pgm.getByText("Replies go to")).toContainText("mentor@hertfordshirefreemasons.org.uk");

  // --- Audience: one Lodge, then exclude one person ------------------------------------------
  await pgm.getByRole("link", { name: "Audience" }).click();
  await pgm.getByRole("button", { name: /^Lodges/ }).click();
  await pgm.getByLabel(`${lodge.name} No. ${lodge.number}`).check();
  await pgm.getByRole("button", { name: "Update audience" }).click();
  await expect(pgm.getByText("Audience updated.")).toBeVisible({ timeout: 30_000 });
  const recipients = pgm.getByRole("table", { name: "Recipients" });
  const firstEligible = recipients.getByRole("row").filter({ has: pgm.getByRole("button", { name: "Exclude" }) }).first();
  const excludedEmail = (await firstEligible.locator("td").nth(1).innerText()).trim().toLowerCase();
  expect(excludedEmail).toContain("@");
  await firstEligible.getByRole("button", { name: "Exclude" }).click();
  const excludedRow = recipients.getByRole("row").filter({ hasText: excludedEmail });
  await expect(excludedRow.getByText("Not sent: Manually excluded")).toBeVisible({ timeout: 30_000 });
  await expect(pgm.getByText("Why some people are not included")).toBeVisible();
  await expect(pgm.getByText(/Manually excluded: 1/)).toBeVisible();

  // --- Preview and test email to self ---------------------------------------------------
  await pgm.getByRole("link", { name: "Preview" }).click();
  await expect(pgm.frameLocator("iframe[title='Email preview']").getByText("A short update from the Provincial mentoring team.")).toBeVisible();
  await pgm.getByRole("button", { name: "Mobile" }).click();
  await expect(pgm.getByRole("button", { name: "Mobile" })).toHaveAttribute("aria-pressed", "true");

  await pgm.getByRole("link", { name: "Review and send" }).click();
  await pgm.getByRole("button", { name: "Send me a test email" }).click();
  await expect(pgm.getByText(/Test email sent to/)).toBeVisible();
  const testMail = await latestEmail(secrets.users.pgm.email, { subject: new RegExp(`\\[Test\\] ${subject}`), after: started });
  expect(testMail, "test email reached the sender").not.toBeNull();
  expect(testMail!.Text).toContain("A short update");

  // --- Submit; the Deputy approves -------------------------------------------------------
  await pgm.getByRole("button", { name: "Submit for approval" }).click();
  await expect(pgm.getByText(/Submitted for approval\./)).toBeVisible();
  await expect(pgm.getByText("Awaiting approval").first()).toBeVisible();

  const deputy = await as(browser, "deputy");
  await deputy.goto(`/communications/${campaignId}?tab=review`);
  await deputy.getByLabel("Note").fill("Approved for sending.");
  await deputy.getByRole("button", { name: "Approve and send" }).click();
  await expect(deputy.getByText(/^Approved\. Sending starts/)).toBeVisible();

  // --- Background jobs send it --------------------------------------------------------------
  const db = serviceClient();
  for (let i = 0; i < 6; i++) {
    await runJobs();
    const { count } = await db.from("campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("status", "queued");
    const { data: c } = await db.from("campaigns").select("status").eq("id", campaignId).single();
    if (count === 0 && c!.status === "sent") break;
  }

  await pgm.goto(`/communications/${campaignId}?tab=delivery`);
  await expect(pgm.getByRole("heading", { name: "Recipients" })).toBeVisible({ timeout: 45_000 });
  await expect(pgm.getByText("Sent", { exact: true }).first()).toBeVisible();
  await expect(pgm.getByText(/not proof that someone read the message/)).toBeVisible();
  const delivery = pgm.getByRole("table", { name: "Delivery by recipient" });
  await expect(delivery.getByRole("row").filter({ hasText: excludedEmail }).getByText("Manually excluded")).toBeVisible();
  await expect(delivery.getByRole("row").filter({ hasText: excludedEmail }).getByText("Not sent")).toBeVisible();

  const { data: rows } = await db.from("campaign_recipients").select("email, status").eq("campaign_id", campaignId);
  const sent = rows!.filter((r) => r.status !== "excluded");
  expect(sent.length).toBeGreaterThan(0);
  for (const r of sent) expect(r.status).toBe("sent");
  const someone = await latestEmail(sent[0].email, { subject: new RegExp(subject), after: started });
  expect(someone, "a recipient received the campaign").not.toBeNull();
  const leak = await latestEmail(excludedEmail, { subject: new RegExp(subject), after: started, timeoutMs: 3000 });
  expect(leak, "the excluded person was not emailed").toBeNull();
});
