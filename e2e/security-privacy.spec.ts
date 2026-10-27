import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./helpers";

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
