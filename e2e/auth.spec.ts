import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./helpers";

test("sign-in page is accessible", async ({ page }) => {
  await page.goto("/login");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations).toEqual([]);
});

test("a learner lands in the Academy and cannot reach Provincial pages", async ({ page }) => {
  await signIn(page, "learner1");
  await expect(page).toHaveURL(/\/academy$/);
  await expect(page.getByRole("navigation", { name: "Academy" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Lodges" })).toHaveCount(0);
  for (const path of ["/dashboard", "/lodges", "/members", "/support", "/reports", "/imports", "/admin"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "We could not find that page" }), path).toBeVisible();
  }
});

test("Provincial leadership must complete two-step verification", async ({ page }) => {
  await signIn(page, "pgm");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Lodges" })).toBeVisible();
});

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("/lodges");
  await expect(page).toHaveURL(/\/login\?next=%2Flodges/);
});
