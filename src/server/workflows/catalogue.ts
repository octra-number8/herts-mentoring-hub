/**
 * The controlled workflow catalogue (brief 22). Administrators combine these
 * triggers, conditions and actions; they cannot add executable code.
 * Shared by the server engine and the workflow builder UI.
 */
import { z } from "zod";

export type TriggerDef = { key: string; label: string; description: string; fields: { key: string; label: string; type: "text" | "uuid" | "date" | "number" | "boolean" }[] };

export const TRIGGERS: TriggerDef[] = [
  { key: "member.initiated", label: "New Initiate imported", description: "An approved import recorded a recent initiation.",
    fields: [{ key: "lodge_id", label: "Lodge", type: "uuid" }, { key: "initiated_on", label: "Initiation date", type: "date" }] },
  { key: "lodge.mentor_changed", label: "Lodge Mentor changes", description: "A new Lodge Mentor was recorded.",
    fields: [{ key: "lodge_id", label: "Lodge", type: "uuid" }] },
  { key: "lodge.reallocated", label: "Lodge reallocated", description: "A Lodge moved to a different Assistant.", fields: [{ key: "lodge_id", label: "Lodge", type: "uuid" }, { key: "kind", label: "Primary or cover", type: "text" }] },
  { key: "case.created", label: "Support request created", description: "An ordinary support request was raised. Confidential concerns never trigger workflows.",
    fields: [{ key: "lodge_id", label: "Lodge", type: "uuid" }, { key: "category", label: "Category", type: "text" }] },
  { key: "case.escalated", label: "Support request escalated", description: "A support request was escalated.", fields: [] },
  { key: "task.due", label: "Task due", description: "A task reaches its due date.", fields: [{ key: "priority", label: "Priority", type: "text" }] },
  { key: "course.completed", label: "Course completed", description: "A learner completed a course.", fields: [{ key: "course_id", label: "Course", type: "uuid" }] },
  { key: "course.enrolled", label: "Learner enrolled", description: "A learner enrolled on a course.", fields: [{ key: "course_id", label: "Course", type: "uuid" }] },
  { key: "event.registered", label: "Event booking", description: "Someone booked a place.", fields: [{ key: "event_id", label: "Event", type: "uuid" }, { key: "status", label: "Booking status", type: "text" }] },
  { key: "event.attended", label: "Attendance verified", description: "Attendance was recorded.", fields: [{ key: "event_id", label: "Event", type: "uuid" }] },
  { key: "document.review_due", label: "Document review due", description: "A document reached its review date.", fields: [] },
  { key: "approval.required", label: "Approval required", description: "Something is waiting for approval.", fields: [{ key: "kind", label: "Kind", type: "text" }] },
  { key: "webhook.received", label: "Approved webhook received", description: "An approved integration sent a notification.", fields: [{ key: "source", label: "Source", type: "text" }] },
];

export const CONDITION_OPS = ["eq", "neq", "in", "exists", "not_exists", "gt", "lt"] as const;
export const conditionSchema = z.object({ field: z.string().min(1), op: z.enum(CONDITION_OPS), value: z.unknown().optional() });

/** Owner placeholders resolved at run time. */
export const OWNER_TARGETS = ["allocated_apgmen", "prov_grand_mentor", "learning_lead", "event_person"] as const;

export type ActionDef = { type: string; label: string; description: string; params: z.ZodTypeAny; requires: string[] };

export const ACTIONS: ActionDef[] = [
  { type: "create_task", label: "Create task", description: "Create a task linked to the triggering record.", requires: ["tasks.use"],
    params: z.object({ title: z.string().min(3).max(200), due_in_days: z.number().int().min(0).max(365).default(14), owner: z.enum(OWNER_TARGETS).default("allocated_apgmen"), priority: z.enum(["low", "normal", "high"]).default("normal") }) },
  { type: "notify_allocated_apgmen", label: "Notify the allocated Assistant", description: "In-app notification to the Assistant for the Lodge.", requires: [],
    params: z.object({ title: z.string().min(3).max(120), body: z.string().max(300).optional() }) },
  { type: "notify_role", label: "Notify a role", description: "In-app notification to everyone holding a role.", requires: [],
    params: z.object({ role: z.enum(["prov_grand_mentor", "deputy_prov_grand_mentor", "apgmen", "learning_lead", "prov_team"]), title: z.string().min(3).max(120), body: z.string().max(300).optional() }) },
  { type: "notify_person", label: "Notify the person concerned", description: "In-app notification to the learner or member who triggered it (if they have an account).", requires: [],
    params: z.object({ title: z.string().min(3).max(120), body: z.string().max(300).optional() }) },
  { type: "send_template_email", label: "Send an authorised email", description: "Email the person concerned using an approved template. Respects their preferences.", requires: ["comms.templates"],
    params: z.object({ template: z.string().min(1), category: z.enum(["operational", "learning", "events"]).default("operational") }) },
  { type: "suggest_course", label: "Suggest learning", description: "Recommend a course to the person concerned (no automatic enrolment).", requires: ["academy.admin"],
    params: z.object({ course_id: z.string().uuid() }) },
  { type: "create_calendar_item", label: "Create calendar item", description: "Add an internal Provincial calendar entry.", requires: ["events.manage"],
    params: z.object({ title: z.string().min(3).max(200), in_days: z.number().int().min(0).max(365).default(7) }) },
  { type: "set_lodge_status", label: "Update Lodge mentoring status", description: "Set a permitted operational status on the Lodge.", requires: ["lodges.write.all"],
    params: z.object({ status_key: z.string().min(1) }) },
  { type: "generate_quarterly_draft", label: "Generate quarterly report draft", description: "Create or refresh the draft report for the current quarter.", requires: ["reports.quarterly"],
    params: z.object({}) },
];

export const actionSchema = z.object({ type: z.string(), params: z.record(z.string(), z.unknown()).default({}) });

export function validateWorkflowDefinition(def: { trigger_key: string; conditions: unknown; actions: unknown }): { ok: true } | { ok: false; error: string } {
  if (!TRIGGERS.some((t) => t.key === def.trigger_key)) return { ok: false, error: "Choose a trigger from the catalogue." };
  const conds = z.array(conditionSchema).safeParse(def.conditions);
  if (!conds.success) return { ok: false, error: "A condition is incomplete." };
  const acts = z.array(actionSchema).min(1, "Add at least one action").safeParse(def.actions);
  if (!acts.success) return { ok: false, error: acts.error.issues[0]?.message ?? "Check the actions." };
  for (const a of acts.data) {
    const d = ACTIONS.find((x) => x.type === a.type);
    if (!d) return { ok: false, error: `Unknown action "${a.type}".` };
    const p = d.params.safeParse(a.params);
    if (!p.success) return { ok: false, error: `${d.label}: ${p.error.issues[0]?.message}` };
  }
  return { ok: true };
}

export function matchesConditions(conditions: z.infer<typeof conditionSchema>[], payload: Record<string, unknown>): boolean {
  return conditions.every((c) => {
    const v = payload[c.field];
    switch (c.op) {
      case "eq": return String(v) === String(c.value);
      case "neq": return String(v) !== String(c.value);
      case "in": return Array.isArray(c.value) && c.value.map(String).includes(String(v));
      case "exists": return v !== undefined && v !== null && v !== "";
      case "not_exists": return v === undefined || v === null || v === "";
      case "gt": return Number(v) > Number(c.value);
      case "lt": return Number(v) < Number(c.value);
    }
  });
}
