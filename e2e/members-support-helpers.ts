import { expect, type Locator, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { generateSync } from "otplib";
import { secrets } from "./helpers";

config({ path: ".env.local", quiet: true });

/** Service-role client, used only to confirm what was stored. */
export const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

export const stamp = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
export const accountId = (key: string): string => secrets.users[key].accountId;
export const personId = (key: string): string => secrets.users[key].personId;

export async function displayName(key: string): Promise<string> {
  const { data } = await svc().from("persons").select("display_name").eq("id", personId(key)).single();
  return data!.display_name as string;
}

/** The currently open modal dialog. */
export const dialog = (page: Page) => page.locator("dialog[open]");

/** Choose the option whose text contains `text` (account options carry role details). */
export async function chooseOption(select: Locator, text: string) {
  await expect(select.locator("option", { hasText: text }).first()).toBeAttached();
  const value = await select.locator("option", { hasText: text }).first().getAttribute("value");
  await select.selectOption(value!);
}

/** Type into a PersonPicker and choose the first match containing `name`. */
export async function pickPerson(scope: Locator, label: string, search: string, name: string) {
  const box = scope.getByRole("combobox", { name: label });
  await box.fill(search);
  await scope.getByRole("option", { name: new RegExp(name) }).first().click();
}

/** Submit the open dialog and wait for it to close (success). */
export async function submitDialog(page: Page, button: string) {
  await dialog(page).getByRole("button", { name: button, exact: true }).click();
  await expect(dialog(page)).toHaveCount(0, { timeout: 60_000 });
}

/**
 * Sign in like e2e/helpers.ts signIn, but tolerant of a busy shared dev server
 * (several agents run suites at once, and the MFA step can take well over 5s).
 */
export async function signInPatiently(page: Page, key: string) {
  const u = secrets.users[key];
  // Filling before the login page hydrates can lose the values (the form then
  // submits empty), so retry the password step until it moves on.
  for (let attempt = 0; ; attempt++) {
    await page.goto("/login");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.locator("input[name=email]").fill(u.email);
    await page.locator("input[name=password]").fill(u.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    const moved = await Promise.race([
      page.waitForURL((url) => !/\/login/.test(url.pathname), { timeout: 60_000 }).then(() => true),
      page.getByRole("heading", { name: "Two-step verification" }).waitFor({ timeout: 60_000 }).then(() => true),
      page.waitForTimeout(3_000).then(async () => (await page.locator("input[name=email]").inputValue().catch(() => "x")) === "" ? false : new Promise<boolean>(() => {})),
    ]).catch(() => false);
    if (moved) break;
    if (attempt >= 2) throw new Error(`Sign-in did not proceed for ${key}`);
  }
  if (!u.totpSecret) {
    await page.waitForURL((url) => !/\/(login|mfa)/.test(url.pathname), { timeout: 60_000 });
    return;
  }
  await expect(page.getByRole("heading", { name: "Two-step verification" })).toBeVisible({ timeout: 60_000 });
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.locator("input[name=code]").fill(generateSync({ secret: u.totpSecret }));
    await page.getByRole("button", { name: "Verify" }).click();
    const outcome = await Promise.race([
      page.waitForURL((url) => !/\/(login|mfa)/.test(url.pathname), { timeout: 60_000 }).then(() => "ok" as const),
      page.getByText("That code is not correct").waitFor({ timeout: 60_000 }).then(() => "rejected" as const),
    ]);
    if (outcome === "ok") return;
    await page.waitForTimeout(30_500 - (Date.now() % 30_000));
  }
  throw new Error(`MFA failed for ${key}`);
}
