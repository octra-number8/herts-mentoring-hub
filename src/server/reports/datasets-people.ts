import "server-only";
import { label } from "@/lib/utils";
import type { Row } from "../export/format";
import { progressionSettings, queryMembers } from "../members/directory";
import { querySupport } from "../support/query";
import { queryTasks } from "../tasks/query";
import { registerDataset } from "./datasets";

// Members, support requests and tasks. Every query runs as the signed-in user,
// so RLS limits rows. Confidential concerns are never included in the support dataset.

registerDataset({
  key: "members",
  label: "Member directory",
  description: "Current members with Lodge, degree dates and, where your role allows, mentoring journey details.",
  permission: ["members.read.basic"],
  exportPermission: ["members.export"],
  columns: [
    { key: "display_name", label: "Name", width: 2 },
    { key: "membership_number", label: "Membership no.", width: 1 },
    { key: "lodge", label: "Lodge", width: 2 },
    { key: "initiated_on", label: "Initiated", type: "date", width: 1 },
    { key: "passed_on", label: "Passed", type: "date", width: 1 },
    { key: "raised_on", label: "Raised", type: "date", width: 1 },
    { key: "stage", label: "Stage", width: 1.2 },
    { key: "personal_mentor", label: "Personal Mentor", width: 1 },
    { key: "royal_arch", label: "Royal Arch", width: 1.2 },
    { key: "next_review_on", label: "Next review", type: "date", width: 1 },
  ],
  filters: [
    { key: "q", label: "Name or membership number", type: "text" },
    { key: "from", label: "Initiated from", type: "date" },
    { key: "to", label: "Initiated to", type: "date" },
  ],
  query: async (db, f) => {
    const { data: org } = await db.from("organisations").select("settings").single();
    const { rows } = await queryMembers(db, f, { settings: progressionSettings(org?.settings as Record<string, unknown>) });
    return rows.map((m) => ({
      ...m,
      lodge: m.lodge_name ? `${m.lodge_name} No. ${m.lodge_number}` : "",
      stage: label(m.stage),
      personal_mentor: label(m.personal_mentor_allocated),
      royal_arch: label(m.royal_arch),
    })) as Row[];
  },
});

registerDataset({
  key: "support",
  label: "Support requests",
  description: "Ordinary support requests you can see. Confidential concerns are never included.",
  permission: ["cases.read.all", "cases.read.allocated"],
  exportPermission: ["reports.export"],
  columns: [
    { key: "reference", label: "Reference", width: 1 },
    { key: "title", label: "Request", width: 2.4 },
    { key: "category", label: "Category", width: 1.4 },
    { key: "lodge", label: "Lodge", width: 1.8 },
    { key: "owner", label: "Owner", width: 1.6 },
    { key: "status", label: "Status", width: 1 },
    { key: "priority", label: "Priority", width: 0.7 },
    { key: "due_on", label: "Due", type: "date", width: 1 },
    { key: "created_at", label: "Raised", type: "date", width: 1 },
    { key: "closed_at", label: "Closed", type: "date", width: 1 },
  ],
  query: async (db, f) => {
    const rows = await querySupport(db, { ...f, view: "all" }, { accountId: "" });
    return rows.filter((c) => c.kind === "request").map((c) => ({
      ...c,
      category: c.category_label,
      lodge: c.lodge_label,
      owner: c.owner_name,
      status: label(c.status),
      priority: label(c.priority),
    })) as Row[];
  },
});

registerDataset({
  key: "tasks",
  label: "Tasks",
  description: "Tasks you can see, with owner, due date and linked record.",
  permission: ["tasks.use"],
  exportPermission: ["reports.export"],
  columns: [
    { key: "title", label: "Task", width: 2.6 },
    { key: "owner", label: "Owner", width: 1.6 },
    { key: "lodge", label: "Lodge", width: 1.6 },
    { key: "linked", label: "Linked to", width: 1 },
    { key: "priority", label: "Priority", width: 0.7 },
    { key: "status", label: "Status", width: 0.9 },
    { key: "due_on", label: "Due", type: "date", width: 1 },
    { key: "completed_at", label: "Completed", type: "date", width: 1 },
  ],
  query: async (db, f) => {
    const { data: me } = await db.rpc("my_context");
    const accountId = (me as { account_id?: string } | null)?.account_id ?? "";
    const rows = await queryTasks(db, { ...f, view: f.view ?? "mine" }, { accountId });
    return rows.map((t) => ({ ...t, owner: t.owner_name, lodge: t.lodge_label, linked: label(t.linked_type), status: label(t.status), priority: label(t.priority) })) as Row[];
  },
});
