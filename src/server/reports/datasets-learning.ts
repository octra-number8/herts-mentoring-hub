import "server-only";
import type { Row } from "../export/format";
import type { DB } from "../supabase";
import { registerDataset } from "./datasets";

const STATUS: Record<string, string> = { enrolled: "Not started", in_progress: "In progress", completed: "Completed", withdrawn: "Withdrawn" };
const SOURCE: Record<string, string> = { self: "Self-enrolled", assigned: "Assigned", recommended: "Recommended", event: "Training event", import: "Imported" };
const ROLE: Record<string, string> = {
  prov_grand_mentor: "Provincial Grand Mentor", deputy_prov_grand_mentor: "Deputy Provincial Grand Mentor", apgmen: "Assistant Provincial Grand Mentor",
  prov_team: "Provincial team", learning_lead: "Learning and Development lead", ld_contributor: "L&D contributor", lodge_mentor: "Lodge Mentor",
  personal_mentor: "Personal Mentor", learner: "Learner", tech_admin: "Technical administrator",
};
const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
const date = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

/** Learning records (enrolments and completions) with Lodge, area and role, via a definer function gated on learning.records.read. */
export async function queryLearningRecords(db: DB, f: Record<string, string>) {
  const { data, error } = await db.rpc("academy_learning_records", {
    p_lodge: uuid(f.lodge), p_area: uuid(f.area), p_role: f.role || undefined, p_course: uuid(f.course),
    p_status: f.status && STATUS[f.status] ? f.status : undefined, p_from: date(f.from), p_to: date(f.to),
    p_q: f.q?.trim() ? f.q.trim().slice(0, 80) : undefined, p_person: uuid(f.learner),
  });
  if (error) throw error;
  return data ?? [];
}

registerDataset({
  key: "learning",
  label: "Learning records",
  description: "Academy enrolments and completions by course, Lodge, area, role and date.",
  permission: ["learning.records.read"],
  exportPermission: ["reports.export"],
  columns: [
    { key: "display_name", label: "Learner", width: 1.6 },
    { key: "course_title", label: "Course", width: 2 },
    { key: "version_no", label: "Version", type: "number", width: 0.5 },
    { key: "status_label", label: "Status", width: 0.9 },
    { key: "source_label", label: "Source", width: 0.9 },
    { key: "lessons_completed", label: "Lessons done", type: "number", width: 0.6 },
    { key: "lessons_required", label: "Lessons required", type: "number", width: 0.6 },
    { key: "enrolled_at", label: "Enrolled", type: "date", width: 0.9 },
    { key: "completed_at", label: "Completed", type: "date", width: 0.9 },
    { key: "lodge", label: "Lodge", width: 1.6 },
    { key: "area_name", label: "Area", width: 1 },
    { key: "role_labels", label: "Roles", width: 1.6 },
  ],
  filters: [
    { key: "q", label: "Learner name", type: "text" },
    { key: "status", label: "Status", type: "select", options: Object.entries(STATUS).map(([value, label]) => ({ value, label })) },
    { key: "from", label: "Enrolled or completed from", type: "date" },
    { key: "to", label: "Enrolled or completed to", type: "date" },
  ],
  query: async (db, f) => {
    const rows = await queryLearningRecords(db, f);
    return rows.map((r) => ({
      ...r,
      status_label: STATUS[r.status] ?? r.status,
      source_label: SOURCE[r.source] ?? r.source,
      lodge: r.lodge_name ? `${r.lodge_name} No. ${r.lodge_number}` : "",
      role_labels: (r.roles ?? []).map((k) => ROLE[k] ?? k).join(", "),
    })) as Row[];
  },
});

export const LEARNING_STATUS = STATUS;
export const ROLE_LABELS = ROLE;
