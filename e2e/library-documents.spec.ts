/**
 * Controlled documents through the real UI: create, upload, review, approve,
 * publish, reissue (supersede), acknowledge; what a learner can and cannot
 * reach; knowledge examples need anonymisation before publication.
 */
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { signIn } from "./helpers";

config({ path: ".env.local", quiet: true });

// Server actions on the shared dev server can be slow while other suites run.
const expect = baseExpect.configure({ timeout: 45_000 });
test.describe.configure({ timeout: 180_000 });
const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const stamp = Date.now().toString(36).toUpperCase();
const pdf = (name: string) => ({ name, mimeType: "application/pdf", buffer: Buffer.from(`%PDF-1.4\n% synthetic e2e file ${name} ${stamp}\n%%EOF\n`) });

const internal = { ref: `E2E-I-${stamp}`, title: `E2E internal guidance ${stamp}` };
const learning = { ref: `E2E-L-${stamp}`, title: `E2E learner guide ${stamp}` };
let internalId = "", learningId = "";

async function createDocument(page: Page, d: { ref: string; title: string }, category: string, access: RegExp, ack: boolean) {
  await page.goto("/library");
  await page.getByRole("button", { name: "New document" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Reference").fill(d.ref);
  await dlg.getByLabel("Title").fill(d.title);
  await dlg.getByLabel("Summary").fill("Synthetic document created by the browser tests.");
  await dlg.getByLabel("Category").selectOption({ label: category });
  await dlg.getByRole("radio", { name: access }).check();
  if (ack) await dlg.getByLabel("Readers must read and acknowledge it").check();
  await dlg.getByRole("button", { name: "Create document" }).click();
  await page.waitForURL(/\/library\/[0-9a-f-]{36}\?done=created/);
  await expect(page.getByText("Document created. Upload the first draft next.")).toBeVisible();
  return page.url().split("/library/")[1].split("?")[0];
}

async function uploadAndPublish(page: Page, label: string, file: string) {
  await page.getByRole("button", { name: "Upload new draft" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Version label").fill(label);
  await dlg.getByLabel("What has changed").fill(`Uploaded in the browser: ${label}`);
  await dlg.getByLabel("File").setInputFiles(pdf(file));
  await dlg.getByRole("button", { name: "Upload" }).click();
  const row = page.getByRole("row").filter({ hasText: label });
  await expect(row.getByText("Draft", { exact: true })).toBeVisible();
  await expect(row.getByRole("link", { name: file })).toBeVisible();

  await row.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText("Submitted for review. Approvers have been notified.")).toBeVisible();
  await page.getByRole("row").filter({ hasText: label }).getByRole("button", { name: "Approve" }).click();
  await page.getByRole("dialog").getByLabel("Approval note").fill("Approved in the browser test.");
  await page.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Version approved. It can now be published.")).toBeVisible();
  await page.getByRole("row").filter({ hasText: label }).getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Published. Any previous issue has been superseded.")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: label }).getByText("Published", { exact: true })).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("the Provincial Grand Mentor publishes and reissues a controlled document", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await signIn(page, "pgm");
  internalId = await createDocument(page, internal, "Policies", /^Provincial team/, true);
  await uploadAndPublish(page, "Issue 1", `issue-1-${stamp}.pdf`);
  await uploadAndPublish(page, "Issue 2", `issue-2-${stamp}.pdf`);

  const { data: versions } = await svc().from("document_versions").select("version_label, status").eq("document_id", internalId).order("version_no");
  expect(versions).toEqual([{ version_label: "Issue 1", status: "superseded" }, { version_label: "Issue 2", status: "published" }]);
  await expect(page.getByText("Current version").locator("..")).toContainText("Issue 2");

  // A learning document for the learner checks.
  learningId = await createDocument(page, learning, "Applicant guidance", /^Academy learners/, false);
  await uploadAndPublish(page, "Issue 1", `learner-${stamp}.pdf`);
});

test("an Assistant acknowledges the current issue", async ({ page }) => {
  await signIn(page, "apgmen1");
  await page.goto(`/library/${internalId}`);
  await expect(page.getByText("Please read and acknowledge Issue 2")).toBeVisible();
  await page.getByRole("button", { name: "I have read and understood this issue" }).click();
  await expect(page.getByText(/You acknowledged Issue 2 on/)).toBeVisible();

  const { data: v } = await svc().from("document_versions").select("id, version_label").eq("document_id", internalId);
  const { data: acks } = await svc().from("document_acknowledgements").select("document_version_id").in("document_version_id", v!.map((x) => x.id));
  expect(acks!.map((a) => v!.find((x) => x.id === a.document_version_id)!.version_label)).toEqual(["Issue 2"]);
  // Not a manager: no drafting or approval controls.
  await expect(page.getByRole("button", { name: "Upload new draft" })).toHaveCount(0);
});

test("the manager sees who has acknowledged", async ({ page }) => {
  await signIn(page, "pgm");
  await page.goto(`/library/${internalId}`);
  await expect(page.getByRole("heading", { name: "Acknowledged Issue 2" })).toBeVisible();
  await expect(page.getByText("1 person has acknowledged this issue.")).toBeVisible();
});

test("a learner sees learning documents only and cannot download others", async ({ page }) => {
  const { data: internalVersions } = await svc().from("document_versions").select("id").eq("document_id", internalId);
  const { data: learnDoc } = await svc().from("documents").select("current_version_id").eq("id", learningId).single();
  await signIn(page, "learner1");
  await page.goto("/academy/resources");
  await expect(page.getByRole("listitem").filter({ hasText: learning.title })).toBeVisible();
  await expect(page.getByText(internal.title)).toHaveCount(0);
  for (const v of internalVersions!) {
    const res = await page.request.get(`/api/documents/${v.id}`, { maxRedirects: 0 });
    expect(res.status()).toBe(404);
  }

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("listitem").filter({ hasText: learning.title }).getByRole("link", { name: /Download/ }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`learner-${stamp}.pdf`);
  const res = await page.request.get(`/api/documents/${learnDoc!.current_version_id}`);
  expect(res.status()).toBe(200);
  expect((await res.body()).toString()).toContain(`learner-${stamp}.pdf`);
  expect((await page.goto(`/library/${internalId}`))!.status()).toBe(404);
});

test("a knowledge example cannot be published until anonymisation is confirmed", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  const title = `E2E example ${stamp}`;
  await signIn(page, "pgm");
  await page.goto("/library/knowledge/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Type").selectOption({ label: "Practical example" });
  await page.getByLabel("Audience").selectOption({ label: "Mentors" });
  await page.getByLabel("Content").fill("A Lodge pairs each new member with a Brother for the Festive Board. (Synthetic.)");
  await expect(page.getByLabel("I confirm this example has been anonymised")).not.toBeChecked();
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForURL(/\/library\/knowledge\/e2e-example-.*\?done=saved/);
  await expect(page.getByText("Anonymisation not confirmed")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish" })).toHaveCount(0);

  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText("Submitted for review.")).toBeVisible();
  await page.goto("/library/approvals");
  const row = page.getByRole("row").filter({ hasText: title });
  await expect(row.getByText(/cannot be published/)).toBeVisible();
  await expect(row.getByRole("button", { name: "Publish" })).toHaveCount(0);
  const { data: a } = await svc().from("knowledge_articles").select("status").eq("title", title).single();
  expect(a!.status).toBe("review");

  await row.getByRole("link", { name: title }).click();
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("I confirm this example has been anonymised").check();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Article saved.")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Article published.")).toBeVisible();
  const { data: b } = await svc().from("knowledge_articles").select("status, anonymisation_confirmed").eq("title", title).single();
  expect(b).toEqual({ status: "published", anonymisation_confirmed: true });
});
