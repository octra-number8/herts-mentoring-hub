"use client";

import { ActionButton, DialogForm } from "@/components/ui/dialog-form";
import { CheckboxField, TextAreaField, TextField } from "@/components/ui/form";
import type { ActionState } from "@/lib/action-state";

type Action = (p: ActionState, f: FormData) => Promise<ActionState>;

export function PolicyForm({ action, policy, title }: { action: Action; policy: { id: string; retain_months: number; enabled: boolean; basis: string }; title: string }) {
  return (
    <DialogForm trigger="Edit" triggerSize="sm" triggerVariant="subtle" title={`Edit: ${title}`} action={action}>
      <input type="hidden" name="id" value={policy.id} />
      <TextField label="Keep for (months)" name="retain_months" type="number" required defaultValue={policy.retain_months} />
      <TextAreaField label="Basis" name="basis" rows={2} required defaultValue={policy.basis} hint="Why this period: for example the data protection decision it follows." />
      <CheckboxField label="Enabled" name="enabled" defaultChecked={policy.enabled} hint="An enabled policy can be run for real. Nothing runs automatically." />
    </DialogForm>
  );
}

export function RunPolicy({ action, id, title, enabled }: { action: Action; id: string; title: string; enabled: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <ActionButton action={action} fields={{ id, dry_run: "true" }}>Dry run</ActionButton>
      {enabled && (
        <DialogForm trigger="Run" triggerSize="sm" triggerVariant="danger" title={`Run: ${title}`} action={action} submitLabel="Run now" submitVariant="danger"
          description="This permanently anonymises or deletes the records the policy covers. Try a dry run first to see how many.">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="dry_run" value="false" />
          <CheckboxField name="confirm" label="I understand this cannot be undone" />
        </DialogForm>
      )}
    </div>
  );
}
