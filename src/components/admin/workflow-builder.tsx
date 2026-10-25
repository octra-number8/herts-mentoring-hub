"use client";

import { useActionState, useState } from "react";
import { ActionForm, CheckboxField, FormActions, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { ACTIONS, CONDITION_OPS, TRIGGERS } from "@/server/workflows/catalogue";

type Action = (p: ActionState, f: FormData) => Promise<ActionState>;
type Option = { value: string; label: string };
type Condition = { field: string; op: (typeof CONDITION_OPS)[number]; value?: unknown };
type WfAction = { type: string; params: Record<string, unknown> };

const OP_LABELS: Record<string, string> = { eq: "is", neq: "is not", in: "is one of", exists: "is set", not_exists: "is not set", gt: "is more than", lt: "is less than" };
const OWNERS: Option[] = [
  { value: "allocated_apgmen", label: "The allocated Assistant" }, { value: "prov_grand_mentor", label: "The Provincial Grand Mentor" },
  { value: "learning_lead", label: "The Learning and Development lead" }, { value: "event_person", label: "The person concerned" },
];
const ROLES: Option[] = [
  { value: "prov_grand_mentor", label: "Provincial Grand Mentor" }, { value: "deputy_prov_grand_mentor", label: "Deputy Provincial Grand Mentor" },
  { value: "apgmen", label: "Assistant Provincial Grand Mentors" }, { value: "learning_lead", label: "Learning and Development lead" }, { value: "prov_team", label: "Provincial team" },
];
const PRIORITIES: Option[] = [{ value: "low", label: "Low" }, { value: "normal", label: "Normal" }, { value: "high", label: "High" }];

type ParamSpec = { key: string; label: string; kind: "text" | "number" | "select"; options?: Option[] | "templates" | "courses" | "statuses"; default?: string | number; required?: boolean };
const PARAMS: Record<string, ParamSpec[]> = {
  create_task: [{ key: "title", label: "Task title", kind: "text", required: true }, { key: "due_in_days", label: "Due in (days)", kind: "number", default: 14 },
    { key: "owner", label: "Owner", kind: "select", options: OWNERS, default: "allocated_apgmen" }, { key: "priority", label: "Priority", kind: "select", options: PRIORITIES, default: "normal" }],
  notify_allocated_apgmen: [{ key: "title", label: "Notification title", kind: "text", required: true }, { key: "body", label: "Message (optional)", kind: "text" }],
  notify_role: [{ key: "role", label: "Role", kind: "select", options: ROLES, default: "prov_grand_mentor" }, { key: "title", label: "Notification title", kind: "text", required: true }, { key: "body", label: "Message (optional)", kind: "text" }],
  notify_person: [{ key: "title", label: "Notification title", kind: "text", required: true }, { key: "body", label: "Message (optional)", kind: "text" }],
  send_template_email: [{ key: "template", label: "Email template", kind: "select", options: "templates", required: true },
    { key: "category", label: "Category", kind: "select", options: [{ value: "operational", label: "Operational" }, { value: "learning", label: "Learning" }, { value: "events", label: "Events" }], default: "operational" }],
  suggest_course: [{ key: "course_id", label: "Course", kind: "select", options: "courses", required: true }],
  create_calendar_item: [{ key: "title", label: "Calendar item title", kind: "text", required: true }, { key: "in_days", label: "In (days)", kind: "number", default: 7 }],
  set_lodge_status: [{ key: "status_key", label: "Mentoring status", kind: "select", options: "statuses", required: true }],
  generate_quarterly_draft: [],
};

const control = "block w-full rounded-md border border-line bg-white px-3 py-2 text-[15px] focus:border-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-100";

function defaults(type: string): Record<string, unknown> {
  return Object.fromEntries((PARAMS[type] ?? []).filter((p) => p.default !== undefined).map((p) => [p.key, p.default]));
}

export function WorkflowBuilder({ action, initial, lists }: {
  action: Action;
  initial?: { id: string; name: string; description: string; trigger_key: string; conditions: Condition[]; actions: WfAction[]; requires_approval: boolean };
  lists: { templates: Option[]; courses: Option[]; statuses: Option[]; lodges: Option[]; areas: Option[] };
}) {
  const [trigger, setTrigger] = useState(initial?.trigger_key ?? TRIGGERS[0].key);
  const [conditions, setConditions] = useState<Condition[]>(initial?.conditions ?? []);
  const [actions, setActions] = useState<WfAction[]>(initial?.actions ?? [{ type: "notify_allocated_apgmen", params: {} }]);
  const def = TRIGGERS.find((t) => t.key === trigger)!;
  const fields: Option[] = [...def.fields.map((f) => ({ value: f.key, label: f.label })), ...(def.fields.some((f) => f.key === "lodge_id") ? [{ value: "area_id", label: "Area" }] : [])];
  const resolve = (o: ParamSpec["options"]): Option[] => (o === "templates" ? lists.templates : o === "courses" ? lists.courses : o === "statuses" ? lists.statuses : o ?? []);
  const setCond = (i: number, patch: Partial<Condition>) => setConditions((c) => c.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setAct = (i: number, patch: Partial<WfAction>) => setActions((a) => a.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <ActionForm action={action} className="space-y-6">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="conditions" value={JSON.stringify(conditions)} />
      <input type="hidden" name="actions" value={JSON.stringify(actions)} />
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Name" name="name" required defaultValue={initial?.name} />
        <div className="space-y-1.5">
          <label htmlFor="wf-trigger" className="block text-sm font-medium">When this happens <span className="text-danger-700" aria-hidden>*</span></label>
          <select id="wf-trigger" name="trigger_key" className={control} value={trigger} onChange={(e) => { setTrigger(e.target.value); setConditions([]); }}>
            {TRIGGERS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <p className="text-[13px] text-muted">{def.description}</p>
        </div>
      </div>
      <TextAreaField label="Description" name="description" rows={2} defaultValue={initial?.description} />

      <fieldset className="space-y-3">
        <legend className="text-[15px] font-semibold text-navy-900">Only if (optional)</legend>
        {conditions.length === 0 && <p className="text-sm text-muted">No conditions: it runs every time.</p>}
        {conditions.map((c, i) => (
          <div key={i} className="grid items-end gap-2 rounded-md bg-canvas p-3 sm:grid-cols-[1fr_1fr_1.4fr_auto]">
            <label className="text-sm font-medium">Field
              <select className={control} value={c.field} onChange={(e) => setCond(i, { field: e.target.value, value: undefined })}>
                {fields.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">Test
              <select className={control} value={c.op} onChange={(e) => setCond(i, { op: e.target.value as Condition["op"] })}>
                {CONDITION_OPS.map((o) => <option key={o} value={o}>{OP_LABELS[o]}</option>)}
              </select>
            </label>
            {["exists", "not_exists"].includes(c.op) ? <span /> : (
              <label className="text-sm font-medium">Value
                {c.field === "lodge_id" || c.field === "area_id" ? (
                  <select className={control} value={String(c.value ?? "")} onChange={(e) => setCond(i, { value: e.target.value })}>
                    <option value="">Choose</option>
                    {(c.field === "lodge_id" ? lists.lodges : lists.areas).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input className={control} value={Array.isArray(c.value) ? c.value.join(", ") : String(c.value ?? "")} placeholder={c.op === "in" ? "Separate values with commas" : ""}
                    onChange={(e) => setCond(i, { value: c.op === "in" ? e.target.value.split(",").map((s) => s.trim()).filter(Boolean) : e.target.value })} />
                )}
              </label>
            )}
            <button type="button" className={buttonClass("subtle", "sm")} onClick={() => setConditions((x) => x.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
        {fields.length > 0 && <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setConditions((c) => [...c, { field: fields[0].value, op: "eq", value: "" }])}>Add condition</button>}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-[15px] font-semibold text-navy-900">Do this</legend>
        {actions.map((a, i) => {
          const spec = ACTIONS.find((x) => x.type === a.type);
          return (
            <div key={i} className="space-y-3 rounded-md bg-canvas p-3">
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-64 flex-1 text-sm font-medium">Action {i + 1}
                  <select className={control} value={a.type} onChange={(e) => setAct(i, { type: e.target.value, params: defaults(e.target.value) })}>
                    {ACTIONS.map((x) => <option key={x.type} value={x.type}>{x.label}</option>)}
                  </select>
                </label>
                {actions.length > 1 && <button type="button" className={buttonClass("subtle", "sm")} onClick={() => setActions((x) => x.filter((_, j) => j !== i))}>Remove</button>}
              </div>
              {spec && <p className="text-[13px] text-muted">{spec.description}{spec.requires.length ? " Runs only while the workflow's author holds the permission it needs." : ""}</p>}
              <div className="grid gap-3 sm:grid-cols-2">
                {(PARAMS[a.type] ?? []).map((p) => {
                  const v = a.params[p.key] ?? p.default ?? "";
                  const set = (val: unknown) => setAct(i, { params: { ...a.params, [p.key]: val } });
                  return (
                    <label key={p.key} className="text-sm font-medium">{p.label}{p.required && <span className="text-danger-700" aria-hidden> *</span>}
                      {p.kind === "select" ? (
                        <select className={control} value={String(v)} onChange={(e) => set(e.target.value)}>
                          {p.required && !v && <option value="">Choose</option>}
                          {resolve(p.options).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      ) : (
                        <input className={control} type={p.kind === "number" ? "number" : "text"} value={String(v)}
                          onChange={(e) => set(p.kind === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)} />
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
        <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setActions((x) => [...x, { type: "create_task", params: defaults("create_task") }])}>Add action</button>
      </fieldset>

      <CheckboxField name="requires_approval" label="Each run waits for approval" hint="Someone who manages workflows approves or cancels each run before anything happens." defaultChecked={initial?.requires_approval} />
      <FormActions><SubmitButton>{initial ? "Save workflow" : "Create workflow"}</SubmitButton></FormActions>
    </ActionForm>
  );
}

type Step = { action: string; ok: boolean; detail: string };

export function DryRunPanel({ action, workflowId }: { action: Action; workflowId: string }) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  const data = state.data as { steps: Step[]; matched: boolean; event: { type: string; occurred_at: string } | null } | undefined;
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={workflowId} />
      <p className="text-sm text-muted">Preview what would happen for the most recent matching event. Nothing is created, sent or changed.</p>
      <button type="submit" disabled={pending} className={buttonClass("secondary", "sm")}>{pending ? "Running…" : "Dry run"}</button>
      {state.error && <p role="alert" className="text-sm text-danger-700">{state.error}</p>}
      {state.ok && (
        <div role="status" className="space-y-2 text-sm">
          <p className="font-medium">{state.message}</p>
          {data?.event && <p className="text-[13px] text-muted">Event: {data.event.type} at {new Date(data.event.occurred_at).toLocaleString("en-GB")}</p>}
          {data?.steps.length ? (
            <ol className="list-decimal space-y-1 pl-5">
              {data.steps.map((s, i) => <li key={i} className={s.ok ? "" : "text-warning-800"}>{ACTIONS.find((a) => a.type === s.action)?.label ?? s.action}: {s.detail}</li>)}
            </ol>
          ) : null}
        </div>
      )}
    </form>
  );
}
