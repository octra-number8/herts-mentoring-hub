"use client";

import { useId } from "react";
import { DialogForm } from "@/components/ui/dialog-form";
import { ActionForm, CheckboxField, FormActions, SelectField, SubmitButton, TextAreaField, TextField, useFormState } from "@/components/ui/form";
import type { ActionState } from "@/lib/action-state";
import { todayIso } from "@/lib/utils";
import { AUDIENCES, PROVIDERS, STAGES } from "@/server/academy/content";

type Action = (p: ActionState, f: FormData) => Promise<ActionState>;


export function FileField({ label, name, hint, accept }: { label: string; name: string; hint?: string; accept?: string }) {
  const id = useId();
  const error = useFormState().fieldErrors?.[name];
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink">{label}</label>
      <input id={id} type="file" name={name} accept={accept} aria-describedby={hint ? `${id}-hint` : undefined}
        className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-white file:px-3 file:py-1.5 file:font-medium file:text-navy-800" />
      {hint && <p id={`${id}-hint`} className="text-[13px] text-muted">{hint}</p>}
      {error && <p className="text-[13px] font-medium text-danger-700">{error}</p>}
    </div>
  );
}

type External = { id: string; provider: string; title: string; url: string | null; completed_on: string; evidence_path: string | null };

export function ExternalLearningForm({ action, item }: { action: Action; item?: External }) {
  return (
    <DialogForm trigger={item ? "Edit" : "Add learning from elsewhere"} triggerVariant={item ? "subtle" : "secondary"} triggerSize={item ? "sm" : "md"}
      title={item ? "Edit learning record" : "Add learning from elsewhere"}
      description="Record a Solomon module or other mentoring learning you have completed. The Academy team may verify it."
      action={action} submitLabel="Save">
      {item && <input type="hidden" name="id" value={item.id} />}
      <SelectField label="Where" name="provider" options={PROVIDERS} defaultValue={item?.provider ?? "solomon"} required />
      <TextField label="Title" name="title" defaultValue={item?.title} required placeholder="e.g. the module or course name" />
      <TextField label="Link" name="url" type="url" defaultValue={item?.url ?? ""} hint="Optional. Must start with https://" />
      <TextField label="Completed on" name="completed_on" type="date" max={todayIso()} defaultValue={item?.completed_on ?? todayIso()} required />
      <FileField label={item?.evidence_path ? "Replace evidence" : "Evidence"} name="evidence" accept="application/pdf,image/png,image/jpeg,image/webp"
        hint="Optional. A PDF or image up to 10 MB, such as a completion screenshot." />
      {item?.evidence_path && <CheckboxField label="Remove the current evidence" name="remove_evidence" />}
    </DialogForm>
  );
}

export function ProfileForm({ action, profile }: { action: Action; profile: { audiences: string[]; masonic_stage: string | null; interests: string[] } | null }) {
  return (
    <ActionForm action={action}>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">I am interested in learning as</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {AUDIENCES.filter((a) => a.value !== "all").map((a) => (
            <CheckboxField key={a.value} label={a.label} name="audiences[]" value={a.value} defaultChecked={profile?.audiences.includes(a.value)} />
          ))}
        </div>
      </fieldset>
      <SelectField label="My stage" name="masonic_stage" options={STAGES} placeholder="Prefer not to say" defaultValue={profile?.masonic_stage ?? ""} />
      <TextField label="Topics I am interested in" name="interests" defaultValue={profile?.interests.join(", ") ?? ""} hint="Separate topics with commas, for example: listening, Lodge structure, ritual support." />
      <FormActions><SubmitButton>Save preferences</SubmitButton></FormActions>
    </ActionForm>
  );
}

const ITEM_KINDS = [
  { value: "course", label: "Academy course" }, { value: "event", label: "Training event" }, { value: "external", label: "Learning elsewhere" },
  { value: "reading", label: "Reading" }, { value: "other", label: "Other" },
];
const ITEM_STATUS = [{ value: "planned", label: "Planned" }, { value: "in_progress", label: "In progress" }, { value: "done", label: "Done" }, { value: "dropped", label: "No longer planned" }];

type PlanItem = { id: string; title: string; kind: string; course_id: string | null; target_on: string | null; status: string; notes: string | null };

export function PlanItemForm({ action, item, courses }: { action: Action; item?: PlanItem; courses: { id: string; title: string }[] }) {
  return (
    <DialogForm trigger={item ? "Edit" : "Add a step"} triggerVariant={item ? "subtle" : "primary"} triggerSize={item ? "sm" : "md"}
      title={item ? "Edit plan step" : "Add a step to your plan"} action={action} submitLabel="Save">
      {item && <input type="hidden" name="id" value={item.id} />}
      <TextField label="What" name="title" defaultValue={item?.title} required />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Type" name="kind" options={ITEM_KINDS} defaultValue={item?.kind ?? "course"} />
        <SelectField label="Status" name="status" options={ITEM_STATUS} defaultValue={item?.status ?? "planned"} />
      </div>
      <SelectField label="Academy course" name="course_id" options={courses.map((c) => ({ value: c.id, label: c.title }))} placeholder="Not a course" defaultValue={item?.course_id ?? ""} hint="Only used when the type is Academy course." />
      <TextField label="Target date" name="target_on" type="date" defaultValue={item?.target_on ?? ""} />
      <TextAreaField label="Notes" name="notes" rows={3} defaultValue={item?.notes ?? ""} />
    </DialogForm>
  );
}

export function AspirationsForm({ action, aspirations }: { action: Action; aspirations: string | null }) {
  return (
    <ActionForm action={action}>
      <TextAreaField label="What would you like to learn or become more confident in?" name="aspirations" rows={5} defaultValue={aspirations ?? ""}
        hint="A few lines is plenty. Your plan is yours: Academy administrators can read it to help, but only you can change it." />
      <FormActions><SubmitButton>Save</SubmitButton></FormActions>
    </ActionForm>
  );
}
