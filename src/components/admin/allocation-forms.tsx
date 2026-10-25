"use client";

import { DialogForm } from "@/components/ui/dialog-form";
import { CheckboxField, SelectField, TextAreaField, TextField } from "@/components/ui/form";
import type { ActionState } from "@/lib/action-state";
import { isoInDays, todayIso } from "@/lib/utils";

type Action = (p: ActionState, f: FormData) => Promise<ActionState>;
type Option = { value: string; label: string };

export function AllocateForm({ action, lodgeId, lodgeName, assistants, mode }: { action: Action; lodgeId: string; lodgeName: string; assistants: Option[]; mode: "allocate" | "reallocate" }) {
  return (
    <DialogForm trigger={mode === "allocate" ? "Allocate" : "Reallocate"} triggerSize="sm" triggerVariant={mode === "allocate" ? "primary" : "subtle"}
      title={`${mode === "allocate" ? "Allocate" : "Reallocate"} ${lodgeName}`} action={action} submitLabel={mode === "allocate" ? "Allocate" : "Reallocate"}
      description={mode === "reallocate" ? "The current allocation ends the day before the new one starts. Historic activity stays attributed to the person who did it." : undefined}>
      <input type="hidden" name="lodge_id" value={lodgeId} />
      <input type="hidden" name="kind" value="primary" />
      <SelectField label="Assistant" name="person_id" options={assistants} placeholder="Choose an Assistant" required />
      <TextField label="From" name="starts_on" type="date" defaultValue={todayIso()} required />
      {mode === "reallocate" && <CheckboxField label="Transfer open work for this Lodge" name="transfer_open_work" defaultChecked hint="Open tasks and support requests for this Lodge owned by the current Assistant move to the new one." />}
      <TextAreaField label="Reason" name="reason" rows={2} hint="Optional. Kept with the allocation history." />
    </DialogForm>
  );
}

export function CoverForm({ action, lodgeId, lodgeName, assistants }: { action: Action; lodgeId: string; lodgeName: string; assistants: Option[] }) {
  return (
    <DialogForm trigger="Cover" triggerSize="sm" triggerVariant="subtle" title={`Temporary cover for ${lodgeName}`} action={action} submitLabel="Record cover"
      description="Cover runs alongside the primary allocation until the end date. The covering Assistant can work on the Lodge in that period.">
      <input type="hidden" name="lodge_id" value={lodgeId} />
      <input type="hidden" name="kind" value="cover" />
      <SelectField label="Covering Assistant" name="person_id" options={assistants} placeholder="Choose an Assistant" required />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="From" name="starts_on" type="date" defaultValue={todayIso()} required />
        <TextField label="Until" name="ends_on" type="date" defaultValue={isoInDays(28)} required />
      </div>
      <TextAreaField label="Reason" name="reason" rows={2} />
    </DialogForm>
  );
}

export function EndAllocationForm({ action, allocationId, lodgeId, label }: { action: Action; allocationId: string; lodgeId: string; label: string }) {
  return (
    <DialogForm trigger="End" triggerSize="sm" triggerVariant="subtle" title={`End ${label}`} action={action} submitLabel="End allocation" submitVariant="danger"
      description="The allocation stops applying from this date. The Lodge becomes unallocated unless someone else holds it.">
      <input type="hidden" name="allocation_id" value={allocationId} />
      <input type="hidden" name="lodge_id" value={lodgeId} />
      <TextField label="No longer applies from" name="effective" type="date" defaultValue={todayIso()} required />
    </DialogForm>
  );
}

export function EndAppointmentForm({ action, personId, name, lodges, openTasks, openCases }: { action: Action; personId: string; name: string; lodges: number; openTasks: number; openCases: number }) {
  return (
    <DialogForm trigger="End appointment" triggerSize="sm" triggerVariant="subtle" title={`End ${name}'s appointment`} action={action} submitLabel="End appointment" submitVariant="danger"
      description={`This ends their ${lodges} Lodge allocations and management roles together, so no access remains. They currently own ${openTasks} open tasks and ${openCases} open support requests, which you can transfer afterwards.`}>
      <input type="hidden" name="person_id" value={personId} />
      <TextField label="No longer applies from" name="effective" type="date" defaultValue={todayIso()} required />
      <TextAreaField label="Reason" name="reason" rows={2} required />
    </DialogForm>
  );
}

export function TransferWorkForm({ action, fromAccount, name, accounts, trigger = "Transfer open work" }: { action: Action; fromAccount: string; name: string; accounts: Option[]; trigger?: string }) {
  return (
    <DialogForm trigger={trigger} triggerSize="sm" triggerVariant="secondary" title={`Transfer ${name}'s open work`} action={action} submitLabel="Transfer"
      description="Open tasks and open support requests move to the person you choose. Completed work and history stay attributed to the original person.">
      <input type="hidden" name="from_account" value={fromAccount} />
      <SelectField label="Transfer to" name="to_account" required placeholder="Choose a person" options={accounts.filter((a) => a.value !== fromAccount)} />
      <TextAreaField label="Reason" name="reason" rows={2} required />
    </DialogForm>
  );
}
