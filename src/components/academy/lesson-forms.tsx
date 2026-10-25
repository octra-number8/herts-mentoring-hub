"use client";

import { ActionForm, FormActions, SubmitButton, TextAreaField } from "@/components/ui/form";
import type { ActionState } from "@/lib/action-state";

type Action = (p: ActionState, f: FormData) => Promise<ActionState>;

function Hidden({ fields }: { fields: Record<string, string | undefined> }) {
  return <>{Object.entries(fields).map(([k, v]) => (v === undefined ? null : <input key={k} type="hidden" name={k} value={v} />))}</>;
}

/** "Mark complete and continue" for reading, video, scenario and resource lessons. */
export function CompleteLessonForm({ action, fields, hasNext }: { action: Action; fields: Record<string, string | undefined>; hasNext: boolean }) {
  return (
    <ActionForm action={action} className="inline-block space-y-2">
      <Hidden fields={fields} />
      <SubmitButton variant="teal" pendingText="Saving…">{hasNext ? "Mark complete and continue" : "Mark complete"}</SubmitButton>
    </ActionForm>
  );
}

/** Private reflection. Saved through the completion function; only the learner can read it. */
export function ReflectionForm({ action, fields, existing, prompt, hasNext }: {
  action: Action; fields: Record<string, string | undefined>; existing: string | null; prompt?: string; hasNext: boolean;
}) {
  return (
    <ActionForm action={action}>
      <Hidden fields={fields} />
      <TextAreaField label={prompt ?? "Your reflection"} name="reflection" rows={7} defaultValue={existing ?? ""} required
        hint="Private to you. Nobody else, including the Academy team, can read your reflections." />
      <FormActions>
        <SubmitButton variant="teal">{existing ? "Update reflection" : hasNext ? "Save and continue" : "Save reflection"}</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
