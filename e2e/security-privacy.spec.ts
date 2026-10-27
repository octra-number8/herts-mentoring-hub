import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./helpers";
import { archiveCourses, createPublishedCourse, serviceClient } from "./academy-fixtures";

// October 2026 security and privacy review (docs/security/security-review-2026-10.md).

const cspViolations = (page: Page) => {
  const seen: string[] = [];
  page.on("console", (m) => { if (/Content Security Policy|Refused to (load|execute|apply|frame)/i.test(m.text())) seen.push(m.text()); });
  return seen;
};

test("the privacy notice is public, accessible and marked as a draft while facts are unconfirmed", async ({ page }) => {
  const res = await page.goto("/privacy");
  expect(res?.status()).toBe(200);
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { name: "Privacy notice", level: 1 })).toBeVisible();
  await expect(page.getByTestId("privacy-draft")).toContainText("Draft: not yet approved");
  await expect(page.getByRole("heading", { name: "Your rights" })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations).toEqual([]);
});

test("the notice is linked from sign-in, set-up and signed-in footers, with no consent tick-box", async ({ page }) => {
  for (const path of ["/login", "/join", "/whats-on"]) {
    await page.goto(path);
    await expect(page.getByRole("link", { name: /privacy notice/i }).first(), path).toHaveAttribute("href", "/privacy");
  }
  await signIn(page, "learner1");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Privacy notice" })).toBeVisible();
});

test("pages send a nonce-based Content Security Policy and run without violations", async ({ page }) => {
  const violations = cspViolations(page);
  const res = await page.goto("/login");
  const csp = res?.headers()["content-security-policy"] ?? "";
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  await signIn(page, "learner1");
  await page.goto("/academy/courses");
  await page.goto("/account");
  await page.context().clearCookies();
  await signIn(page, "pgm");
  await page.goto("/dashboard");
  await page.goto("/reports");
  expect(violations).toEqual([]);
});

test("course videos from YouTube load only when the learner chooses", async ({ page }) => {
  test.setTimeout(180_000);
  const stamp = `${Date.now().toString(36)}vid`;
  const course = await createPublishedCourse(stamp);
  try {
    const welcome = course.lessons.find((l) => l.kind === "content")!;
    await serviceClient().from("lessons").update({ content: { blocks: [{ type: "video", title: "Synthetic video", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }] } }).eq("id", welcome.id);
    const external: string[] = [];
    page.on("request", (r) => { if (/youtube|ytimg|vimeo/.test(new URL(r.url()).hostname)) external.push(r.url()); });
    await signIn(page, "learninglead");
    await page.goto(`/academy/author/preview/${course.versionId}/${welcome.id}`);
    const load = page.getByRole("button", { name: "Load video from YouTube" });
    await expect(load).toBeVisible({ timeout: 60_000 });
    await expect(page.locator("iframe[src*='youtube']")).toHaveCount(0);
    expect(external).toEqual([]);
    await load.click();
    await expect(page.locator("iframe[title='Synthetic video']")).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  } finally {
    await archiveCourses(`e2e-course-${stamp}`);
  }
});
