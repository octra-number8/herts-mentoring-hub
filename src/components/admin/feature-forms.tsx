"use client";

import { useState } from "react";
import { DialogForm } from "@/components/ui/dialog-form";
import { ActionForm, CheckboxField, FormActions, RadioGroup, SelectField, SubmitButton, TextAreaField } from "@/components/ui/form";
import type { ActionState } from "@/lib/action-state";

type Action = (p: ActionState, f: FormData) => Promise<ActionState>;
type Option = { value: string; label: string };

const ACTION_LABELS: Record<string, string> = { read: "View", create: "Create", update: "Update", approve: "Approve", export: "Export" };

export function FeatureSettingForm({ action, featureKey, enabled, actions, locked }: { action: Action; featureKey: string; enabled: boolean; actions: Record<string, boolean>; locked?: boolean }) {
  return (
    <ActionForm action={action} className="space-y-3">
      <input type="hidden" name="feature_key" value={featureKey} />
      <CheckboxField name="enabled" label="Enabled" defaultChecked={enabled} hint={locked ? "Administration always stays on." : undefined} />
      <fieldset>
        <legend className="mb-1 text-[13px] font-medium text-muted">Actions allowed</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {Object.keys(ACTION_LABELS).map((a) => <CheckboxField key={a} name="actions[]" value={a} label={ACTION_LABELS[a]} defaultChecked={actions[a] ?? false} />)}
        </div>
      </fieldset>
      <FormActions><SubmitButton size="sm" variant="secondary">Save</SubmitButton></FormActions>
    </ActionForm>
  );
}

export function ActivatePortalForm({ action, mentors, lodges, roles }: { action: Action; mentors: Option[]; lodges: Option[]; roles: Option[] }) {
  const [scope, setScope] = useState("account");
  return (
    <DialogForm trigger="Activate the portal" triggerVariant="primary" title="Activate the Lodge Mentor portal" action={action} submitLabel="Activate" wide
      description="This gives Lodge Mentors management access to their own Lodge. Only activate it where leadership has agreed. Access also needs a current Lodge Mentor appointment.">
      <div onChange={(e) => { const t = e.target as HTMLInputElement; if (t.name === "scope") setScope(t.value); }}>
        <RadioGroup legend="Activate for" name="scope" defaultValue="account" options={[
          { value: "account", label: "One Lodge Mentor" }, { value: "lodge", label: "A Lodge" }, { value: "role", label: "Everyone with a role" }]} />
      </div>
      {scope === "account" && <SelectField label="Lodge Mentor" name="account_id" required placeholder={mentors.length ? "Choose" : "No Lodge Mentor accounts"} options={mentors} />}
      {scope === "lodge" && <SelectField label="Lodge" name="lodge_id" required placeholder="Choose a Lodge" options={lodges} hint="Its current Lodge Mentor and Assistant Lodge Mentor gain access." />}
      {scope === "role" && <SelectField label="Role" name="role_id" required placeholder="Choose a role" options={roles} />}
      <fieldset>
        <legend className="mb-1 text-sm font-medium">What they can do</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <CheckboxField name="actions[]" value="read" label="View their Lodge" defaultChecked hint="Required" />
          <CheckboxField name="actions[]" value="create" label="Submit support requests" defaultChecked />
          <CheckboxField name="actions[]" value="update" label="Propose Lodge changes and maintain arrangements" />
          <CheckboxField name="actions[]" value="export" label="Lodge-level report and export" />
        </div>
      </fieldset>
      <TextAreaField label="Reason" name="reason" rows={2} required hint="Recorded in the audit log, e.g. the meeting where this was agreed." />
    </DialogForm>
  );
}

export function DeactivatePortalForm({ action, scope, target, label }: { action: Action; scope: string; target: string; label: string }) {
  return (
    <DialogForm trigger="Deactivate" triggerSize="sm" triggerVariant="subtle" title={`Remove portal access: ${label}`} action={action} submitLabel="Deactivate" submitVariant="danger"
      description="Access ends immediately. Their learning record and Academy access are not affected.">
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="target" value={target} />
      <TextAreaField label="Reason" name="reason" rows={2} required />
    </DialogForm>
  );
}
