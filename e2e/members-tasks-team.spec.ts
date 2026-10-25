import { expect as baseExpect, test } from "@playwright/test";
import { lodgeId } from "./helpers";
import { accountId, chooseOption, dialog, displayName, personId, signInPatiently, stamp, submitDialog, svc } from "./members-support-helpers";

// The shared dev server compiles pages on first visit and is busy with other agents' runs.
const expect = baseExpect.configure({ timeout: 45_000 });
test.describe.configure({ timeout: 300_000 });

async function memberOf(lodgeNumber: number): Promise<string> {
  const { data } = await svc().from("lodge_memberships").select("person_id, persons!inner(is_restricted, status)")
    .eq("lodge_id", lodgeId(lodgeNumber)).is("left_on", null).eq("persons.is_restricted", false).eq("persons.status", "active").limit(5);
  return data![Math.floor(Math.random() * data!.length)].person_id as string;
}

test("an Assistant updates a member's journey, Personal Mentor allocation and contact details", async ({ page }) => {
  const member = await memberOf(9004);
  await signInPatiently(page, "apgmen1");
  await page.goto(`/members/${member}`);
  await expect(page.getByRole("heading", { name: "Mentoring journey" })).toBeVisible();

  // Journey
  await page.getByRole("button", { name: /^(Edit|Start journey)$/ }).first().click();
  await dialog(page).locator("select[name=stage]").selectOption("fellow_craft");
  await dialog(page).locator("select[name=royal_arch]").selectOption("interested");
  await dialog(page).locator("input[name=next_review_on]").fill("2027-02-01");
  await submitDialog(page, "Save");
  await expect(page.getByText("Fellow Craft", { exact: true })).toBeVisible();
  await expect(page.getByText("1 Feb 2027")).toBeVisible();

  // Personal Mentor: Yes, confirmed today by the person recording it; mentor's name optional.
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await dialog(page).getByLabel("Yes", { exact: true }).check();
  await dialog(page).locator("input[name=personal_mentor_review_on]").fill("2027-04-01");
  await submitDialog(page, "Save");
  await expect(page.getByText("Not named (optional)")).toBeVisible();
  const { data: j } = await svc().from("member_journeys").select("stage, royal_arch, personal_mentor_allocated, personal_mentor_confirmed_by, personal_mentor_person_id, personal_mentor_review_on").eq("person_id", member).single();
  expect(j).toMatchObject({ stage: "fellow_craft", royal_arch: "interested", personal_mentor_allocated: "yes", personal_mentor_confirmed_by: personId("apgmen1"), personal_mentor_person_id: null, personal_mentor_review_on: "2027-04-01" });

  // Local correction to a contact detail.
  const phone = `07700 9${Math.floor(Math.random() * 90000 + 10000)}`;
  await page.getByRole("button", { name: "Correct a detail" }).click();
  await dialog(page).locator("select[name=field]").selectOption("phone");
  await dialog(page).locator("input[name=value]").fill(phone);
  await dialog(page).locator("textarea[name=reason]").fill("Brother gave his new number at the Lodge meeting");
  await submitDialog(page, "Save");
  await expect(page.getByText(phone).first()).toBeVisible();
  await expect(page.getByText("Local correction").first()).toBeVisible();
  const { data: p } = await svc().from("persons").select("phone, local_corrections").eq("id", member).single();
  expect(p!.phone).toBe(phone);
  expect((p!.local_corrections as Record<string, { reason: string }>).phone.reason).toBe("Brother gave his new number at the Lodge meeting");
});

test("a task is created, reassigned, commented on and completed", async ({ page }) => {
  const title = `Telephone the Lodge Secretary ${stamp()}`;
  const newOwner = await displayName("apgmen2");
  await signInPatiently(page, "apgmen1");
  await page.goto("/tasks");
  await page.locator("input[name=title]").fill(title);
  await page.locator("input[name=due_on]").first().fill("2026-12-15");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText("Task added.")).toBeVisible();
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const taskId = page.url().match(/tasks\/([0-9a-f-]{36})/)![1];

  await page.getByRole("button", { name: "Reassign" }).click();
  await chooseOption(dialog(page).locator("select[name=owner_account_id]"), newOwner);
  await dialog(page).locator("input[name=note]").fill("Bernard knows the Secretary well.");
  await submitDialog(page, "Reassign");
  await expect(page.getByText(newOwner).first()).toBeVisible();

  await page.locator("textarea[name=body]").fill("Left a message on Tuesday.");
  await page.getByRole("button", { name: "Add comment" }).click();
  await expect(page.getByText("Left a message on Tuesday.")).toBeVisible();

  await page.getByRole("button", { name: "Mark done" }).click();
  await expect(page.getByRole("button", { name: "Reopen" })).toBeVisible();
  const { data: t } = await svc().from("tasks").select("status, owner_account_id, completed_by").eq("id", taskId).single();
  expect(t).toEqual({ status: "done", owner_account_id: accountId("apgmen2"), completed_by: accountId("apgmen1") });
  const { count } = await svc().from("notifications").select("id", { count: "exact", head: true }).eq("account_id", accountId("apgmen2")).eq("link", `/tasks/${taskId}`);
  expect(count).toBe(1);
});

test("a meeting gets an agenda, attendance, approved minutes and an action in the task list", async ({ page }) => {
  const title = `Provincial team meeting ${stamp()}`;
  const action = `Circulate the Lodge Mentor guide ${stamp()}`;
  const me = await displayName("pgm");
  page.on("dialog", (d) => d.accept());
  await signInPatiently(page, "pgm");
  await page.goto("/team/meetings");
  await page.getByRole("button", { name: "New meeting" }).click();
  await dialog(page).locator("input[name=title]").fill(title);
  await dialog(page).locator("input[name=starts_at]").fill("2026-12-03T19:00");
  await dialog(page).locator("input[name=location]").fill("Provincial Office");
  await dialog(page).getByRole("button", { name: "Create meeting" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const meetingId = page.url().match(/meetings\/([0-9a-f-]{36})/)![1];

  await page.getByRole("button", { name: "Add item" }).click();
  await dialog(page).locator("input[name=title]").fill("Lodge Mentor coverage");
  await dialog(page).locator("input[name=document_url]").fill("https://example.test/coverage.pdf");
  await submitDialog(page, "Save");
  await expect(page.getByText("Lodge Mentor coverage")).toBeVisible();

  await page.getByLabel(`Attendance for ${me}`).selectOption("attended");
  await page.getByLabel(`Attendance for ${me}`).locator("xpath=ancestor::form").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("1 attended")).toBeVisible();

  await page.locator("textarea[name=minutes]").fill("Coverage reviewed. **Agreed** to circulate the guide.");
  await page.getByRole("button", { name: "Save draft" }).click();
  // Saved minutes render in the panel and await approval.
  await expect(page.getByText("Draft, awaiting approval.")).toBeVisible();
  await expect(page.getByText("Coverage reviewed.", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "Approve minutes" }).click();
  await expect(page.getByText(/^Approved by /)).toBeVisible();

  await page.getByRole("button", { name: "Add action" }).click();
  await dialog(page).locator("input[name=title]").fill(action);
  await submitDialog(page, "Save");
  await expect(page.getByRole("link", { name: action })).toBeVisible();

  const { data: m } = await svc().from("meetings").select("minutes_status, minutes_approved_by").eq("id", meetingId).single();
  expect(m).toEqual({ minutes_status: "approved", minutes_approved_by: accountId("pgm") });
  const { data: att } = await svc().from("meeting_attendees").select("attendance").eq("meeting_id", meetingId).eq("person_id", personId("pgm")).single();
  expect(att!.attendance).toBe("attended");

  // The action is a task linked to the meeting, in the owner's task list.
  await page.goto("/tasks");
  await page.getByRole("link", { name: action }).click();
  await expect(page.getByRole("link", { name: `Meeting: ${title}` })).toBeVisible();
});
