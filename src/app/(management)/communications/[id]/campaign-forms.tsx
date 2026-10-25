"use client";

import { useState } from "react";
import { ActionButton, DialogForm } from "@/components/ui/dialog-form";
import { ActionForm, CheckboxField, FormActions, RadioGroup, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { PersonPicker } from "@/components/ui/pickers";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toLocalInput } from "@/components/events/datetime";
import {
  adjustAudiencePerson, applySegment, applyTemplate, cancelCampaign, decideCampaign, deleteSegment, duplicateCampaign, removeAttachment,
  saveAudience, saveMessage, saveSegment, sendTestEmail, submitCampaign, uploadAttachment,
} from "../actions";
import { CATEGORIES } from "../labels";

type Campaign = { id: string; title: string; subject: string; preheader: string | null; body_markdown: string; category: string; scope: string; scheduled_for: string | null };

export function MessageForm({ c, scopes, replyTo }: { c: Campaign; scopes: { value: string; label: string }[]; replyTo: string | null }) {
  return (
    <ActionForm action={saveMessage} className="space-y-5">
      <input type="hidden" name="campaign_id" value={c.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Title (for your reference)" name="title" defaultValue={c.title} required />
        <TextField label="Subject line" name="subject" defaultValue={c.subject} required />
      </div>
      <TextField label="Preview text" name="preheader" defaultValue={c.preheader ?? ""} hint="Shown after the subject in most inboxes. Optional." />
      <TextAreaField label="Message" name="body_markdown" rows={14} defaultValue={c.body_markdown} className="font-mono text-[14px]"
        hint={<>Markdown: **bold**, *italic*, [link text](https://…), ## heading, - list. Use {"{{first_name}}"} for each person&apos;s first name. Link to Solomon rather than copying its content.</>} />
      <RadioGroup legend="Type of message" name="category" defaultValue={c.category} options={CATEGORIES.map((x) => ({ value: x.value, label: x.label, hint: x.hint }))}
        hint="This decides whose email preferences apply." />
      {scopes.length > 1 ? (
        <RadioGroup legend="Who can it reach?" name="scope" defaultValue={c.scope} options={scopes} />
      ) : <input type="hidden" name="scope" value={c.scope} />}
      <TextField label="Send at (optional)" name="scheduled_for" type="datetime-local" defaultValue={toLocalInput(c.scheduled_for)}
        hint="Leave blank to send as soon as it is approved." />
      <p className="text-sm text-muted">Replies go to <strong className="text-ink">{replyTo ?? "the Provincial office inbox"}</strong>, not to you personally.</p>
      <FormActions><SubmitButton>Save draft</SubmitButton></FormActions>
    </ActionForm>
  );
}

export function TemplatePicker({ campaignId, templates }: { campaignId: string; templates: { id: string; name: string }[] }) {
  if (!templates.length) return null;
  return (
    <DialogForm trigger="Start from a template" triggerVariant="subtle" triggerSize="sm" title="Start from a template" action={applyTemplate} submitLabel="Apply"
      description="This replaces the current message text.">
      <input type="hidden" name="campaign_id" value={campaignId} />
      <SelectField label="Template" name="template_id" required placeholder="Choose…" options={templates.map((t) => ({ value: t.id, label: t.name }))} />
    </DialogForm>
  );
}

export function AttachmentForm({ campaignId }: { campaignId: string }) {
  return (
    <ActionForm action={uploadAttachment} resetOnSuccess className="space-y-3">
      <input type="hidden" name="campaign_id" value={campaignId} />
      <label className="block text-sm font-medium" htmlFor="attachment-file">Add an attachment</label>
      <input id="attachment-file" type="file" name="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.ics" required
        className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-white file:px-3 file:py-1.5 file:text-navy-800" />
      <p className="text-[13px] text-muted">PDF, Word, image or calendar file, up to 10 MB. Up to five files.</p>
      <FormActions><SubmitButton size="sm" variant="secondary" pendingText="Uploading…">Upload</SubmitButton></FormActions>
    </ActionForm>
  );
}

export function RemoveAttachment({ campaignId, path }: { campaignId: string; path: string }) {
  return <ActionButton action={removeAttachment} fields={{ campaign_id: campaignId, path }} variant="subtle">Remove</ActionButton>;
}

type Opt = { value: string; label: string };
type Filters = Record<string, string | string[] | undefined>;

function CheckList({ legend, name, options, selected, hint }: { legend: string; name: string; options: Opt[]; selected?: string[]; hint?: string }) {
  const [open, setOpen] = useState((selected?.length ?? 0) > 0);
  if (!options.length) return null;
  return (
    <fieldset className="rounded-md border border-line">
      <legend className="sr-only">{legend}</legend>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium">
        <span>{legend}{selected?.length ? <span className="ml-2 rounded bg-navy-50 px-1.5 text-[12px] text-navy-800">{selected.length} chosen</span> : null}</span>
        <span aria-hidden className="text-muted">{open ? "Hide" : "Choose"}</span>
      </button>
      <div className={cn("max-h-56 space-y-1 overflow-y-auto border-t border-line px-3 py-2", !open && "hidden")}>
        {hint && <p className="mb-1 text-[13px] text-muted">{hint}</p>}
        {options.map((o) => (
          <label key={o.value} className="flex items-start gap-2 text-sm">
            <input type="checkbox" name={`${name}[]`} value={o.value} defaultChecked={selected?.includes(o.value)} className="mt-1 h-4 w-4 accent-navy-800" />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function AudienceForm({ campaignId, filters, lodges, areas, offices, roles, stages, courses, events }: {
  campaignId: string; filters: Filters; lodges: Opt[]; areas: Opt[]; offices: Opt[]; roles: Opt[]; stages: Opt[]; courses: Opt[]; events: Opt[];
}) {
  const f = (k: string) => filters[k] as string[] | undefined;
  const s = (k: string) => (filters[k] as string | undefined) ?? "";
  return (
    <ActionForm action={saveAudience} className="space-y-3">
      <input type="hidden" name="campaign_id" value={campaignId} />
      <p className="text-sm text-muted">Every filter you choose narrows the audience. Leave everything empty to reach the whole scope.</p>
      <CheckList legend="Lodges" name="lodge_ids" options={lodges} selected={f("lodge_ids")} />
      <CheckList legend="Areas" name="area_ids" options={areas} selected={f("area_ids")} />
      <CheckList legend="Lodge offices" name="offices" options={offices} selected={f("offices")} hint="People currently holding any of these offices in the chosen Lodges." />
      <CheckList legend="Hub roles" name="roles" options={roles} selected={f("roles")} />
      <CheckList legend="Masonic stage" name="stages" options={stages} selected={f("stages")} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Initiated from" name="initiated_from" type="date" defaultValue={s("initiated_from") === "1900-01-01" ? "" : s("initiated_from")} />
        <TextField label="Initiated to" name="initiated_to" type="date" defaultValue={s("initiated_to")} />
      </div>
      {courses.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <SelectField label="Enrolled on course" name="enrolled_course_id" defaultValue={s("enrolled_course_id")} placeholder="Any" options={courses} />
          <SelectField label="Completed course" name="completed_course_id" defaultValue={s("completed_course_id")} placeholder="Any" options={courses} />
          <SelectField label="Not yet completed" name="not_completed_course_id" defaultValue={s("not_completed_course_id")} placeholder="Any" options={courses} />
        </div>
      )}
      {events.length > 0 && (
        <div className="space-y-2">
          <SelectField label="Event" name="event_id" defaultValue={s("event_id")} placeholder="Any" options={events} />
          <CheckList legend="Booking status for that event" name="event_statuses" selected={f("event_statuses")}
            hint="If none are chosen, people confirmed or who attended are included."
            options={[{ value: "confirmed", label: "Confirmed" }, { value: "attended", label: "Attended" }, { value: "waitlisted", label: "Waiting list" }, { value: "no_show", label: "Did not attend" }, { value: "cancelled", label: "Cancelled" }]} />
        </div>
      )}
      <FormActions><SubmitButton>Update audience</SubmitButton></FormActions>
    </ActionForm>
  );
}

export function SegmentControls({ campaignId, segments, canSave, editable }: { campaignId: string; segments: { id: string; name: string; mine: boolean }[]; canSave: boolean; editable: boolean }) {
  return (
    <div className="space-y-3">
      {segments.length ? (
        <ul className="space-y-1.5 text-sm">
          {segments.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>{s.name}</span>
              <span className="flex gap-1">
                {editable && <ActionButton action={applySegment} fields={{ campaign_id: campaignId, segment_id: s.id }} variant="subtle">Use</ActionButton>}
                {s.mine && <ActionButton action={deleteSegment} fields={{ campaign_id: campaignId, segment_id: s.id }} variant="subtle" confirm={`Delete the segment "${s.name}"?`}>Delete</ActionButton>}
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted">No saved segments yet.</p>}
      {canSave && (
        <DialogForm trigger="Save these filters as a segment" triggerVariant="subtle" triggerSize="sm" title="Save segment" action={saveSegment} submitLabel="Save">
          <input type="hidden" name="campaign_id" value={campaignId} />
          <TextField label="Name" name="name" required placeholder="e.g. Lodge Mentors, North area" />
          <CheckboxField label="Share with colleagues who send communications" name="shared" />
        </DialogForm>
      )}
    </div>
  );
}

export function IncludePerson({ campaignId }: { campaignId: string }) {
  return (
    <DialogForm trigger="Add a person" triggerVariant="subtle" triggerSize="sm" title="Add someone to the audience" action={adjustAudiencePerson} submitLabel="Add"
      description="Allocated-scope campaigns can only reach members of your allocated Lodges, whoever you add.">
      <input type="hidden" name="campaign_id" value={campaignId} />
      <input type="hidden" name="list" value="include" />
      <PersonPicker name="person_id" label="Person" required />
    </DialogForm>
  );
}

export function PersonToggle({ campaignId, personId, list, children }: { campaignId: string; personId: string; list: "exclude" | "reset" | "include"; children: React.ReactNode }) {
  return <ActionButton action={adjustAudiencePerson} fields={{ campaign_id: campaignId, person_id: personId, list }} variant="subtle">{children}</ActionButton>;
}

export function TestEmailButton({ campaignId }: { campaignId: string }) {
  return <ActionButton action={sendTestEmail} fields={{ campaign_id: campaignId }} size="md">Send me a test email</ActionButton>;
}

export function SubmitCampaignButton({ campaignId, needsApproval, eligible }: { campaignId: string; needsApproval: boolean; eligible: number }) {
  return (
    <ActionButton action={submitCampaign} fields={{ campaign_id: campaignId }} variant="primary" size="md"
      confirm={needsApproval ? `Submit for approval? It will go to ${eligible} recipients once approved.` : `Send to ${eligible} recipients? This cannot be undone once sending starts.`}>
      {needsApproval ? "Submit for approval" : "Send"}
    </ActionButton>
  );
}

export function DecisionForm({ campaignId }: { campaignId: string }) {
  return (
    <ActionForm action={decideCampaign} className="space-y-3">
      <input type="hidden" name="campaign_id" value={campaignId} />
      <TextAreaField label="Note" name="note" rows={2} hint="Required when returning it for changes. The sender sees it." />
      <FormActions>
        <SubmitButton name="decision" value="approve" variant="teal">Approve and send</SubmitButton>
        <SubmitButton name="decision" value="return" variant="secondary">Return for changes</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

export function CancelCampaignButton({ campaignId }: { campaignId: string }) {
  return <ActionButton action={cancelCampaign} fields={{ campaign_id: campaignId }} variant="danger" size="md" confirm="Cancel this campaign? Nothing further will be sent.">Cancel campaign</ActionButton>;
}

export function DuplicateButton({ campaignId }: { campaignId: string }) {
  return <ActionButton action={duplicateCampaign} fields={{ campaign_id: campaignId }} size="md">Duplicate</ActionButton>;
}

/** Branded email preview at phone or desktop width. The HTML is our own rendered layout, shown in a sandboxed frame. */
export function EmailPreview({ html, text }: { html: string; text: string }) {
  const [mode, setMode] = useState<"desktop" | "mobile" | "text">("desktop");
  return (
    <div className="space-y-3">
      <div role="group" aria-label="Preview size" className="flex flex-wrap gap-2">
        {(["desktop", "mobile", "text"] as const).map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
            className={buttonClass(mode === m ? "primary" : "secondary", "sm")}>
            {{ desktop: "Desktop", mobile: "Mobile", text: "Plain text" }[m]}
          </button>
        ))}
      </div>
      {mode === "text" ? (
        <pre className="max-h-[720px] overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-white p-4 text-sm">{text}</pre>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-canvas p-3">
          <iframe title="Email preview" sandbox="" srcDoc={html}
            className={cn("mx-auto block h-[720px] rounded border border-line bg-white", mode === "mobile" ? "w-[375px]" : "w-full min-w-[640px]")} />
        </div>
      )}
    </div>
  );
}
