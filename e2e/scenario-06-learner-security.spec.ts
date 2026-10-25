/**
 * Scenario 6 (UI level): a learner cannot reach Provincial management pages,
 * exports, another learner's lessons or certificates, or the authoring tools.
 */
import { expect, test } from "@playwright/test";
import { archiveCourses, createPublishedCourse, serviceClient } from "./academy-fixtures";
import { secrets, signIn } from "./helpers";

const stamp = `${Date.now().toString(36)}s6`;
let otherLesson: string, otherCertificate: string, versionId: string, lessonId: string;

// Several agents share one dev server, so compiles can be slow: allow generous time.
test.describe.configure({ timeout: 240_000 });

test.beforeAll(async () => {
  const course = await createPublishedCourse(stamp);
  versionId = course.versionId;
  lessonId = course.lessons[0]!.id;
  const db = serviceClient();
  const learner2 = secrets.users.learner2.personId;
  const { data: e, error } = await db.from("enrolments").insert({ org_id: secrets.orgId, person_id: learner2, course_id: course.courseId, course_version_id: course.versionId, source: "assigned" }).select("id").single();
  if (error) throw error;
  otherLesson = `/academy/learn/${e!.id}/${lessonId}`;
  const { data: c, error: e2 } = await db.from("certificates").insert({ org_id: secrets.orgId, person_id: learner2, kind: "recognition", reference: `E2E-${stamp}`,
    title: `Recognition ${stamp}`, learner_name: "Synthetic learner", completed_on: "2026-10-01", recognition_reason: "Synthetic certificate for an access test" }).select("id").single();
  if (e2) throw e2;
  otherCertificate = c!.id;
});
test.afterAll(async () => {
  await serviceClient().from("certificates").update({ revoked_at: new Date().toISOString(), revoked_reason: "End-to-end test data" }).eq("id", otherCertificate);
  await archiveCourses(`e2e-course-${stamp}`);
});

test("a learner is refused management pages, other learners' records and authoring", async ({ page }) => {
  await signIn(page, "learner1");
  await expect(page).toHaveURL(/\/academy$/);

  // Navigation offers the Academy only.
  const nav = page.getByRole("navigation", { name: "Academy" });
  await expect(nav.getByRole("link", { name: "My Learning" })).toBeVisible();
  for (const name of ["Lodges", "Members", "Support", "Reports", "Provincial Hub", "Authoring", "Dashboard"]) {
    await expect(page.getByRole("link", { name, exact: true }), name).toHaveCount(0);
  }

  const notFound = page.getByRole("heading", { name: "We could not find that page" });
  const refused = [
    "/dashboard", "/lodges", "/members", "/support", "/reports", "/imports", "/admin", "/learning", "/learning/learners", "/learning/approvals",
    "/library", "/search", "/communications", "/academy/author", `/academy/author/versions/${versionId}`, `/academy/author/preview/${versionId}/${lessonId}`, otherLesson,
  ];
  for (const path of refused) {
    const res = await page.goto(path);
    expect(res!.status(), path).toBe(404);
    await expect(notFound, path).toBeVisible();
    await expect(page.getByText(stamp), path).toHaveCount(0);
  }

  // Exports, certificate downloads and learner lookups return no data.
  for (const path of ["/api/export/lodges?format=csv", "/api/export/learning?format=csv", `/api/certificates/${otherCertificate}`, "/learning/people?q=Okafor"]) {
    const res = await page.request.get(path, { maxRedirects: 0 });
    // Refused either way: 404 (not found) or 401 (session not accepted). Never data.
    expect([401, 404], path).toContain(res.status());
    expect(await res.text(), path).not.toMatch(/Okafor|Lodge|%PDF/);
    expect(res.headers()["content-type"] ?? "", path).not.toMatch(/pdf|csv/);
  }
});
