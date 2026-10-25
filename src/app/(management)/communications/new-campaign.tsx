"use client";

import { DialogForm } from "@/components/ui/dialog-form";
import { RadioGroup, TextField } from "@/components/ui/form";
import { createCampaign } from "./actions";

export function NewCampaign({ scopes }: { scopes: { value: string; label: string; hint?: string }[] }) {
  return (
    <DialogForm trigger="New campaign" triggerVariant="primary" title="New email campaign" action={createCampaign} submitLabel="Create draft">
      <TextField label="Title" name="title" required hint="For your reference. You will write the subject line next." />
      <RadioGroup legend="Who can it reach?" name="scope" options={scopes} defaultValue={scopes[scopes.length - 1]?.value} />
    </DialogForm>
  );
}
