/**
 * Phone layout (375 x 812) and accessibility (axe, WCAG 2.2 AA) for the main
 * events, communications, account and notification pages.
 */
import { expect as baseExpect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { secrets, signIn as sharedSignIn } from "./helpers";
import { serviceClient } from "./academy-fixtures";

// The shared dev server is busy while other suites run: allow for slow renders.
const expect = baseExpect.configure({ timeout: 20_000 });

/** The shared sign-in waits only 5s for the MFA page and other suites sign in as the same users; under load, try again. */
async function signIn(page: import("@playwright/test").Page, key: string) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await sharedSignIn(page, key);
    } catch (e) {
      if (attempt >= 3) throw e;
      await page.context().clearCookies();
    }
  }
}

const stamp = `${Date.now()}`;
let eventId = "";
let campaignId = "";

test.beforeAll(async () => {
  const db = serviceClient();
  const starts = new Date(Date.now() + 5 * 86400000);
  const { data: e, error } = await db.from("events").insert({
    org_id: secrets.orgId, title: `E2E mobile check ${stamp}`, description: "A synthetic event used to check the phone layout.", kind: "workshop", is_training: true,
    visibility: "learners", status: "published", registration_mode: "hub", capacity: 20, format: "hybrid", location: "Main hall",
    starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + 7200000).toISOString(),
  }).select("id").single();
  if (error) throw error;
  eventId = e!.id;
  await db.rpc("admin_notify", { p_account: secrets.users.learner1.accountId, p_type: "event", p_title: `New training available ${stamp}`, p_body: "A synthetic notice.", p_link: `/academy/events/${eventId}`, p_dedupe: `e2e-mobile:${stamp}` });
  const { data: c, error: e2 } = await db.from("campaigns").insert({
    org_id: secrets.orgId, title: `E2E mobile campaign ${stamp}`, subject: "A short update", body_markdown: "Dear {{first_name}},\n\nA synthetic message.",
    scope: "province", category: "operational", created_by: secrets.users.pgm.accountId, audience: { filters: { lodge_ids: [secrets.lodges.find((l: { number: number }) => l.number === 9010).id] }, include: [], exclude: [] },
  }).select("id").single();
  if (e2) throw e2;
  campaignId = c!.id;
});

test.afterAll(async () => {
  const db = serviceClient();
  await db.from("events").update({ status: "cancelled", cancelled_reason: "End-to-end test data" }).eq("id", eventId);
  await db.from("campaigns").update({ status: "cancelled" }).eq("id", campaignId);
  await db.from("notifications").update({ read_at: new Date().toISOString() }).eq("dedupe_key", `e2e-mobile:${stamp}`);
});

async function check(page: Page, path: string, name: string, heading: string | RegExp) {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  await page.screenshot({ path: `test-results/mobile/${name}.png`, fullPage: true });
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width, `${path} scrolls sideways`).toBeLessThanOrEqual(375);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`), path).toEqual([]);
}

test("organiser pages at phone width", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, "learninglead");
  await check(page, "/events", "events", "Events and training");
  await check(page, `/events/${eventId}`, "event", `E2E mobile check ${stamp}`);
  await check(page, `/events/${eventId}?tab=registrations`, "event-registrations", `E2E mobile check ${stamp}`);
});

test("communications at phone width", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, "pgm");
  await check(page, `/communications/${campaignId}`, "campaign", `E2E mobile campaign ${stamp}`);
  await check(page, `/communications/${campaignId}?tab=audience`, "campaign-audience", `E2E mobile campaign ${stamp}`);
  await check(page, "/notifications", "notifications-management", "Notifications");
});

test("learner pages at phone width", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, "learner1");
  await check(page, "/academy/events", "academy-events", "Training and events");
  await check(page, `/academy/events/${eventId}`, "academy-event", `E2E mobile check ${stamp}`);
  await check(page, "/account", "account", "My account");
  await check(page, "/account/notifications", "account-notifications", "Notification settings");
  await check(page, "/notifications", "notifications", "Notifications");
});
