"use server";

import { z } from "zod";
import { check, defineAction, UserError, zf } from "@/server/action";
import { kickJobs } from "@/server/jobs/kick";

const taskId = zf.uuid("Task");
const paths = (id: string) => [`/tasks/${id}`, "/tasks"];
const notChanged = "You can only change tasks you own, created or manage.";

export const quickAddTask = defineAction(
  z.object({
    title: zf.required("Task", 200),
    description: zf.optionalText(5000),
    owner_account_id: zf.optionalUuid(),
    due_on: zf.optionalDate(),
    priority: z.enum(["low", "normal", "high"]).default("normal"),
    lodge_id: zf.optionalUuid(),
  }),
  async (i, { db, session }) => {
    // The id is generated here: tasks' read policy cannot see a row inside its own INSERT ... RETURNING.
    const t = { id: crypto.randomUUID() };
    check(await db.from("tasks").insert({
      ...i, id: t.id, org_id: session.orgId, owner_account_id: i.owner_account_id ?? session.accountId, created_by: session.accountId,
      linked_type: i.lodge_id ? "lodge" : null, linked_id: i.lodge_id,
    }));
    kickJobs();
    return { message: "Task added.", data: { id: t.id }, revalidate: ["/tasks"] };
  },
  { permission: ["tasks.use"] },
);

export const updateTask = defineAction(
  z.object({
    task_id: taskId,
    title: zf.required("Task", 200),
    description: zf.optionalText(5000),
    due_on: zf.optionalDate(),
    priority: z.enum(["low", "normal", "high"]),
    status: z.enum(["open", "in_progress", "waiting", "done", "cancelled"]),
  }),
  async (i, { db }) => {
    const { task_id, ...rest } = i;
    const res = await db.from("tasks").update(rest).eq("id", task_id).select("id");
    if (!check(res).length) throw new UserError(notChanged);
    return { message: "Task saved.", revalidate: paths(task_id) };
  },
);

export const reassignTask = defineAction(
  z.object({ task_id: taskId, owner_account_id: zf.uuid("New owner"), note: zf.optionalText(1000) }),
  async (i, { db, session }) => {
    const res = await db.from("tasks").update({ owner_account_id: i.owner_account_id }).eq("id", i.task_id).select("id");
    if (!check(res).length) throw new UserError(notChanged);
    if (i.note) check(await db.from("task_comments").insert({ org_id: session.orgId, task_id: i.task_id, body: `Reassigned: ${i.note}`, created_by: session.accountId }));
    kickJobs();
    return { message: "Task reassigned. The new owner has been notified.", revalidate: paths(i.task_id) };
  },
);

export const setTaskStatus = defineAction(
  z.object({ task_id: taskId, status: z.enum(["open", "in_progress", "waiting", "done", "cancelled"]) }),
  async (i, { db }) => {
    const res = await db.from("tasks").update({ status: i.status }).eq("id", i.task_id).select("id");
    if (!check(res).length) throw new UserError(notChanged);
    return { message: i.status === "done" ? "Marked as done." : "Task updated.", revalidate: paths(i.task_id) };
  },
);

export const addTaskComment = defineAction(
  z.object({ task_id: taskId, body: zf.required("Comment", 3000) }),
  async (i, { db, session }) => {
    check(await db.from("task_comments").insert({ org_id: session.orgId, task_id: i.task_id, body: i.body, created_by: session.accountId }));
    return { message: "Comment added.", revalidate: [`/tasks/${i.task_id}`] };
  },
);
