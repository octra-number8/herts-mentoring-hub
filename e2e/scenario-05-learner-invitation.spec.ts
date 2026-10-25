import { expect as baseExpect, test, type Browser, type Page } from "@playwright/test";
import { latestEmail, runJobs } from "./helpers";
import { svc, signInRetry } from "./imports-fixtures";

// The shared local stack is busy while several suites run; allow for slow responses.
const expect = baseExpect.configure({ timeout: 45_000 });
test.describe.configure({ timeout: 360_000 });

const notFound = (page: Page) => page.getByRole("heading", { name: "We could not find that page" });

async function invite(page: Page, opts: { first: string; last: string; email: string; role: RegExp }) {
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "Invite someone" }).click();
  const dialog = page.getByRole("dialog", { name: "Invite someone to the Hub" });
  await dialog.getByRole("radio", { name: "Someone new" }).check();
  await dialog.getByLabel("First name", { exact: false }).fill(opts.first);
  await dialog.getByLabel("Last name", { exact: false }).fill(opts.last);
  await dialog.getByLabel("Email address", { exact: false }).fill(opts.email);
  await dialog.getByRole("checkbox", { name: opts.role }).check();
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  await expect(page).toHaveURL(/\/admin\/users\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: new RegExp(opts.last) })).toBeVisible();
  await expect(page.getByText("Invited", { exact: true })).toBeVisible();
}

async function accept(browser: Browser, email: string, after: Date) {
  await runJobs();
  const mail = await latestEmail(email, { subject: /invitation/i, after });
  expect(mail, "invitation email").not.toBeNull();
  const link = mail!.Text.match(/https?:\/\/[^\s)]+\/invite\/[A-Za-z0-9_-]+/)?.[0];
  expect(link).toBeTruthy();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(new URL(link!).pathname);
  await page.locator("input[name=password]").fill("Correct-horse-battery-9");
  await page.locator("input[name=confirm]").fill("Correct-horse-battery-9");
  await page.getByRole("checkbox", { name: /I understand how the Hub uses my information/ }).check();
  await page.getByRole("button", { name: "Activate my account" }).click();
  await page.waitForURL(/\/academy/, { timeout: 90_000 });
  return { ctx, page };
}

test("Scenario 5: a new learner is invited, accepts by email and sees only the Academy", async ({ page, browser }) => {
  const run = Date.now().toString(36);
  const email = `learner-${run}@example.test`;
  const after = new Date();
  await signInRetry(page, "pgm");
  await invite(page, { first: "Tristram", last: `Pengelly${run}`, email, role: /^Learner\b/ });

  const db = svc();
  const { data: inv } = await db.from("invitations").select("role_keys, expires_at, token_hash").eq("email", email).single();
  expect(inv!.role_keys).toEqual(["learner"]);
  expect(inv!.token_hash).toMatch(/^[0-9a-f]{64}$/);

  const { ctx, page: learner } = await accept(browser, email, after);
  await expect(learner.getByRole("navigation", { name: "Academy" })).toBeVisible();
  await expect(learner.getByRole("link", { name: "Lodges" })).toHaveCount(0);
  for (const path of ["/dashboard", "/lodges", "/members", "/imports", "/admin", "/admin/users", "/allocations", "/portal"]) {
    await learner.goto(path);
    await expect(notFound(learner), path).toBeVisible();
  }
  await ctx.close();
  const { data: acc } = await db.from("persons").select("user_accounts(status)").eq("email", email).single();
  expect((acc!.user_accounts as unknown as { status: string }).status).toBe("active");
});

test("Scenario 5: inviting someone as a Lodge Mentor does not open the Lodge Mentor portal", async ({ page, browser }) => {
  const run = Date.now().toString(36);
  const email = `lodge-mentor-${run}@example.test`;
  const after = new Date();
  await signInRetry(page, "pgm");
  await invite(page, { first: "Jago", last: `Trevithick${run}`, email, role: /^Lodge Mentor\b/ });
  const { ctx, page: lm } = await accept(browser, email, after);
  await expect(lm).toHaveURL(/\/academy$/);
  await expect(lm.getByRole("link", { name: "My Lodge" })).toHaveCount(0);
  await lm.goto("/portal");
  await expect(notFound(lm)).toBeVisible();
  await ctx.close();
});
