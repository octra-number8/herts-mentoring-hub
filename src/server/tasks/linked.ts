import "server-only";
import type { DB } from "../supabase";
import { linkedHref } from "./query";

/**
 * Label and link for a task's linked record, read as the user. If RLS hides the
 * record, the label says so rather than revealing anything about it.
 */
export async function linkedRecord(db: DB, type: string | null, id: string | null, lodgeId: string | null): Promise<{ label: string; href: string | null } | null> {
  if (!type || !id) return null;
  const hidden = { label: "A record you cannot open", href: null };
  switch (type) {
    case "lodge": {
      const { data } = await db.from("lodges").select("name, number").eq("id", id).maybeSingle();
      return data ? { label: `${data.name} No. ${data.number}`, href: linkedHref(type, id) } : hidden;
    }
    case "person": {
      const { data } = await db.from("persons").select("display_name").eq("id", id).maybeSingle();
      return data ? { label: data.display_name ?? "Member", href: linkedHref(type, id) } : hidden;
    }
    case "case": {
      const { data } = await db.from("cases").select("reference, title, kind").eq("id", id).maybeSingle();
      if (!data) return hidden;
      return { label: data.kind === "confidential" ? `${data.reference} (confidential)` : `${data.reference} ${data.title}`, href: linkedHref(type, id) };
    }
    case "meeting": {
      const { data } = await db.from("meetings").select("title, starts_at").eq("id", id).maybeSingle();
      return data ? { label: data.title, href: linkedHref(type, id) } : hidden;
    }
    case "event": {
      const { data } = await db.from("events").select("title").eq("id", id).maybeSingle();
      return data ? { label: data.title, href: linkedHref(type, id) } : hidden;
    }
    case "visit": {
      const { data } = await db.from("visits").select("purpose, lodge_id").eq("id", id).maybeSingle();
      return data ? { label: `Visit: ${data.purpose}`, href: `/lodges/${data.lodge_id}?tab=activity` } : hidden;
    }
    default:
      return { label: "Related record", href: lodgeId ? `/lodges/${lodgeId}` : null };
  }
}
