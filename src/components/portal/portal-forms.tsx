"use client";

import { DialogForm } from "@/components/ui/dialog-form";
import { RadioGroup, SelectField, TextAreaField, TextField } from "@/components/ui/form";
import type { ActionState } from "@/lib/action-state";

type Action = (p: ActionState, f: FormData) => Promise<ActionState>;

export function ProposeChangeForm({ action, lodge }: { action: Action; lodge: { id: string; meeting_pattern: string | null; website: string | null; email: string | null; installation_month: number | null } }) {
  return (
    <DialogForm trigger="Propose a change" triggerSize="sm" triggerVariant="secondary" title="Propose a change to Lodge information" action={action} submitLabel="Send proposal" wide
      description="Your Assistant Provincial Grand Mentor reviews proposals before anything changes.">
      <input type="hidden" name="lodge_id" value={lodge.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Meeting pattern" name="meeting_pattern" defaultValue={lodge.meeting_pattern ?? ""} placeholder="e.g. Third Tuesday, October to April" />
        <SelectField label="Installation month" name="installation_month" defaultValue={lodge.installation_month?.toString() ?? ""} placeholder="Not set"
          options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: new Date(2000, i).toLocaleString("en-GB", { month: "long" }) }))} />
        <TextField label="Website" name="website" defaultValue={lodge.website ?? ""} />
        <TextField label="Lodge email" name="email" type="email" defaultValue={lodge.email ?? ""} />
      </div>
      <TextAreaField label="Note for your Assistant" name="note" rows={2} />
    </DialogForm>
  );
}

type Profile = { personal_mentors_for_new_members: string; arrangements: string | null; guidance_used: string | null; training_requirements: string | null } | null;

export function PortalArrangementsForm({ action, lodgeId, profile }: { action: Action; lodgeId: string; profile: Profile }) {
  return (
    <DialogForm trigger="Update" triggerSize="sm" triggerVariant="secondary" title="Mentoring arrangements" action={action} wide
      description="Keep it light: a few lines describing how new members are looked after.">
      <input type="hidden" name="lodge_id" value={lodgeId} />
      <RadioGroup legend="Do new members receive a Personal Mentor?" name="personal_mentors_for_new_members" defaultValue={profile?.personal_mentors_for_new_members ?? "unknown"}
        options={[{ value: "yes", label: "Yes" }, { value: "partly", label: "Partly" }, { value: "no", label: "No" }, { value: "unknown", label: "Not sure" }]} />
      <TextAreaField label="Arrangements" name="arrangements" rows={3} defaultValue={profile?.arrangements ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Guidance used" name="guidance_used" defaultValue={profile?.guidance_used ?? ""} />
        <TextField label="Training that would help" name="training_requirements" defaultValue={profile?.training_requirements ?? ""} />
      </div>
    </DialogForm>
  );
}

export function RequestForm({ action, lodgeId, categories }: { action: Action; lodgeId: string; categories: { value: string; label: string }[] }) {
  return (
    <DialogForm trigger="Ask for support" triggerVariant="primary" title="How can we help?" action={action} submitLabel="Send request" wide
      description="Your request goes to the Provincial team for your Lodge. For a confidential concern, please speak to your Assistant Provincial Grand Mentor directly.">
      <input type="hidden" name="lodge_id" value={lodgeId} />
      <SelectField label="What is it about?" name="category_key" options={categories} placeholder="Choose" required />
      <TextField label="Summary" name="title" required />
      <TextAreaField label="Details" name="description" rows={4} required />
    </DialogForm>
  );
}
