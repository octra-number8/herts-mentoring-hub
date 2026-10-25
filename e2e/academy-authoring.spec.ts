/**
 * Course authoring end to end: an L&D contributor builds a course in the UI and
 * submits it; the learning lead approves and publishes it; a learner finds it.
 */
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { archiveCourses, serviceClient } from "./academy-fixtures";
import { signIn } from "./helpers";

// The shared dev server compiles pages on first visit; allow for it.
const expect = baseExpect.configure({ timeout: 60_000 });

const stamp = Date.now().toString(36);
const slug = `e2e-authored-${stamp}`;
const title = `Listening well ${stamp}`;

// Several agents share one dev server, so compiles can be slow: allow generous time.
test.describe.configure({ timeout: 240_000 });

test.afterAll(async () => { await archiveCourses(slug); });

async function addLesson(page: Page, moduleTitle: string, lessonTitle: string, kind: string) {
  await page.getByRole("region", { name: moduleTitle }).getByRole("button", { name: "Add lesson" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Lesson title", { exact: false }).fill(lessonTitle);
  await dialog.getByLabel("Kind").selectOption({ label: kind });
  await dialog.getByLabel("Estimated minutes").fill("5");
  await dialog.getByRole("button", { name: "Add lesson" }).click();
  await expect(page.getByRole("heading", { level: 1, name: lessonTitle })).toBeVisible();
  await page.waitForLoadState("networkidle");
}

test("author builds a course, the learning lead publishes it and learners can find it", async ({ browser }) => {
  // --- Author ---
  const authorCtx = await browser.newContext();
  const page = await authorCtx.newPage();
  await signIn(page, "author");
  await page.getByRole("navigation", { name: "Academy" }).getByRole("link", { name: "Authoring" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Authoring" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "New course" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Create course" }).click();
  await expect(dialog.getByRole("alert").first()).toBeVisible();
  await expect(dialog.getByText("Title is required")).toBeVisible();
  await dialog.getByLabel("Title", { exact: false }).fill(title);
  await dialog.getByLabel("Web address", { exact: false }).fill(slug);
  await dialog.getByLabel("Summary").fill("How to listen so a newer Brother feels heard.");
  await dialog.getByLabel("Level").selectOption("recommended");
  await dialog.getByLabel("Principle").selectOption("support");
  await dialog.getByLabel("Personal Mentors").check();
  await dialog.getByRole("button", { name: "Create course" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `${title} · version 1` })).toBeVisible();
  await page.waitForLoadState("networkidle");

  // Module.
  await page.getByRole("button", { name: "Add module" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Module title", { exact: false }).fill("Being present");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "1. Being present" })).toBeVisible();

  // Reading lesson with a text block.
  await addLesson(page, "1. Being present", "Why listening matters", "Reading");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByLabel("Text", { exact: true }).fill("## Listening\n\nGive your full attention. Ask: **How can we help?**");
  await page.getByRole("button", { name: "Save content" }).click();
  await expect(page.getByText("Lesson content saved.")).toBeVisible();

  // Knowledge check with a question and answer key.
  await page.getByRole("link", { name: "Version 1" }).click();
  await addLesson(page, "1. Being present", "Check your understanding", "Knowledge check");
  await page.getByRole("button", { name: "Add question" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Save question" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Write the question");
  await dialog.getByLabel("Question", { exact: true }).fill("What should come first in a difficult conversation?");
  await dialog.getByLabel("Option 1", { exact: true }).fill("Listening");
  await dialog.getByLabel("Option 2", { exact: true }).fill("Advice");
  await dialog.getByLabel("Option 1 is correct").check();
  await dialog.getByLabel("Feedback when correct").fill("Yes: listen first.");
  await dialog.getByLabel("Feedback when not correct").fill("Listening comes before advice.");
  await dialog.getByRole("button", { name: "Save question" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("1. What should come first in a difficult conversation?")).toBeVisible();
  await expect(page.getByText("Correct: Listening")).toBeVisible();

  // Preview, then submit for review.
  await page.getByRole("link", { name: "Preview as learner" }).click();
  await expect(page.getByText(/Preview of version 1/)).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Advice").check();
  await page.getByRole("button", { name: "Check answers (preview)" }).click();
  await expect(page.getByText("Listening comes before advice.")).toBeVisible();
  await page.getByRole("link", { name: "Back to the version" }).click();
  await expect(page.getByRole("button", { name: "Submit for review" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Submit for review" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Change summary").fill("First version.");
  await dialog.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("In review", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Withdraw from review" })).toBeVisible();
  await authorCtx.close();

  // --- Learning lead ---
  const leadCtx = await browser.newContext();
  const lead = await leadCtx.newPage();
  await signIn(lead, "learninglead");
  await lead.goto("/learning/approvals");
  await lead.waitForLoadState("networkidle");
  const awaiting = lead.getByRole("region", { name: /Awaiting review/ });
  const item = awaiting.getByRole("listitem").filter({ hasText: title });
  await expect(item).toContainText("By Bro Hugo Penrose");
  await item.getByRole("button", { name: "Approve" }).click();
  dialog = lead.getByRole("dialog");
  await dialog.getByLabel("Note (optional)").fill("Clear and kind.");
  await dialog.getByRole("button", { name: "Approve" }).click();
  const ready = lead.getByRole("region", { name: /Approved, ready to publish/ }).getByRole("listitem").filter({ hasText: title });
  await expect(ready).toBeVisible();
  lead.once("dialog", (d) => d.accept());
  await ready.getByRole("button", { name: "Publish" }).click();
  await expect(lead.getByRole("region", { name: "Published courses" }).getByRole("listitem").filter({ hasText: title })).toBeVisible();
  await leadCtx.close();

  // --- Learner ---
  const learnerCtx = await browser.newContext();
  const learner = await learnerCtx.newPage();
  await signIn(learner, "learner1");
  await learner.goto("/academy/courses?level=recommended");
  await learner.getByRole("link", { name: title }).click();
  await expect(learner.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await learner.waitForLoadState("networkidle");
  await expect(learner.getByText("Why listening matters")).toBeVisible();
  await expect(learner.getByRole("button", { name: "Start this course" })).toBeVisible();
  await learnerCtx.close();

  // Stored result: published version with the answer key kept separately.
  const db = serviceClient();
  const { data: course } = await db.from("courses").select("published_version_id, course_versions!course_versions_course_id_fkey(status, approved_by, created_by)").eq("slug", slug).single();
  const v = (course!.course_versions as { status: string; approved_by: string; created_by: string }[])[0]!;
  expect(v.status).toBe("published");
  expect(v.approved_by).not.toBe(v.created_by);
  const { data: q } = await db.from("questions").select("prompt, question_keys(correct)").eq("prompt", "What should come first in a difficult conversation?")
    .in("lesson_id", ((await db.from("lessons").select("id, course_modules!inner(version_id)").eq("course_modules.version_id", course!.published_version_id)).data ?? []).map((l) => l.id));
  expect(q).toHaveLength(1);
  expect(JSON.stringify(q![0]!.question_keys)).toContain('"a"');
});
