import "server-only";
import type { DB } from "../supabase";

/** Option lists the workflow builder needs, read as the signed-in user. */
export async function builderLists(db: DB) {
  const [{ data: templates }, { data: courses }, { data: statuses }, { data: lodges }, { data: areas }] = await Promise.all([
    db.from("email_templates").select("key, name").order("name"),
    db.from("courses").select("id, title, published_version_id").not("published_version_id", "is", null).order("title"),
    db.from("mentoring_statuses").select("key, label").eq("active", true).order("position"),
    db.from("lodges").select("id, name, number").order("number"),
    db.from("areas").select("id, name").order("code"),
  ]);
  return {
    templates: (templates ?? []).map((t) => ({ value: t.key, label: t.name })),
    courses: (courses ?? []).map((c) => ({ value: c.id, label: c.title })),
    statuses: (statuses ?? []).map((s) => ({ value: s.key, label: s.label })),
    lodges: (lodges ?? []).map((l) => ({ value: l.id, label: `${l.name} No. ${l.number}` })),
    areas: (areas ?? []).map((a) => ({ value: a.id, label: a.name })),
  };
}
