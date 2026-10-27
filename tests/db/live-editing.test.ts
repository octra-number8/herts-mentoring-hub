import { afterAll, describe, expect, it } from "vitest";
import { as, secrets, service } from "../helpers";

async function setLive(on: boolean) {
  const db = service();
  const { data: org } = await db.from("organisations").select("settings").eq("id", secrets.orgId).single();
  const s = (org!.settings ?? {}) as Record<string, Record<string, unknown>>;
  await db.from("organisations").update({ settings: { ...s, academy: { ...(s.academy ?? {}), live_editing: on } } }).eq("id", secrets.orgId);
}

describe("Academy live editing", () => {
  const db = service();
  afterAll(() => setLive(false));

  it("lets authors edit a published version in place only while live editing is on", async () => {
    const { data: v } = await db.from("course_versions").select("id, title, course_id").eq("org_id", secrets.orgId).eq("status", "published").limit(1).single();
    const { data: lesson } = await db.from("lessons").select("id, title, course_modules!inner(version_id)").eq("course_modules.version_id", v!.id).limit(1).single();
    const author = await as("author");

    await setLive(false);
    const { data: off } = await author.from("lessons").update({ title: "Edited while off" }).eq("id", lesson!.id).select("id");
    expect(off).toEqual([]);

    await setLive(true);
    const { data: on, error } = await author.from("lessons").update({ title: `${lesson!.title} (live)` }).eq("id", lesson!.id).select("id");
    expect(error).toBeNull();
    expect(on).toHaveLength(1);

    // A live title change shows in the catalogue.
    const { error: e2 } = await author.from("course_versions").update({ title: `${v!.title} (live)` }).eq("id", v!.id);
    expect(e2).toBeNull();
    expect((await db.from("courses").select("title").eq("id", v!.course_id).single()).data!.title).toBe(`${v!.title} (live)`);

    // Restore.
    await db.from("lessons").update({ title: lesson!.title }).eq("id", lesson!.id);
    await db.from("course_versions").update({ title: v!.title }).eq("id", v!.id);
  });

  it("never lets a direct update change a version's status", async () => {
    await setLive(true);
    const { data: course } = await db.from("courses").select("id").eq("org_id", secrets.orgId).limit(1).single();
    const { data: draft } = await db.from("course_versions").insert({ org_id: secrets.orgId, course_id: course!.id, version_no: 900 + Math.floor(Math.random() * 99),
      title: "Status guard test", status: "draft" }).select("id").single();
    const author = await as("author");
    const { error } = await author.from("course_versions").update({ status: "published" }).eq("id", draft!.id);
    expect(error).not.toBeNull();
    expect((await db.from("course_versions").select("status").eq("id", draft!.id).single()).data!.status).toBe("draft");
    await db.from("course_versions").delete().eq("id", draft!.id);
  });
});
