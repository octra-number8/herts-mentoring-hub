import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { lodgeId, signIn } from "./helpers";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

test.describe("Lodges", () => {
  test("an Assistant records contact, visit, review, status, note and task on an allocated Lodge", async ({ page }) => {
    const stamp = Date.now();
    await signIn(page, "apgmen1");
    await page.goto("/lodges?mine=1");
    await expect(page.getByRole("heading", { name: "Lodges" })).toBeVisible();
    await page.goto(`/lodges/${lodgeId(9004)}`);

    // Log contact
    await page.getByRole("button", { name: "Log contact" }).click();
    const contactDialog = page.getByRole("dialog");
    await contactDialog.locator("textarea[name=summary]").fill(`E2E contact ${stamp}`);
    await contactDialog.getByRole("button", { name: "Save contact" }).click();
    await expect(contactDialog).toBeHidden();

    // Plan visit
    await page.getByRole("button", { name: "Plan visit" }).click();
    const visit = page.getByRole("dialog");
    await visit.locator("input[name=planned_for]").fill("2027-01-15T19:00");
    await visit.locator("textarea[name=purpose]").fill(`E2E visit ${stamp}`);
    await visit.getByRole("button", { name: "Plan visit" }).click();
    await expect(visit).toBeHidden();

    // Annual review
    await page.getByRole("button", { name: "Annual review" }).click();
    const review = page.getByRole("dialog");
    await review.locator("textarea[name=what_is_working]").fill(`E2E working well ${stamp}`);
    await review.getByRole("button", { name: "Save review" }).click();
    await expect(review).toBeHidden();

    // Status change
    await page.getByRole("button", { name: "Change" }).click();
    const status = page.getByRole("dialog");
    await status.locator("select[name=status_id]").selectOption({ label: "Contact Due" });
    await status.getByRole("button", { name: "Save" }).click();
    await expect(status).toBeHidden();
    await expect(page.locator("header").getByText("Contact Due")).toBeVisible();

    // Activity timeline shows the work
    await page.getByRole("link", { name: "Activity" }).click();
    await expect(page.getByText(`E2E contact ${stamp}`)).toBeVisible();
    await expect(page.getByText(`E2E visit ${stamp}`)).toBeVisible();
    await expect(page.getByText(`E2E working well ${stamp}`)).toBeVisible();

    // Task from the Lodge
    await page.getByRole("button", { name: "Add" }).click();
    const task = page.getByRole("dialog");
    await task.locator("input[name=title]").fill(`E2E task ${stamp}`);
    await task.getByRole("button", { name: "Save" }).click();
    await expect(task).toBeHidden();
    await expect(page.getByRole("link", { name: `E2E task ${stamp}` }).first()).toBeVisible();

    // Note
    await page.getByRole("link", { name: "Notes" }).click();
    await page.locator("textarea[name=body]").fill(`E2E note ${stamp}`);
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByText("Note added.")).toBeVisible();
    await expect(page.getByText(`E2E note ${stamp}`)).toBeVisible();
  });

  test("an Assistant can view but not edit a Lodge outside their allocation", async ({ page }) => {
    await signIn(page, "apgmen1");
    await page.goto(`/lodges/${lodgeId(9020)}`);
    await expect(page.getByText("View only: not allocated to you")).toBeVisible();
    await expect(page.getByRole("button", { name: "Log contact" })).toHaveCount(0);
    await page.goto(`/lodges/${lodgeId(9020)}?tab=activity`);
    await expect(page.getByText("Activity is visible to the allocated Assistant and Provincial leadership")).toBeVisible();
  });

  test("filters, saved views and exports work for leadership", async ({ page }) => {
    await signIn(page, "pgm");
    await page.goto("/lodges?allocation=unallocated");
    await expect(page.getByText(/^\d+ Lodges?$/)).toBeVisible();
    const name = `E2E view ${Date.now()}`;
    await page.getByRole("button", { name: "Save this view" }).click();
    await page.getByRole("dialog").locator("input[name=name]").fill(name);
    await page.getByRole("dialog").getByRole("button", { name: "Save view" }).click();
    await expect(page.getByRole("link", { name })).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByText("Export").click();
    await page.getByRole("link", { name: "Excel" }).click();
    expect((await download).suggestedFilename()).toMatch(/Lodge directory .*\.xlsx$/);
  });

  test("Lodge pages are accessible and usable at phone width", async ({ page }) => {
    await signIn(page, "pgm");
    mkdirSync("test-results/mobile", { recursive: true });
    for (const [name, path] of [["lodges", "/lodges"], ["lodge", `/lodges/${lodgeId(9001)}`], ["lodge-activity", `/lodges/${lodgeId(9001)}?tab=activity`], ["lodge-members", `/lodges/${lodgeId(9001)}?tab=members`]] as const) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(path);
      const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`), `${name} axe`).toEqual([]);
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${name} horizontal overflow at 375px`).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `test-results/mobile/${name}.png`, fullPage: true });
    }
  });
});
