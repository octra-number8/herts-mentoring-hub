"use client";

import { useState } from "react";
import { DialogForm } from "@/components/ui/dialog-form";
import { ActionForm, CheckboxField, FormActions, RadioGroup, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { AccountSelect, PersonPicker } from "@/components/ui/pickers";
import {
  addCaseAction, addCaseComment, addRestrictedNote, closeCase, createRequest, escalateCase, grantCaseAccess, reopenCase,
  submitConfidential, triageCase, updateCase,
} from "@/app/(management)/support/actions";

type Opt = { value: string; label: string };
type Picked = { id: string; label: string } | null;
const PRIORITIES: Opt[] = [{ value: "low", label: "Low" }, { value: "normal", label: "Normal" }, { value: "high", label: "High" }];

export function NewRequestForm({ categories, lodges, lodgeId, member }: { categories: Opt[]; lodges: Opt[]; lodgeId?: string; member: Picked }) {
  return (
    <ActionForm action={createRequest} className="max-w-2xl">
      <SelectField label="What kind of help?" name="category_key" options={categories} placeholder="Choose a category" required />
      <TextField label="Summary" name="title" required maxLength={200} placeholder="e.g. Help preparing a Personal Mentor evening" />
      <TextAreaField label="Details" name="description" rows={5} hint="Optional. Who asked, what would help, any dates." />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Lodge" name="lodge_id" options={lodges} placeholder="No particular Lodge" defaultValue={lodgeId ?? ""}
          hint="Requests for a Lodge go to its allocated Assistant automatically." />
        <SelectField label="Priority" name="priority" options={PRIORITIES} defaultValue="normal" />
      </div>
      <PersonPicker name="member_person_id" label="Brother concerned (optional)" defaultValue={member} lodgeId={undefined} />
      <PersonPicker name="requester_person_id" label="Requested by (if not you)" hint="For example the Lodge Secretary who telephoned." />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Received by" name="source" defaultValue="hub" options={[
          { value: "hub", label: "Recorded in the Hub" }, { value: "email", label: "Email" }, { value: "telephone", label: "Telephone" }, { value: "meeting", label: "At a meeting" }]} />
        <TextField label="Due" name="due_on" type="date" hint="Optional. Defaults from the category." />
      </div>
      <AccountSelect name="owner_account_id" label="Owner" hint="Leave unassigned to route to the Lodge's allocated Assistant." />
      <FormActions><SubmitButton>Create request</SubmitButton></FormActions>
    </ActionForm>
  );
}

export function ConfidentialForm({ lodges }: { lodges: Opt[] }) {
  return (
    <ActionForm action={submitConfidential} className="max-w-2xl">
      <TextField label="Summary" name="title" required maxLength={200} hint="A short description. Avoid names here if you can." />
      <TextAreaField label="Details" name="description" rows={7} required />
      <SelectField label="Lodge (optional)" name="lodge_id" options={lodges} placeholder="Not about a particular Lodge"
        hint="Recorded for leadership only. It never appears on the Lodge's pages." />
      <PersonPicker name="member_person_id" label="Brother concerned (optional)" />
      <CheckboxField name="acknowledge" label="I have read the guidance above"
        hint="Welfare, safeguarding and disciplinary matters are referred through the Province's existing procedures." />
      <FormActions><SubmitButton>Submit confidentially</SubmitButton></FormActions>
    </ActionForm>
  );
}

type CaseLite = { id: string; status: string; priority: string; due_on: string | null; owner_account_id: string | null; category_key: string; kind: string };

export function UpdateCaseForm({ c, categories }: { c: CaseLite; categories: Opt[] }) {
  const statusOptions = [{ value: "new", label: "New" }, { value: "assigned", label: "Assigned" }, { value: "in_progress", label: "In progress" }, { value: "awaiting_response", label: "Awaiting response" }];
  const current = statusOptions.some((s) => s.value === c.status) ? c.status : "in_progress";
  return (
    <DialogForm trigger="Update" triggerSize="sm" title="Update request" action={updateCase}>
      <input type="hidden" name="case_id" value={c.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Status" name="status" options={statusOptions} defaultValue={current} />
        <SelectField label="Priority" name="priority" options={PRIORITIES} defaultValue={c.priority} />
        <TextField label="Due" name="due_on" type="date" defaultValue={c.due_on ?? ""} />
        {c.kind === "request" && <SelectField label="Category" name="category_key" options={categories} defaultValue={c.category_key} />}
      </div>
      <AccountSelect name="owner_account_id" label="Owner" defaultValue={c.owner_account_id} hint="Reassigning notifies the new owner." />
      <PersonPicker name="member_person_id" label="Brother concerned" hint="Leave blank to keep the current record." />
    </DialogForm>
  );
}

export function CommentForm({ caseId, canShare }: { caseId: string; canShare: boolean }) {
  return (
    <ActionForm action={addCaseComment} resetOnSuccess>
      <input type="hidden" name="case_id" value={caseId} />
      <TextAreaField label="Add an update" name="body" rows={3} required />
      {canShare && <CheckboxField name="visible_to_requester" label="Visible to the person who raised this" />}
      <FormActions><SubmitButton>Add update</SubmitButton></FormActions>
    </ActionForm>
  );
}

export function ActionTaskForm({ caseId }: { caseId: string }) {
  return (
    <DialogForm trigger="Add action" triggerSize="sm" triggerVariant="subtle" title="Add an action" description="Actions appear in the task list, linked to this request." action={addCaseAction}>
      <input type="hidden" name="case_id" value={caseId} />
      <TextField label="Action" name="title" required />
      <AccountSelect name="owner_account_id" label="Owner" hint="Leave unassigned to take it yourself." />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Due" name="due_on" type="date" />
        <SelectField label="Priority" name="priority" options={PRIORITIES} defaultValue="normal" />
      </div>
    </DialogForm>
  );
}

export function EscalateForm({ caseId, confidential }: { caseId: string; confidential: boolean }) {
  return (
    <DialogForm trigger="Escalate" triggerSize="sm" title="Escalate" action={escalateCase} submitLabel="Escalate"
      description={confidential ? "Confidential concerns can only be escalated to designated Provincial leadership." : "The person you choose is notified and can see this request."}>
      <input type="hidden" name="case_id" value={caseId} />
      <AccountSelect name="to_account_id" label="Escalate to" required allowNone />
      <TextAreaField label="Reason" name="note" rows={3} required />
    </DialogForm>
  );
}

export function CloseForm({ caseId }: { caseId: string }) {
  return (
    <DialogForm trigger="Record outcome" triggerSize="sm" triggerVariant="teal" title="Outcome and closure" action={closeCase} submitLabel="Save outcome">
      <input type="hidden" name="case_id" value={caseId} />
      <RadioGroup legend="Close as" name="status" defaultValue="resolved" options={[
        { value: "resolved", label: "Resolved", hint: "The help asked for was given." }, { value: "closed", label: "Closed", hint: "No further action." }]} />
      <TextAreaField label="Outcome" name="outcome" rows={4} required />
      <CheckboxField name="visible_to_requester" label="Share the outcome with the person who raised this" defaultChecked />
    </DialogForm>
  );
}

export function ReopenForm({ caseId }: { caseId: string }) {
  return (
    <DialogForm trigger="Reopen" triggerSize="sm" title="Reopen request" action={reopenCase} submitLabel="Reopen">
      <input type="hidden" name="case_id" value={caseId} />
      <TextAreaField label="Why is it being reopened?" name="reason" rows={3} required />
    </DialogForm>
  );
}

export function TriageForm({ caseId }: { caseId: string }) {
  const [action, setAction] = useState("assign");
  return (
    <ActionForm action={triageCase}>
      <input type="hidden" name="case_id" value={caseId} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Decision</legend>
        {[
          { value: "assign", label: "Assign to a Provincial team member", hint: "They are given recorded access to this concern only." },
          { value: "refer", label: "Refer through an existing procedure", hint: "For example welfare, safeguarding or disciplinary routes. Record where." },
          { value: "close", label: "Close with no further action" },
        ].map((o) => (
          <label key={o.value} className="flex items-start gap-2 text-sm">
            <input type="radio" name="action" value={o.value} checked={action === o.value} onChange={() => setAction(o.value)} className="mt-1 accent-navy-800" />
            <span>{o.label}{o.hint && <span className="block text-[13px] text-muted">{o.hint}</span>}</span>
          </label>
        ))}
      </fieldset>
      {action === "assign" && <AccountSelect name="owner_account_id" label="Assign to" required />}
      {action === "refer" && <TextField label="Referred to" name="referred_to" required placeholder="e.g. Provincial Grand Almoner (welfare procedure)" />}
      <TextAreaField label={action === "close" ? "Reason" : "Note (optional)"} name="note" rows={3} required={action === "close"} />
      <FormActions><SubmitButton>Record decision</SubmitButton></FormActions>
    </ActionForm>
  );
}

export function GrantAccessForm({ caseId }: { caseId: string }) {
  return (
    <DialogForm trigger="Grant access" triggerSize="sm" triggerVariant="subtle" title="Grant access to this record"
      description="Access is to this record only, and is recorded with your reason." action={grantCaseAccess}>
      <input type="hidden" name="case_id" value={caseId} />
      <AccountSelect name="account_id" label="Person" required />
      <TextAreaField label="Reason" name="reason" rows={2} required />
    </DialogForm>
  );
}

export function RestrictedNoteForm({ caseId }: { caseId: string }) {
  return (
    <ActionForm action={addRestrictedNote} resetOnSuccess>
      <input type="hidden" name="case_id" value={caseId} />
      <TextAreaField label="Restricted note" name="body" rows={3} required hint="Seen only by those with restricted-note permission who can access this record. Never shown elsewhere." />
      <FormActions><SubmitButton variant="secondary">Add restricted note</SubmitButton></FormActions>
    </ActionForm>
  );
}

