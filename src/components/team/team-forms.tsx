"use client";

import { ActionButton, DialogForm } from "@/components/ui/dialog-form";
import { ActionForm, CheckboxField, FormActions, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { PersonPicker } from "@/components/ui/pickers";
import { AssigneeSelect } from "@/components/members/assignee-select";
import { MEETING_KIND_LABELS } from "./kinds";
import {
  addAgendaItem, addAttendee, addDecision, addMeetingAction, addTeamNote, approveMinutes, archiveTeamNote, createMeeting, moveAgendaItem,
  postAnnouncement, removeAgendaItem, removeAttendee, saveMinutes, setAnnouncementPinned, setAttendance, updateAgendaItem, updateMeeting,
  withdrawAnnouncement,
} from "@/app/(management)/team/actions";

type Opt = { value: string; label: string };
const MEETING_KINDS: Opt[] = Object.entries(MEETING_KIND_LABELS).map(([value, label]) => ({ value, label }));
const PRIORITIES: Opt[] = [{ value: "low", label: "Low" }, { value: "normal", label: "Normal" }, { value: "high", label: "High" }];

/** datetime-local value in UK time for an ISO timestamp. */
function localInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function AnnouncementForm({ canLeadership }: { canLeadership: boolean }) {
  return (
    <DialogForm trigger="Post announcement" triggerVariant="primary" title="Post an announcement" action={postAnnouncement} submitLabel="Post">
      <TextField label="Title" name="title" required maxLength={200} />
      <TextAreaField label="Message" name="body" rows={5} required />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Audience" name="audience" defaultValue="team" options={[{ value: "team", label: "Provincial team" }, ...(canLeadership ? [{ value: "leadership", label: "Leadership only" }] : [])]} />
        <TextField label="Show until" name="expires_on" type="date" hint="Optional." />
      </div>
      <CheckboxField label="Pin to the top" name="pinned" />
    </DialogForm>
  );
}

export function AnnouncementControls({ id, pinned }: { id: string; pinned: boolean }) {
  return (
    <span className="flex flex-wrap gap-1">
      <ActionButton action={setAnnouncementPinned} fields={{ announcement_id: id, pinned: pinned ? "false" : "true" }} variant="subtle">{pinned ? "Unpin" : "Pin"}</ActionButton>
      <ActionButton action={withdrawAnnouncement} fields={{ announcement_id: id }} variant="subtle" confirm="Withdraw this announcement?">Withdraw</ActionButton>
    </span>
  );
}

type Meeting = { id: string; title: string; kind: string; starts_at: string; ends_at: string | null; location: string | null; online_url: string | null; status: string };

function MeetingFields({ m }: { m?: Meeting }) {
  return (
    <>
      <TextField label="Title" name="title" required defaultValue={m?.title} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Kind" name="kind" options={MEETING_KINDS} defaultValue={m?.kind ?? "team"} hint="Leadership meetings are visible only to leadership and those invited." />
        {m && <SelectField label="Status" name="status" defaultValue={m.status} options={[{ value: "scheduled", label: "Scheduled" }, { value: "held", label: "Held" }, { value: "cancelled", label: "Cancelled" }]} />}
        <TextField label="Starts" name="starts_at" type="datetime-local" required defaultValue={localInput(m?.starts_at)} />
        <TextField label="Ends" name="ends_at" type="datetime-local" defaultValue={localInput(m?.ends_at)} />
      </div>
      <TextField label="Location" name="location" defaultValue={m?.location ?? ""} placeholder="e.g. Provincial Office" />
      <TextField label="Online link" name="online_url" type="url" defaultValue={m?.online_url ?? ""} placeholder="https://" />
    </>
  );
}

export function NewMeetingForm() {
  return (
    <DialogForm trigger="New meeting" triggerVariant="primary" title="New meeting" action={createMeeting} submitLabel="Create meeting" wide>
      <MeetingFields />
      <CheckboxField label="Add me as an attendee" name="invite_me" defaultChecked />
    </DialogForm>
  );
}

export function EditMeetingForm({ m }: { m: Meeting }) {
  return (
    <DialogForm trigger="Edit" triggerSize="sm" title="Edit meeting" action={updateMeeting} wide>
      <input type="hidden" name="meeting_id" value={m.id} />
      <MeetingFields m={m} />
    </DialogForm>
  );
}

type Doc = Opt;

export function AgendaItemForm({ meetingId, docs }: { meetingId: string; docs: Doc[] }) {
  return (
    <DialogForm trigger="Add item" triggerSize="sm" triggerVariant="subtle" title="Add an agenda item" action={addAgendaItem}>
      <input type="hidden" name="meeting_id" value={meetingId} />
      <TextField label="Item" name="title" required />
      <PersonPicker name="presenter_person_id" label="Presenter (optional)" />
      <TextAreaField label="Notes" name="notes" rows={2} />
      <SelectField label="Library document (optional)" name="document_id" options={docs} placeholder="None" />
      <TextField label="Or a link to a paper" name="document_url" type="url" placeholder="https://" />
    </DialogForm>
  );
}

type Item = { id: string; title: string; notes: string | null; document_id: string | null; document_url: string | null };

export function EditAgendaItemForm({ meetingId, item, docs }: { meetingId: string; item: Item; docs: Doc[] }) {
  return (
    <DialogForm trigger="Edit" triggerSize="sm" triggerVariant="subtle" title="Edit agenda item" action={updateAgendaItem}>
      <input type="hidden" name="meeting_id" value={meetingId} />
      <input type="hidden" name="item_id" value={item.id} />
      <TextField label="Item" name="title" required defaultValue={item.title} />
      <PersonPicker name="presenter_person_id" label="Change presenter (optional)" hint="Leave blank to keep the current presenter." />
      <TextAreaField label="Notes" name="notes" rows={2} defaultValue={item.notes ?? ""} />
      <SelectField label="Library document" name="document_id" options={docs} placeholder="None" defaultValue={item.document_id ?? ""} />
      <TextField label="Link to a paper" name="document_url" type="url" defaultValue={item.document_url ?? ""} />
    </DialogForm>
  );
}

export function AgendaItemControls({ meetingId, itemId, first, last }: { meetingId: string; itemId: string; first: boolean; last: boolean }) {
  return (
    <span className="flex flex-wrap gap-1">
      {!first && <ActionButton action={moveAgendaItem} fields={{ meeting_id: meetingId, item_id: itemId, direction: "up" }} variant="subtle"><span aria-label="Move up">Up</span></ActionButton>}
      {!last && <ActionButton action={moveAgendaItem} fields={{ meeting_id: meetingId, item_id: itemId, direction: "down" }} variant="subtle"><span aria-label="Move down">Down</span></ActionButton>}
      <ActionButton action={removeAgendaItem} fields={{ meeting_id: meetingId, item_id: itemId }} variant="subtle" confirm="Remove this agenda item?">Remove</ActionButton>
    </span>
  );
}

export function AddAttendeeForm({ meetingId }: { meetingId: string }) {
  return (
    <DialogForm trigger="Add" triggerSize="sm" triggerVariant="subtle" title="Add an attendee" action={addAttendee}>
      <input type="hidden" name="meeting_id" value={meetingId} />
      <PersonPicker name="person_id" label="Person" required />
    </DialogForm>
  );
}

export function AttendanceSelect({ meetingId, personId, current, name }: { meetingId: string; personId: string; current: string; name: string }) {
  return (
    <ActionForm action={setAttendance} className="flex flex-wrap items-center gap-2 space-y-0">
      <input type="hidden" name="meeting_id" value={meetingId} />
      <input type="hidden" name="person_id" value={personId} />
      <label className="sr-only" htmlFor={`att-${personId}`}>Attendance for {name}</label>
      <select id={`att-${personId}`} name="attendance" defaultValue={current} className="rounded-md border border-line bg-white px-2 py-1 text-sm">
        <option value="invited">Invited</option><option value="attended">Attended</option><option value="apologies">Apologies</option><option value="absent">Absent</option>
      </select>
      <SubmitButton size="sm" variant="subtle">Save</SubmitButton>
    </ActionForm>
  );
}

export function RemoveAttendeeButton({ meetingId, personId }: { meetingId: string; personId: string }) {
  return <ActionButton action={removeAttendee} fields={{ meeting_id: meetingId, person_id: personId }} variant="subtle" confirm="Remove from this meeting?">Remove</ActionButton>;
}

export function MinutesForm({ meetingId, minutes }: { meetingId: string; minutes: string | null }) {
  return (
    <ActionForm action={saveMinutes}>
      <input type="hidden" name="meeting_id" value={meetingId} />
      <TextAreaField label="Minutes" name="minutes" rows={10} defaultValue={minutes ?? ""} required hint="Markdown is supported. Saving approved minutes returns them to draft." />
      <FormActions><SubmitButton variant="secondary">Save draft</SubmitButton></FormActions>
    </ActionForm>
  );
}

export function ApproveMinutesButton({ meetingId }: { meetingId: string }) {
  return <ActionButton action={approveMinutes} fields={{ meeting_id: meetingId }} variant="teal" confirm="Approve these minutes?">Approve minutes</ActionButton>;
}

export function DecisionForm({ meetingId, items }: { meetingId: string; items: Opt[] }) {
  return (
    <DialogForm trigger="Record decision" triggerSize="sm" triggerVariant="subtle" title="Record a decision" action={addDecision}>
      <input type="hidden" name="meeting_id" value={meetingId} />
      <TextAreaField label="Decision" name="decision" rows={3} required />
      <SelectField label="Agenda item" name="agenda_item_id" options={items} placeholder="Not linked" />
    </DialogForm>
  );
}

export function MeetingActionForm({ meetingId }: { meetingId: string }) {
  return (
    <DialogForm trigger="Add action" triggerSize="sm" triggerVariant="subtle" title="Add an action" description="Actions become tasks, linked to this meeting." action={addMeetingAction}>
      <input type="hidden" name="meeting_id" value={meetingId} />
      <TextField label="Action" name="title" required />
      <AssigneeSelect name="owner_account_id" label="Owner" hint="Leave unassigned to take it yourself." />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Due" name="due_on" type="date" />
        <SelectField label="Priority" name="priority" options={PRIORITIES} defaultValue="normal" />
      </div>
    </DialogForm>
  );
}

export function TeamNoteForm({ visibilities }: { visibilities: Opt[] }) {
  return (
    <ActionForm action={addTeamNote} resetOnSuccess success="Note added.">
      <TextAreaField label="Note" name="body" rows={4} required />
      <SelectField label="Who can see this" name="visibility" options={visibilities} defaultValue={visibilities[0]?.value} />
      <AssigneeSelect name="mentions[]" label="Mention (optional)" noneLabel="Nobody" hint="They are notified; they only see the note if their role already allows." />
      <FormActions><SubmitButton>Add note</SubmitButton></FormActions>
    </ActionForm>
  );
}

export function ArchiveNoteButton({ noteId }: { noteId: string }) {
  return <ActionButton action={archiveTeamNote} fields={{ note_id: noteId }} variant="subtle" confirm="Archive this note?">Archive</ActionButton>;
}
