import { expect as baseExpect, test } from "@playwright/test";
import { latestEmail, lodgeId, runJobs } from "./helpers";
import { svc, signInRetry } from "./imports-fixtures";

const expect = baseExpect.configure({ timeout: 45_000 });
test.describe.configure({ timeout: 360_000 });

test("Scenario 15: a member sets up his own account, and his APGMen sees his learning for the Lodge", async ({ page, browser }) => {
  const run = Date.now().toString(36);
  const email = `selfjoin-${run}@example.test`;
  const surname = `Trevithick${run.replace(/\d/g, "")}`;
  const db = svc();
  // A current member of Lodge 9001, as an approved Adelphi import would hold him.
  const { data: person } = await db.from("persons").insert({ org_id: (await db.from("organisations").select("id").eq("slug", "herts").single()).data!.id,
    first_name: "Jago", last_name: surname, email, source: "import" }).select("id, org_id").single();
  await db.from("lodge_memberships").insert({ org_id: person!.org_id, person_id: person!.id, lodge_id: lodgeId(9001), is_primary: true, joined_on: "2021-03-01" });

  // 1. The sign-in page points first-timers to /join.
  const ctx = await browser.newContext();
  const member = await ctx.newPage();
  await member.goto("/login");
  await member.getByRole("link", { name: "Set up your account" }).click();
  await expect(member).toHaveURL(/\/join$/);

  // 2. He enters his email and gets the same answer anyone would.
  const after = new Date();
  await expect(async () => {
    await member.locator("input[name=email]").fill(email);
    await expect(member.locator("input[name=email]")).toHaveValue(email, { timeout: 1000 });
  }).toPass({ timeout: 30_000 });
  await member.getByRole("button", { name: "Email me a link" }).click();
  await expect(member.getByRole("status")).toContainText("If that address is held for a current member");

  // 3. The emailed link lets him choose his own password and lands him in the Academy.
  await runJobs();
  const mail = await latestEmail(email, { subject: /Set up your/, after });
  expect(mail, "set-up email").not.toBeNull();
  const link = mail!.Text.match(/https?:\/\/[^\s)]+\/invite\/[A-Za-z0-9_-]+/)?.[0];
  await member.goto(new URL(link!).pathname);
  await expect(member.getByText("Welcome to the Herts Mentoring Academy.")).toBeVisible();
  await member.locator("input[name=password]").fill("Correct-horse-battery-9");
  await member.locator("input[name=confirm]").fill("Correct-horse-battery-9");
  await member.getByRole("checkbox", { name: /I understand how the Hub uses my information/ }).check();
  await member.getByRole("button", { name: "Activate my account" }).click();
  await member.waitForURL(/\/academy/, { timeout: 90_000 });
  await expect(member.getByRole("navigation", { name: "Academy" })).toBeVisible();

  // 4. His APGMen sees him on the Lodge's Learning tab, signed up.
  await signInRetry(page, "apgmen1");
  await page.goto(`/lodges/${lodgeId(9001)}?tab=learning`);
  await expect(page.getByText("Signed up to the Academy")).toBeVisible();
  const row = page.getByRole("row", { name: new RegExp(surname) });
  await expect(row).toContainText("Signed up");
  await page.screenshot({ path: "test-results/scenario-15-lodge-learning.png", fullPage: true });
  // Not on a Lodge outside his allocation.
  await page.goto(`/lodges/${lodgeId(9009)}`);
  await expect(page.getByRole("link", { name: "Learning", exact: true })).toHaveCount(0);

  // 5. When an import records that he has resigned, he can no longer sign in.
  await db.from("persons").update({ status: "resigned" }).eq("id", person!.id);
  await member.goto("/academy");
  await expect(member).toHaveURL(/\/(account-unavailable|login)/);
  await ctx.close();
});
