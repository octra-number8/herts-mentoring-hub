"use client";

import { ActionButton, DialogForm } from "@/components/ui/dialog-form";
import { CheckboxField, SelectField, TextField } from "@/components/ui/form";
import { deleteSavedReport, saveReport, updateSavedReport } from "../actions";

const SCHEDULES = [
  { value: "none", label: "Not scheduled" },
  { value: "weekly", label: "Weekly (Monday morning)" },
  { value: "monthly", label: "Monthly (first of the month)" },
  { value: "quarterly", label: "Quarterly (first day of the quarter)" },
];

export function SaveReportForm({ config, canSchedule }: { config: string; canSchedule: boolean }) {
  return (
    <DialogForm trigger="Save report" title="Save this report" description="Saved reports appear on the Reports page. Shared reports are visible to colleagues with report access, and always show them only what their own role allows." action={saveReport} submitLabel="Save report">
      <input type="hidden" name="config" value={config} />
      <TextField label="Name" name="name" required placeholder="e.g. Contacts by area this year" />
      <CheckboxField label="Share with colleagues who have report access" name="shared" />
      {canSchedule && <SelectField label="Email it to me" name="schedule" defaultValue="none" options={SCHEDULES} hint="Sent as an Excel attachment, run with your own access at the time it is sent." />}
    </DialogForm>
  );
}

export function EditSavedReport({ id, name, shared, schedule, config, canSchedule }: { id: string; name: string; shared: boolean; schedule: string; config: string; canSchedule: boolean }) {
  return (
    <DialogForm trigger="Save changes" title="Update saved report" description="Saves the current columns, filters and grouping." action={updateSavedReport}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="config" value={config} />
      <TextField label="Name" name="name" required defaultValue={name} />
      <CheckboxField label="Share with colleagues who have report access" name="shared" defaultChecked={shared} />
      {canSchedule ? <SelectField label="Email it to me" name="schedule" defaultValue={schedule} options={SCHEDULES} hint="Sent as an Excel attachment." /> : <input type="hidden" name="schedule" value="none" />}
    </DialogForm>
  );
}

export function DeleteSavedReport({ id, name }: { id: string; name: string }) {
  return <ActionButton action={deleteSavedReport} fields={{ id }} variant="danger" size="md" confirm={`Delete the saved report "${name}"?`}>Delete</ActionButton>;
}
