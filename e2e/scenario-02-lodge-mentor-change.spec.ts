import { expect as baseExpect, test } from "@playwright/test";
import { lodgeId, runJobs, secrets } from "./helpers";
import { svc, signInRetry } from "./imports-fixtures";

// The shared local stack is busy while several suites run; allow for slow responses.
const expect = baseExpect.configure({ timeout: 45_000 });
test.describe.configure({ timeout: 360_000 });

test("Scenario 2: an Assistant records a new Lodge Mentor; history is kept, the Assistant is prompted, and no portal opens", async ({ page }) => {
  const L = lodgeId(9005);
  const run = Date.now().toString(36);
  const db = svc();
  const started = new Date().toISOString();
  const { data: person, error } = await db.from("persons").insert({ org_id: secrets.orgId, title: "Bro", first_name: "Caradoc", last_name: `Polglaze${run}`, status: "active", source: "local" }).select("id").single();
  if (error) throw error;
  const { error: mErr } = await db.from("lodge_memberships").insert({ org_id: secrets.orgId, person_id: person!.id, lodge_id: L, is_primary: true, joined_on: "2015-03-01", source: "local" });
  if (mErr) throw mErr;
  const { data: before } = await db.from("lodge_appointments").select("person_id, persons(display_name)").eq("lodge_id", L).eq("office", "lodge_mentor").is("ends_on", null).maybeSingle();
  const previous = (before?.persons as unknown as { display_name: string } | null)?.display_name;

  await signInRetry(page, "apgmen1");
  await page.goto(`/lodges/${L}`);
  await page.getByRole("button", { name: "Record appointment" }).click();
  const dialog = page.getByRole("dialog", { name: "Record an appointment" });
  await expect(dialog.getByLabel("Office", { exact: true })).toHaveValue("lodge_mentor");
  await dialog.getByRole("combobox", { name: "Brother appointed" }).fill(`Polglaze${run}`);
  await dialog.getByRole("option", { name: new RegExp(`Polglaze${run}`) }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });

  await expect(page.getByRole("row").filter({ hasText: "Lodge Mentor" }).filter({ hasText: `Polglaze${run}` })).toBeVisible();
  if (previous) {
    await page.getByText(/Appointment history/).click();
    await expect(page.getByRole("listitem").filter({ hasText: `Lodge Mentor: ${previous}` }).first()).toContainText(" to ");
  }

  // The workflow creates a task for the allocated Assistant once jobs run.
  await runJobs();
  const { data: tasks } = await db.from("tasks").select("title, owner_account_id").eq("lodge_id", L).like("title", "Introductory call with the new Lodge Mentor%").gte("created_at", started);
  expect(tasks!.length).toBeGreaterThan(0);
  expect(tasks![0].owner_account_id).toBe(secrets.users.apgmen1.accountId);
  await page.goto("/notifications");
  await expect(page.getByText(/Introductory call with the new Lodge Mentor/).first()).toBeVisible();

  // Recording a Lodge Mentor gives no portal: there is no activation for this person or Lodge.
  expect((await db.from("user_accounts").select("id").eq("person_id", person!.id)).data).toHaveLength(0);
  expect((await db.from("feature_activations").select("id").eq("lodge_id", L).eq("active", true)).data).toHaveLength(0);
});
