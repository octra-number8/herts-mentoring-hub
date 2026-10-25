import { expect as baseExpect, test } from "@playwright/test";
import { lodgeId, secrets } from "./helpers";
import { svc, signInRetry } from "./imports-fixtures";

// The shared local stack is busy while several suites run; allow for slow responses.
const expect = baseExpect.configure({ timeout: 45_000 });
test.describe.configure({ timeout: 360_000 });

const iso = (d: Date) => d.toISOString().slice(0, 10);

test("Scenario 12: reallocate a Lodge with its open work, add and end temporary cover, and see history as at an earlier date", async ({ page }) => {
  const db = svc();
  const L10 = lodgeId(9010), L11 = lodgeId(9011);
  const today = iso(new Date());
  const yesterday = iso(new Date(Date.now() - 86400000));
  const run = Date.now().toString(36);
  const names = Object.fromEntries(await Promise.all(["apgmen2", "apgmen3", "apgmen4"].map(async (k) => {
    const { data } = await db.from("persons").select("display_name").eq("id", secrets.users[k].personId).single();
    return [k, data!.display_name as string];
  })));

  // Whoever holds 9010 now hands it to the other Assistant (keeps reruns working).
  const { data: cur } = await db.from("lodge_allocations").select("person_id").eq("lodge_id", L10).eq("kind", "primary").is("ends_on", null).single();
  const from = cur!.person_id === secrets.users.apgmen3.personId ? "apgmen3" : "apgmen2";
  const to = from === "apgmen2" ? "apgmen3" : "apgmen2";
  const { data: yesterdayHolder } = await db.from("lodge_allocations").select("persons(display_name)").eq("lodge_id", L10).eq("kind", "primary")
    .lte("starts_on", yesterday).or(`ends_on.is.null,ends_on.gte.${yesterday}`).limit(1).single();
  const { data: task } = await db.from("tasks").insert({ org_id: secrets.orgId, title: `Reallocation test task ${run}`, owner_account_id: secrets.users[from].accountId,
    lodge_id: L10, linked_type: "lodge", linked_id: L10, status: "open" }).select("id").single();
  // Clear any cover left on 9011 by an earlier interrupted run.
  const { data: leftover } = await db.from("lodge_allocations").select("id, starts_on").eq("lodge_id", L11).eq("kind", "cover").or(`ends_on.is.null,ends_on.gte.${today}`);
  for (const c of leftover ?? []) {
    const end = c.starts_on > yesterday ? iso(new Date(new Date(c.starts_on).getTime() - 86400000)) : yesterday;
    await db.from("lodge_allocations").update({ ends_on: end }).eq("id", c.id);
  }

  await signInRetry(page, "pgm");
  await page.goto("/allocations");
  await expect(page.getByRole("heading", { name: "Assistants and workloads" })).toBeVisible();

  // Reallocate with open-work transfer.
  const row10 = page.getByRole("row").filter({ hasText: "No. 9010" });
  await row10.getByRole("button", { name: "Reallocate" }).click();
  const dialog = page.getByRole("dialog", { name: /^Reallocate .* No\. 9010$/ });
  await dialog.getByRole("combobox", { name: /^Assistant/ }).selectOption(secrets.users[to].personId);
  await expect(dialog.getByRole("checkbox", { name: /Transfer open work/ })).toBeChecked();
  await dialog.getByLabel("Reason").fill(`Rebalancing workloads ${run}`);
  await dialog.getByRole("button", { name: "Reallocate" }).click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });
  await expect(page.getByRole("row").filter({ hasText: "No. 9010" })).toContainText(names[to]);
  expect((await db.from("tasks").select("owner_account_id").eq("id", task!.id).single()).data!.owner_account_id).toBe(secrets.users[to].accountId);

  // Temporary cover on another Lodge.
  const row11 = page.getByRole("row").filter({ hasText: "No. 9011" });
  await row11.getByRole("button", { name: "Cover" }).click();
  const cover = page.getByRole("dialog", { name: /^Temporary cover for .* No\. 9011$/ });
  await cover.getByRole("combobox", { name: /^Covering Assistant/ }).selectOption(secrets.users.apgmen4.personId);
  await cover.getByLabel("Reason").fill(`Holiday cover ${run}`);
  await cover.getByRole("button", { name: "Record cover" }).click();
  await expect(cover).toBeHidden({ timeout: 60_000 });
  await expect(page.getByRole("row").filter({ hasText: "No. 9011" })).toContainText(`${names.apgmen4} until`);

  // Historic view: who held 9010 yesterday.
  await page.goto(`/allocations?at=${yesterday}`);
  await expect(page.getByText(/^Historic view/)).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "No. 9010" })).toContainText((yesterdayHolder!.persons as unknown as { display_name: string }).display_name);
  await expect(page.getByRole("button", { name: "Reallocate" })).toHaveCount(0);

  // End the cover.
  await page.goto("/allocations");
  await page.getByRole("row").filter({ hasText: "No. 9011" }).getByRole("button", { name: "End", exact: true }).first().click();
  const end = page.getByRole("dialog", { name: "End this cover" });
  await end.getByRole("button", { name: "End allocation" }).click();
  await expect(end).toBeHidden({ timeout: 60_000 });
  await expect(page.getByRole("row").filter({ hasText: "No. 9011" })).not.toContainText(`${names.apgmen4} until`);
  const { data: covers } = await db.from("lodge_allocations").select("id").eq("lodge_id", L11).eq("kind", "cover").or(`ends_on.is.null,ends_on.gte.${today}`);
  expect(covers).toHaveLength(0);
});
