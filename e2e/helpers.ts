import { expect, type Page } from "@playwright/test";
import { generateSync } from "otplib";
import { readFileSync } from "node:fs";

export const secrets = JSON.parse(readFileSync(".seed-secrets.json", "utf8"));

/** Sign in through the real login page, completing MFA where required. */
export async function signIn(page: Page, key: string) {
  const u = secrets.users[key];
  await page.goto("/login");
  await page.locator("input[name=email]").fill(u.email);
  await page.locator("input[name=password]").fill(u.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  if (u.totpSecret) {
    await expect(page.getByRole("heading", { name: "Two-step verification" })).toBeVisible();
    await page.locator("input[name=code]").fill(generateSync({ secret: u.totpSecret }));
    await page.getByRole("button", { name: "Verify" }).click();
  }
  await page.waitForURL((url) => !/\/(login|mfa)/.test(url.pathname));
}
