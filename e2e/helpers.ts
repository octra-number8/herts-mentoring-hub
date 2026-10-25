import { expect, type Page } from "@playwright/test";
import { generateSync } from "otplib";
import { readFileSync } from "node:fs";

export const secrets = JSON.parse(readFileSync(".seed-secrets.json", "utf8"));
export const lodgeId = (n: number): string => secrets.lodges.find((l: { number: number }) => l.number === n).id;

/** Sign in through the real login page, completing MFA where required. */
export async function signIn(page: Page, key: string) {
  const u = secrets.users[key];
  await page.goto("/login");
  await page.locator("input[name=email]").fill(u.email);
  await page.locator("input[name=password]").fill(u.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  if (u.totpSecret) {
    await expect(page.getByRole("heading", { name: "Two-step verification" })).toBeVisible();
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.locator("input[name=code]").fill(generateSync({ secret: u.totpSecret }));
      await page.getByRole("button", { name: "Verify" }).click();
      const rejected = page.getByText("That code is not correct");
      const outcome = await Promise.race([
        page.waitForURL((url) => !/\/(login|mfa)/.test(url.pathname), { timeout: 45_000 }).then(() => "ok" as const),
        rejected.waitFor({ timeout: 45_000 }).then(() => "rejected" as const),
      ]);
      if (outcome === "ok") return;
      // Codes are single-use: wait for the next 30-second window and try again.
      await page.waitForTimeout(30_500 - (Date.now() % 30_000));
    }
    throw new Error(`MFA failed for ${key}`);
  }
  await page.waitForURL((url) => !/\/(login|mfa)/.test(url.pathname));
}

const MAILPIT = "http://127.0.0.1:55424/api/v1";

/** Latest captured email to an address (local SMTP capture), waiting up to `timeoutMs`. */
export async function latestEmail(to: string, opts: { subject?: RegExp; timeoutMs?: number; after?: Date } = {}) {
  const until = Date.now() + (opts.timeoutMs ?? 20_000);
  while (Date.now() < until) {
    const res = await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:${to}`)}&limit=20`);
    const data = (await res.json()) as { messages: { ID: string; Subject: string; Created: string }[] };
    const hit = data.messages.find((m) => (!opts.subject || opts.subject.test(m.Subject)) && (!opts.after || new Date(m.Created) >= opts.after));
    if (hit) return (await (await fetch(`${MAILPIT}/message/${hit.ID}`)).json()) as { Subject: string; Text: string; HTML: string };
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

/** Run background jobs now (emails, notifications, workflows) instead of waiting for cron. */
export async function runJobs() {
  const res = await fetch(`${process.env.APP_URL ?? "http://localhost:3100"}/api/cron/run`, { headers: { Authorization: "Bearer local-cron-secret" } });
  expect(res.status).toBe(200);
  return res.json();
}
