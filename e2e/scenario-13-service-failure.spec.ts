/**
 * Scenario 13: service failures are visible and recoverable.
 *  - An event confirmation to an address that cannot receive email is retried with
 *    backoff, then marked failed; the failure is recorded and listed on System health.
 *    Once the address is corrected, Retry sends it.
 *  - A workflow whose action cannot complete is retried, recorded as failed, and can
 *    be retried from System health.
 * Addresses ending @fail.test fail in the outbox (EMAIL_SIMULATE_FAILURES=1).
 */
import { expect as baseExpect, test } from "@playwright/test";
import { latestEmail, lodgeId, runJobs, secrets, signIn as sharedSignIn } from "./helpers";
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
const failing = `e2e-${stamp}@fail.test`;
const corrected = `e2e-${stamp}@example.test`;
const lastName = `Failsafe${stamp}`;

/** Other suites sign the same seeded users in and out; if this session was ended, sign in again. */
async function visit(page: import("@playwright/test").Page, key: string, path: string) {
  await page.goto(path);
  if (/\/login/.test(new URL(page.url()).pathname)) {
    await signIn(page, key);
    await page.goto(path);
  }
}

const must = <T,>(r: { data: T; error: unknown }) => { if (r.error) throw r.error; return r.data as NonNullable<T>; };

test.describe.configure({ mode: "serial" });

test("a failing email is retried, recorded, shown on System health and recovered", async ({ page }) => {
  test.setTimeout(240_000);
  page.on("dialog", (d) => d.accept());
  const db = serviceClient();
  const started = new Date();

  // A synthetic member whose address cannot receive email, and an event to book them on.
  const person = must(await db.from("persons").insert({ org_id: secrets.orgId, first_name: "Test", last_name: lastName, email: failing, status: "active" }).select("id").single()) as { id: string };
  await db.from("comm_preferences").upsert({ person_id: person.id, org_id: secrets.orgId }, { onConflict: "person_id", ignoreDuplicates: true });
  must(await db.from("lodge_memberships").insert({ org_id: secrets.orgId, person_id: person.id, lodge_id: lodgeId(9039), joined_on: "2025-01-01" }));
  const starts = new Date(Date.now() + 3 * 86400000);
  const event = must(await db.from("events").insert({ org_id: secrets.orgId, title: `E2E failure event ${stamp}`, kind: "workshop", is_training: true, visibility: "learners",
    status: "published", registration_mode: "hub", starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + 7200000).toISOString() }).select("id").single()) as { id: string };

  // The Provincial Grand Mentor registers them through the event page.
  await signIn(page, "pgm");
  await visit(page, "pgm", `/events/${event.id}?tab=registrations`);
  await page.getByRole("button", { name: "Register someone" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Member" }).fill(lastName);
  await dialog.getByRole("option", { name: new RegExp(lastName) }).click();
  await dialog.getByRole("button", { name: "Register" }).click();
  await expect(page.getByText("Registered. A confirmation email is on its way.")).toBeVisible();

  // Each run fails; the outbox schedules a retry with backoff, then gives up after five attempts.
  const outbox = async () => (await db.from("email_outbox").select("id, status, attempts, next_attempt_at, last_error").eq("to_email", failing).maybeSingle()).data;
  await expect.poll(async () => { await runJobs(); return (await outbox())?.attempts ?? 0; }, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  const first = (await outbox())!;
  expect(first.status).toBe("queued");
  expect(first.last_error).toContain("Simulated delivery failure");
  expect(new Date(first.next_attempt_at).getTime()).toBeGreaterThan(Date.now());
  for (let i = 0; i < 6 && (await outbox())!.status !== "failed"; i++) {
    // Fast-forward the backoff rather than waiting minutes.
    await db.from("email_outbox").update({ next_attempt_at: new Date().toISOString() }).eq("id", first.id).eq("status", "queued");
    await runJobs();
  }
  const final = (await outbox())!;
  expect(final).toMatchObject({ status: "failed", attempts: 5 });
  const { data: failures } = await db.from("integration_failures").select("message, context, retryable").eq("integration_key", "resend").contains("context", { outbox_id: first.id });
  expect(failures!.length).toBe(5);
  expect(failures!.some((f) => (f.context as { final?: boolean }).final === true)).toBe(true);

  // System health lists the failed email; after the address is corrected, Retry sends it.
  await visit(page, "pgm", "/admin/health");
  const row = page.getByRole("table", { name: "Failed emails" }).getByRole("row").filter({ hasText: failing });
  await expect(row).toBeVisible();
  await expect(page.getByText("Simulated delivery failure").first()).toBeVisible();
  await db.from("persons").update({ email: corrected }).eq("id", person.id);
  // The outbox keeps the address it was queued with, so correct the queued message too.
  await db.from("email_outbox").update({ to_email: corrected }).eq("id", first.id);
  await visit(page, "pgm", "/admin/health");
  await page.getByRole("table", { name: "Failed emails" }).getByRole("row").filter({ hasText: corrected }).getByRole("button", { name: "Retry" }).click();
  // The row leaves the failed list once queued again (its success message goes with it).
  await expect(page.getByRole("table", { name: "Failed emails" }).getByRole("row").filter({ hasText: corrected })).toHaveCount(0);
  await runJobs();
  await expect.poll(async () => (await db.from("email_outbox").select("status").eq("id", first.id).single()).data!.status, { timeout: 20_000 }).toBe("sent");
  expect(await latestEmail(corrected, { subject: /booked/i, after: started })).not.toBeNull();
});

test("a failing workflow is recorded and can be retried from System health", async ({ page }) => {
  test.setTimeout(180_000);
  page.on("dialog", (d) => d.accept());
  const db = serviceClient();
  const trigger = `e2e.failure_${stamp}`;
  const name = `E2E failing workflow ${stamp}`;
  const wf = must(await db.from("workflows").insert({ org_id: secrets.orgId, name, trigger_key: trigger, enabled: true, created_by: secrets.users.pgm.accountId,
    actions: [{ type: "set_lodge_status", params: { status_key: `missing_${stamp}` } }] }).select("id").single()) as { id: string };
  must(await db.from("domain_events").insert({ org_id: secrets.orgId, type: trigger, entity_type: "lodge", entity_id: lodgeId(9039), payload: {} }));

  const run = async () => (await db.from("workflow_runs").select("id, status, attempts, error").eq("workflow_id", wf.id).maybeSingle()).data;
  await expect.poll(async () => { await runJobs(); return (await run())?.attempts ?? 0; }, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  for (let i = 0; i < 5 && (await run())!.status !== "failed"; i++) {
    await db.from("workflow_runs").update({ next_attempt_at: new Date().toISOString() }).eq("workflow_id", wf.id).eq("status", "pending");
    await runJobs();
  }
  const failed = (await run())!;
  expect(failed.status).toBe("failed");
  expect(failed.error).toContain(`missing_${stamp}`);

  await signIn(page, "pgm");
  await visit(page, "pgm", "/admin/health");
  const row = page.getByRole("table", { name: "Workflow runs" }).getByRole("row").filter({ hasText: name });
  await expect(row).toBeVisible();
  await expect(row.getByText("Failed")).toBeVisible();

  // Correct the workflow (keep the Lodge's current status, so nothing else changes), then retry.
  const { data: lodge } = await db.from("v_lodge_overview").select("mentoring_status_key").eq("id", lodgeId(9039)).single();
  await db.from("workflows").update({ actions: [{ type: "set_lodge_status", params: { status_key: lodge!.mentoring_status_key } }] }).eq("id", wf.id);
  await row.getByRole("button", { name: "Retry" }).click();
  await expect.poll(async () => (await run())!.status, { timeout: 30_000 }).not.toBe("failed");
  await runJobs();
  await expect.poll(async () => (await run())!.status, { timeout: 20_000 }).toBe("succeeded");
  await db.from("workflows").update({ enabled: false }).eq("id", wf.id);
});
