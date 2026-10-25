/**
 * Scenario 8: a training workshop from creation to feedback, through the real pages.
 * Create and publish, three bookings (the third waitlisted), a cancellation that
 * promotes the waiting list, session-code and personal-code check-in, a manual
 * override, completion, certificate and feedback.
 */
import { expect as baseExpect, test, type Browser, type Page } from "@playwright/test";
import { latestEmail, runJobs, secrets, signIn as sharedSignIn } from "./helpers";
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
const title = `E2E workshop ${stamp}`;

/** datetime-local value in UK time, `minutes` from now. */
function ukLocal(minutes: number) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(Date.now() + minutes * 60000)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

async function as(browser: Browser, key: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  await signIn(page, key);
  return page;
}

test.describe.configure({ mode: "serial" });

test("a workshop runs from creation to feedback", async ({ browser }) => {
  test.setTimeout(240_000);
  const started = new Date();

  // --- Learning lead creates and publishes the workshop -----------------------------
  const lead = await as(browser, "learninglead");
  await lead.goto("/events/new");
  await lead.getByLabel("Title", { exact: false }).fill(title);
  await lead.getByLabel("Type of event").selectOption("workshop");
  await lead.getByLabel("Starts", { exact: false }).fill(ukLocal(60));
  await lead.getByLabel("Finishes", { exact: false }).fill(ukLocal(180));
  await lead.getByLabel("Description").fill("A synthetic workshop used by the end-to-end tests.");
  await lead.getByLabel("Visibility").selectOption("learners");
  await lead.getByLabel("Capacity").fill("2");
  await lead.getByLabel("Issue a certificate of attendance").check();
  await lead.getByRole("button", { name: "Save as draft" }).click();
  await lead.waitForURL(/\/events\/[0-9a-f-]{36}$/);
  const eventId = lead.url().split("/").pop()!;
  await expect(lead.getByRole("heading", { name: title })).toBeVisible();
  await expect(lead.getByText("Draft: only organisers can see this event.")).toBeVisible();
  await lead.getByRole("button", { name: "Publish" }).click();
  await expect(lead.getByText("Published. The event is now visible to its audience.")).toBeVisible();

  // --- Three people book through the Academy ------------------------------------------
  const book = async (key: string, expected: RegExp) => {
    const p = await as(browser, key);
    await p.goto("/academy/events");
    await p.getByRole("link", { name: title }).click();
    await expect(p.getByRole("heading", { name: title })).toBeVisible();
    await p.getByRole("button", { name: "Book a place" }).click();
    await expect(p.getByText(expected)).toBeVisible();
    return p;
  };
  const learner1 = await book("learner1", /You're booked/);
  const learner2 = await book("learner2", /You're booked/);
  const pm1 = await book("pm1", /Waiting list \(position 1\)/);

  // --- One cancels; the waiting list is promoted and emailed ----------------------------
  await learner1.getByRole("button", { name: "Cancel my place" }).click();
  await expect(learner1.getByText("Your place has been cancelled.")).toBeVisible();
  await runJobs();
  const mail = await latestEmail(secrets.users.pm1.email, { subject: new RegExp(`booked: ${title}`), after: started });
  expect(mail, "promotion confirmation email").not.toBeNull();
  await pm1.reload();
  await expect(pm1.getByText("You have a place.")).toBeVisible();
  const code = (await pm1.locator("p.font-mono").innerText()).trim();
  expect(code).toMatch(/^[0-9a-f]{24}$/);

  // --- Check-in opens; a learner uses the presenter's session link ----------------------------
  await lead.goto(`/events/${eventId}?tab=checkin`);
  await lead.getByRole("button", { name: "Open check-in" }).click();
  await expect(lead.getByText("Check-in is open.", { exact: true })).toBeVisible();
  await lead.goto(`/events/${eventId}/present`);
  await expect(lead.getByRole("img", { name: "Session check-in QR code" })).toBeVisible();
  const link = (await lead.getByText(/\/checkin\//).innerText()).trim();
  expect(link).toContain(`/checkin/${eventId}?s=`);
  await learner2.goto(link);
  await learner2.getByRole("button", { name: "Confirm my attendance" }).click();
  await expect(learner2.getByText("You're checked in", { exact: true })).toBeVisible();

  // --- Personal code by manual entry on the scan page -------------------------------------
  await lead.goto(`/events/${eventId}/scan`);
  await lead.getByLabel("Personal check-in code").fill(code);
  await lead.getByRole("button", { name: "Check in", exact: true }).click();
  await expect(lead.getByText(/Checked in: .* is checked in\./)).toBeVisible();

  // --- Manual override with a reason --------------------------------------------------
  await lead.goto(`/events/${eventId}?tab=registrations`);
  const pmRow = lead.getByRole("row", { name: new RegExp(secrets.users.pm1.email) });
  await expect(pmRow.getByText("Attended")).toBeVisible();
  await pmRow.getByRole("button", { name: "Attendance" }).click();
  const dialog = lead.getByRole("dialog");
  await dialog.getByLabel("Record as").selectOption("no_show");
  await dialog.getByLabel("Reason", { exact: false }).fill(`Left before the start ${stamp}`);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(lead.getByText(`Note: Left before the start ${stamp}`)).toBeVisible();
  await expect(pmRow.getByText("Did not attend")).toBeVisible();

  const db = serviceClient();
  const { data: regs } = await db.from("registrations").select("person_id, status, checkin_method, override_reason").eq("event_id", eventId);
  const by = Object.fromEntries((regs ?? []).map((r) => [r.person_id, r]));
  expect(by[secrets.users.learner1.personId].status).toBe("cancelled");
  expect(by[secrets.users.learner2.personId]).toMatchObject({ status: "attended", checkin_method: "qr_session" });
  expect(by[secrets.users.pm1.personId]).toMatchObject({ status: "no_show", override_reason: `Left before the start ${stamp}` });

  // --- Complete the event ---------------------------------------------------------------
  await lead.goto(`/events/${eventId}`);
  await lead.getByRole("button", { name: "Mark completed" }).click();
  await expect(lead.getByText(/Event completed\./)).toBeVisible();
  await expect(lead.getByText("Completed", { exact: true }).first()).toBeVisible();

  // --- The attendee has a certificate and gives feedback --------------------------------
  await learner2.goto("/academy/certificates");
  await expect(learner2.getByRole("heading", { name: title })).toBeVisible();
  await learner2.goto(`/academy/events/${eventId}#feedback`);
  await learner2.getByLabel("5 Very useful").check();
  await learner2.getByLabel("Anything you would like to tell the organisers?").fill(`Very practical ${stamp}`);
  await learner2.getByRole("button", { name: "Send feedback" }).click();
  await expect(learner2.getByText(/Thank you for your feedback\./)).toBeVisible();

  await lead.goto(`/events/${eventId}?tab=checkin`);
  await expect(lead.getByText(`Very practical ${stamp}`)).toBeVisible();
  await expect(lead.getByText("5.0 / 5")).toBeVisible();
});
