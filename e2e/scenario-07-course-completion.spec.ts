/**
 * Scenario 7: a learner enrols on a published course, works through every
 * lesson kind in the player, fails then passes the knowledge check, and
 * downloads the certificate.
 */
import { expect as baseExpect, test } from "@playwright/test";
import { archiveCourses, createPublishedCourse, serviceClient } from "./academy-fixtures";
import { secrets, signIn } from "./helpers";

// The shared dev server compiles pages on first visit; allow for it.
const expect = baseExpect.configure({ timeout: 60_000 });

const stamp = `${Date.now().toString(36)}s7`;
let course: Awaited<ReturnType<typeof createPublishedCourse>>;

// Several agents share one dev server, so compiles can be slow: allow generous time.
test.describe.configure({ timeout: 240_000 });

test.beforeAll(async () => { course = await createPublishedCourse(stamp); });
test.afterAll(async () => { await archiveCourses(`e2e-course-${stamp}`); });

test("a learner completes a course and downloads the certificate", async ({ page }) => {
  await signIn(page, "learner2");
  await expect(page).toHaveURL(/\/academy$/);
  await expect(page.getByRole("heading", { level: 1, name: /Welcome/ })).toBeVisible();

  // Browse to the course from the catalogue.
  await page.getByRole("navigation", { name: "Academy" }).getByRole("link", { name: "Courses" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Courses" })).toBeVisible();
  await page.getByRole("link", { name: course.title }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: course.title })).toBeVisible();
  await page.getByRole("button", { name: "Start this course" }).click();

  // Lesson 1: reading.
  await expect(page.getByRole("heading", { level: 1, name: "Welcome" })).toBeVisible();
  await expect(page.getByText("Prepare · Guide · Support · Enlighten").first()).toBeVisible();
  await page.getByRole("button", { name: "Mark complete and continue" }).click();

  // Lesson 2: branching scenario, including a detour and the path summary.
  await expect(page.getByRole("heading", { level: 1, name: "A first conversation" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Tell him to read more" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Reassurance first." })).toBeVisible();
  await page.getByRole("button", { name: "Ask how he is finding things" }).click();
  await expect(page.getByRole("status").filter({ hasText: "A good start: How can we help?" })).toBeVisible();
  await expect(page.getByText("You have reached the end of the scenario.")).toBeVisible();
  await expect(page.getByText("Your path so far (2 choices)")).toBeVisible();
  await page.getByRole("button", { name: "Mark complete and continue" }).click();

  // Lesson 3: private reflection.
  await expect(page.getByRole("heading", { level: 1, name: "Reflection" })).toBeVisible();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("Please check the highlighted fields.").or(page.getByText("Please write a short reflection"))).toBeVisible();
  await page.getByLabel("What helped you settle in?", { exact: false }).fill(`A friendly welcome and a patient mentor (${stamp}).`);
  await page.getByRole("button", { name: "Save and continue" }).click();

  // Lesson 4: knowledge check, failed then passed.
  await expect(page.getByRole("heading", { level: 1, name: "Knowledge check" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Attempts remaining: 3 of 3")).toBeVisible();
  await page.getByLabel("Why aren't you attending?").check();
  await page.getByRole("button", { name: "Submit answers" }).click();
  await expect(page.getByText("You scored 0%. The pass mark is 100%.")).toBeVisible();
  await expect(page.getByText("Not quite")).toBeVisible();
  await expect(page.getByText("The house phrase is How can we help?")).toBeVisible();
  await expect(page.getByText("Attempts remaining: 2 of 3")).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await page.getByLabel("How can we help?").check();
  await page.getByRole("button", { name: "Submit answers" }).click();
  await expect(page.getByText("Passed with 100%")).toBeVisible();
  await expect(page.getByText("That completes the course.")).toBeVisible();
  await page.getByRole("link", { name: "See your achievement" }).click();

  // Completion on the course page.
  await expect(page.getByText("Course complete. Well done.")).toBeVisible();
  await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible();

  // The reflection is stored privately for this learner.
  const db = serviceClient();
  const { data: refl } = await db.from("reflections").select("response").eq("person_id", secrets.users.learner2.personId)
    .eq("lesson_id", course.lessons.find((l) => l.kind === "reflection")!.id).single();
  expect(refl!.response).toContain(stamp);

  // Certificate list and PDF download.
  await page.getByRole("navigation", { name: "Academy" }).getByRole("link", { name: "My Certificates" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "My Certificates" })).toBeVisible();
  const card = page.getByRole("listitem").filter({ hasText: course.title });
  await expect(card).toBeVisible();
  const href = await card.getByRole("link", { name: /Download PDF/ }).getAttribute("href");
  const pdf = await page.request.get(href!);
  expect(pdf.status(), await pdf.text().catch(() => "")).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");

  // My Progress reflects the completion and the quiz attempts.
  await page.getByRole("navigation", { name: "Academy" }).getByRole("link", { name: "My Progress" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "My Progress" })).toBeVisible();
  const completed = page.getByRole("region", { name: "Completed" });
  await expect(completed.getByRole("link", { name: course.title })).toBeVisible();
  const checkRow = page.getByRole("row").filter({ hasText: course.title });
  await expect(checkRow).toContainText("2 of 3");
  await expect(checkRow).toContainText("100%");
  await expect(checkRow).toContainText("Passed");
});
