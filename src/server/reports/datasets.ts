import "server-only";
import type { Permission } from "@/lib/permissions";
import type { Column, Row } from "../export/format";
import type { DB } from "../supabase";

/**
 * Report and export datasets. Every query runs as the signed-in user, so RLS
 * limits rows; `permission` additionally gates export. Filters arrive from the
 * URL and are validated per dataset.
 */
export type Dataset = {
  key: string;
  label: string;
  description: string;
  permission: Permission[];
  exportPermission: Permission[];
  columns: Column[];
  filters?: { key: string; label: string; type: "text" | "select" | "date"; options?: { value: string; label: string }[] }[];
  query: (db: DB, filters: Record<string, string>) => Promise<Row[]>;
};

const registry = new Map<string, Dataset>();
export const registerDataset = (d: Dataset) => registry.set(d.key, d);
export const getDataset = (key: string) => registry.get(key);
export const allDatasets = () => [...registry.values()];

registerDataset({
  key: "lodges",
  label: "Lodge directory",
  description: "Lodges with mentoring status, appointments and allocation.",
  permission: ["lodges.read"],
  exportPermission: ["lodges.export"],
  columns: [
    { key: "number", label: "No.", type: "number", width: 0.5 },
    { key: "name", label: "Lodge", width: 2 },
    { key: "meeting_centre", label: "Meeting centre", width: 1.6 },
    { key: "area", label: "Area", width: 1 },
    { key: "apgmen", label: "Assistant PGMen", width: 1.6 },
    { key: "lodge_mentor", label: "Lodge Mentor", width: 1.6 },
    { key: "secretary", label: "Secretary", width: 1.6 },
    { key: "mentoring_status", label: "Mentoring status", width: 1.3 },
    { key: "last_contact_on", label: "Last contact", type: "date", width: 1 },
    { key: "next_review_on", label: "Next review", type: "date", width: 1 },
    { key: "open_requests", label: "Open requests", type: "number", width: 0.7 },
  ],
  query: async (db, f) => {
    let q = db.from("v_lodge_overview").select("*").order("number");
    if (f.q) q = /^\d+$/.test(f.q) ? q.eq("number", Number(f.q)) : q.ilike("name", `%${f.q}%`);
    if (f.area) q = q.eq("area_id", f.area);
    if (f.status) q = q.eq("mentoring_status_key", f.status);
    if (f.lm === "vacant") q = q.is("lodge_mentor", null);
    if (f.lm === "unconfirmed") q = q.eq("lodge_mentor_confirmed", false);
    if (f.allocation === "unallocated") q = q.is("apgmen", null);
    if (f.mine === "1" && f.person) q = q.eq("apgmen_person_id", f.person);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as Row[];
  },
});
