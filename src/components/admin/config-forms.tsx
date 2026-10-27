"use client";

import { DialogForm } from "@/components/ui/dialog-form";
import { ActionForm, CheckboxField, FormActions, SelectField, SubmitButton, TextField } from "@/components/ui/form";
import type { ActionState } from "@/lib/action-state";

type Action = (p: ActionState, f: FormData) => Promise<ActionState>;

export function StatusDialog({ action, status }: { action: Action; status?: { id: string; key: string; label: string; description: string; position: number; is_closed: boolean; active: boolean } }) {
  return (
    <DialogForm trigger={status ? "Edit" : "Add status"} triggerSize="sm" triggerVariant={status ? "subtle" : "secondary"} title={status ? `Edit ${status.label}` : "New mentoring status"} action={action}
      description="Statuses describe an operational position, never a judgement of the Lodge.">
      {status && <input type="hidden" name="id" value={status.id} />}
      {status ? <p className="text-sm text-muted">Key: {status.key}</p> : <TextField label="Key" name="key" required hint="Lower case with underscores, e.g. visit_planned. Cannot be changed later." />}
      <TextField label="Label" name="label" required defaultValue={status?.label} />
      <TextField label="Description" name="description" defaultValue={status?.description} />
      <TextField label="Order" name="position" type="number" required defaultValue={status?.position ?? 10} />
      <CheckboxField label="Means no current action (closed)" name="is_closed" defaultChecked={status?.is_closed} />
      <CheckboxField label="Available to choose" name="active" defaultChecked={status?.active ?? true} />
    </DialogForm>
  );
}

export function SupportCategoryDialog({ action, category }: { action: Action; category?: { id: string; key: string; label: string; description: string; default_due_days: number; position: number; active: boolean } }) {
  return (
    <DialogForm trigger={category ? "Edit" : "Add category"} triggerSize="sm" triggerVariant={category ? "subtle" : "secondary"} title={category ? `Edit ${category.label}` : "New support category"} action={action}>
      {category && <input type="hidden" name="id" value={category.id} />}
      {category ? <p className="text-sm text-muted">Key: {category.key}</p> : <TextField label="Key" name="key" required hint="Lower case with underscores. Cannot be changed later." />}
      <TextField label="Label" name="label" required defaultValue={category?.label} />
      <TextField label="Description" name="description" defaultValue={category?.description} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Days to respond" name="default_due_days" type="number" required defaultValue={category?.default_due_days ?? 14} />
        <TextField label="Order" name="position" type="number" required defaultValue={category?.position ?? 20} />
      </div>
      <CheckboxField label="Available to choose" name="active" defaultChecked={category?.active ?? true} />
    </DialogForm>
  );
}

const CLASSIFICATIONS = [
  { value: "learning", label: "Academy learners" }, { value: "mentors", label: "Mentors" },
  { value: "internal", label: "Provincial team" }, { value: "leadership", label: "Leadership only" },
];

export function DocumentCategoryDialog({ action, category }: { action: Action; category?: { id: string; key: string; name: string; default_classification: string; position: number } }) {
  return (
    <DialogForm trigger={category ? "Edit" : "Add category"} triggerSize="sm" triggerVariant={category ? "subtle" : "secondary"} title={category ? `Edit ${category.name}` : "New document category"} action={action}>
      {category && <input type="hidden" name="id" value={category.id} />}
      {category ? <p className="text-sm text-muted">Key: {category.key}</p> : <TextField label="Key" name="key" required hint="Lower case with underscores. Cannot be changed later." />}
      <TextField label="Name" name="name" required defaultValue={category?.name} />
      <SelectField label="Default audience" name="default_classification" options={CLASSIFICATIONS} defaultValue={category?.default_classification ?? "internal"} />
      <TextField label="Order" name="position" type="number" required defaultValue={category?.position ?? 20} />
    </DialogForm>
  );
}

type Settings = {
  progression?: { ea_to_fc_months?: number; fc_to_mm_months?: number; new_member_review_days?: number };
  comms?: { allow_self_approval?: boolean; allocated_requires_approval?: boolean; reply_to?: string };
  academy?: { allow_self_approval?: boolean; live_editing?: boolean };
  imports?: { authoritative_fields?: string[]; new_initiate_window_days?: number };
};
const AUTH_FIELDS = [
  { key: "title", label: "Title" }, { key: "first_name", label: "First name" }, { key: "last_name", label: "Last name" },
  { key: "email", label: "Email" }, { key: "phone", label: "Phone" }, { key: "status", label: "Membership status" },
];

export function SettingsForm({ action, settings }: { action: Action; settings: Settings }) {
  const auth = settings.imports?.authoritative_fields ?? AUTH_FIELDS.map((f) => f.key);
  return (
    <ActionForm action={action} className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="text-[15px] font-semibold text-navy-900">Progression prompts</legend>
        <p className="text-[13px] text-muted">When a conversation may be welcome. Prompts are suggestions, never judgements.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="Entered Apprentice to Fellow Craft (months)" name="ea_to_fc_months" type="number" required defaultValue={settings.progression?.ea_to_fc_months ?? 9} />
          <TextField label="Fellow Craft to Master Mason (months)" name="fc_to_mm_months" type="number" required defaultValue={settings.progression?.fc_to_mm_months ?? 9} />
          <TextField label="New member review after (days)" name="new_member_review_days" type="number" required defaultValue={settings.progression?.new_member_review_days ?? 90} />
        </div>
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="text-[15px] font-semibold text-navy-900">Communications</legend>
        <CheckboxField name="comms_allow_self_approval" label="Approvers may approve their own Province-wide communications" defaultChecked={settings.comms?.allow_self_approval ?? false} />
        <CheckboxField name="comms_allocated_requires_approval" label="Assistants' emails to their own Lodges need approval" defaultChecked={settings.comms?.allocated_requires_approval ?? false} />
        <TextField label="Reply-to address" name="reply_to" type="email" defaultValue={settings.comms?.reply_to ?? ""} />
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="text-[15px] font-semibold text-navy-900">Academy</legend>
        <CheckboxField name="academy_allow_self_approval" label="Reviewers may approve courses they wrote" defaultChecked={settings.academy?.allow_self_approval ?? false} />
        <CheckboxField name="academy_live_editing" label="Live editing: authors may edit published courses directly"
          hint="Changes show to learners straight away, without a new version or approval. Use it before members have access, and switch it off once they do." defaultChecked={settings.academy?.live_editing ?? false} />
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="text-[15px] font-semibold text-navy-900">Membership imports</legend>
        <p className="text-[13px] text-muted">Fields an approved import may update. Locally corrected values are always kept.</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {AUTH_FIELDS.map((f) => <CheckboxField key={f.key} name="authoritative_fields[]" value={f.key} label={f.label} defaultChecked={auth.includes(f.key)} />)}
        </div>
        <TextField label="Treat initiations within this many days as new Initiates" name="new_initiate_window_days" type="number" required defaultValue={settings.imports?.new_initiate_window_days ?? 540} fieldClassName="max-w-sm" />
      </fieldset>
      <FormActions><SubmitButton>Save settings</SubmitButton></FormActions>
    </ActionForm>
  );
}

export function CustomFieldForm({ action }: { action: Action }) {
  return (
    <DialogForm trigger="Add field" triggerSize="sm" triggerVariant="secondary" title="New Lodge field" action={action}
      description="Extra information recorded on each Lodge. Keep it light: only what mentoring needs.">
      <TextField label="Key" name="key" required hint="Lower case with underscores, e.g. festive_board_venue." />
      <TextField label="Label" name="label" required />
      <SelectField label="Type" name="type" defaultValue="text" options={[
        { value: "text", label: "Text" }, { value: "number", label: "Number" }, { value: "date", label: "Date" }, { value: "yes_no", label: "Yes or no" }, { value: "choice", label: "Choice from a list" }]} />
      <TextField label="Choices" name="options" hint="For a choice field: separate the options with commas." />
      <TextField label="Help text" name="help" />
    </DialogForm>
  );
}
