import { expect as baseExpect, test } from "@playwright/test";
import { latestEmail, lodgeId, runJobs, secrets } from "./helpers";
import { runTokens, scenarioCsv, svc, uploadAndMap, signInRetry } from "./imports-fixtures";

// The shared local stack is busy while several suites run; allow for slow responses.
const expect = baseExpect.configure({ timeout: 45_000 });
test.describe.configure({ timeout: 360_000 });

test("Scenario 1: an imported new Initiate gets a Lodge link and journey, and the Assistant is told; the member is not emailed", async ({ page, browser }) => {
  const t = runTokens(9001);
  const started = new Date();
  page.on("dialog", (d) => d.accept());
  await signInRetry(page, "pgm");

  // Partial report with one recent Initiate: nothing needs a decision.
  const batchId = await uploadAndMap(page, { name: `new-initiate-${t.run}.csv`, csv: scenarioCsv(t, 2), full: false, templateName: `Hermes e2e ${t.run}` });
  await page.goto(`/imports/${batchId}?tab=new`);
  const row = page.getByRole("row").filter({ hasText: `Tregarthen${t.S}` });
  await expect(row).toBeVisible();
  await expect(page.getByText("Waiting for a decision").locator("..")).toContainText("0");
  await page.getByRole("button", { name: "Approve and commit" }).click();
  await expect(page.getByRole("heading", { name: "Committed" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/1 new · 0 updated · 1 degree dates · 1 new Initiates/)).toBeVisible();

  const db = svc();
  const { data: person } = await db.from("persons").select("id, email").eq("membership_number", `${t.P}01`).single();
  expect(person!.email).toBe(`oswin.${t.P.toLowerCase()}@example.test`);
  expect((await db.from("lodge_memberships").select("id").eq("person_id", person!.id).eq("lodge_id", lodgeId(9001))).data).toHaveLength(1);
  expect((await db.from("member_journeys").select("stage").eq("person_id", person!.id).single()).data!.stage).toBe("entered_apprentice");

  await runJobs();
  const { data: ev } = await db.from("domain_events").select("id, processed_at").eq("type", "member.initiated").eq("entity_id", person!.id).single();
  expect(ev!.processed_at).not.toBeNull();

  // The allocated Assistant sees the notification.
  const apg = await browser.newContext();
  const apgPage = await apg.newPage();
  await signInRetry(apgPage, "apgmen1");
  await apgPage.goto("/notifications");
  await expect(apgPage.getByText("New Initiate in your area").first()).toBeVisible();
  const { data: notes } = await db.from("notifications").select("id").eq("account_id", secrets.users.apgmen1.accountId).eq("type", "workflow:member.initiated").gte("created_at", started.toISOString());
  expect(notes!.length).toBeGreaterThan(0);
  await apg.close();

  // No email to the imported member.
  expect((await db.from("email_outbox").select("id").eq("to_person_id", person!.id)).data).toHaveLength(0);
  expect(await latestEmail(person!.email!, { after: started, timeoutMs: 3000 })).toBeNull();
});
