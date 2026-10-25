"use client";

import { ActionButton, DialogForm } from "@/components/ui/dialog-form";
import { ActionForm, FormActions, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { AssigneeSelect } from "@/components/members/assignee-select";
import { addTaskComment, quickAddTask, reassignTask, setTaskStatus, updateTask } from "@/app/(management)/tasks/actions";

const PRIORITIES = [{ value: "low", label: "Low" }, { value: "normal", label: "Normal" }, { value: "high", label: "High" }];
const STATUSES = [{ value: "open", label: "Open" }, { value: "in_progress", label: "In progress" }, { value: "waiting", label: "Waiting" }, { value: "done", label: "Done" }, { value: "cancelled", label: "Cancelled" }];

export function QuickAddTask({ lodges }: { lodges: { value: string; label: string }[] }) {
  return (
    <ActionForm action={quickAddTask} resetOnSuccess className="rounded-lg border border-line bg-surface p-4">
      <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end">
        <TextField label="Quick add" name="title" required placeholder="What needs doing?" />
        <TextField label="Due" name="due_on" type="date" />
        <SelectField label="Priority" name="priority" options={PRIORITIES} defaultValue="normal" />
        <SubmitButton>Add task</SubmitButton>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-navy-800">More options</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <AssigneeSelect name="owner_account_id" label="Owner" hint="Leave unassigned to take it yourself." />
          <SelectField label="Lodge" name="lodge_id" options={lodges} placeholder="No Lodge" />
          <TextAreaField label="Description" name="description" rows={2} fieldClassName="md:col-span-2" />
        </div>
      </details>
    </ActionForm>
  );
}

export function MarkDoneButton({ taskId }: { taskId: string }) {
  return <ActionButton action={setTaskStatus} fields={{ task_id: taskId, status: "done" }} variant="secondary">Mark done</ActionButton>;
}

export function ReopenTaskButton({ taskId }: { taskId: string }) {
  return <ActionButton action={setTaskStatus} fields={{ task_id: taskId, status: "open" }} variant="subtle">Reopen</ActionButton>;
}

type Task = { id: string; title: string; description: string | null; due_on: string | null; priority: string; status: string; owner_account_id: string | null };

export function EditTaskForm({ task }: { task: Task }) {
  return (
    <DialogForm trigger="Edit" triggerSize="sm" triggerVariant="subtle" title="Edit task" action={updateTask}>
      <input type="hidden" name="task_id" value={task.id} />
      <TextField label="Task" name="title" defaultValue={task.title} required />
      <TextAreaField label="Description" name="description" rows={3} defaultValue={task.description ?? ""} />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="Due" name="due_on" type="date" defaultValue={task.due_on ?? ""} />
        <SelectField label="Priority" name="priority" options={PRIORITIES} defaultValue={task.priority} />
        <SelectField label="Status" name="status" options={STATUSES} defaultValue={task.status} />
      </div>
    </DialogForm>
  );
}

export function ReassignForm({ task }: { task: Task }) {
  return (
    <DialogForm trigger="Reassign" triggerSize="sm" title="Reassign task" description="The new owner is notified." action={reassignTask} submitLabel="Reassign">
      <input type="hidden" name="task_id" value={task.id} />
      <AssigneeSelect name="owner_account_id" label="New owner" defaultValue={task.owner_account_id} required />
      <TextField label="Note (optional)" name="note" />
    </DialogForm>
  );
}

export function TaskCommentForm({ taskId }: { taskId: string }) {
  return (
    <ActionForm action={addTaskComment} resetOnSuccess>
      <input type="hidden" name="task_id" value={taskId} />
      <TextAreaField label="Add a comment" name="body" rows={3} required />
      <FormActions><SubmitButton variant="secondary">Add comment</SubmitButton></FormActions>
    </ActionForm>
  );
}
