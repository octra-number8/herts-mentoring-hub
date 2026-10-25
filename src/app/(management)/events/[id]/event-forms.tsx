"use client";

import { ActionButton, DialogForm } from "@/components/ui/dialog-form";
import { ActionForm, CheckboxField, FormActions, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { PersonPicker } from "@/components/ui/pickers";
import { TRAINER_ROLES } from "@/components/events/constants";
import {
  addResource, addTrainer, cancelEvent, cancelRegistration, completeEvent, inviteMember, moveWaitlist, publishEvent,
  registerPerson, removeInvite, removeResource, removeTrainer, setAttendance, setCheckin, unpublishEvent,
} from "../actions";

export function PublishButton({ eventId }: { eventId: string }) {
  return <ActionButton action={publishEvent} fields={{ event_id: eventId }} variant="primary" size="md" confirm="Publish this event? It becomes visible to its audience straight away.">Publish</ActionButton>;
}

export function UnpublishButton({ eventId }: { eventId: string }) {
  return <ActionButton action={unpublishEvent} fields={{ event_id: eventId }} variant="subtle" size="md">Return to draft</ActionButton>;
}

export function CompleteButton({ eventId }: { eventId: string }) {
  return (
    <ActionButton action={completeEvent} fields={{ event_id: eventId }} size="md"
      confirm="Mark the event as completed? Anyone confirmed but not checked in will be recorded as not attending. Attendees with feedback turned on receive a thank-you email.">
      Mark completed
    </ActionButton>
  );
}

export function CancelEventForm({ eventId, booked }: { eventId: string; booked: number }) {
  return (
    <DialogForm trigger="Cancel event" triggerVariant="danger" title="Cancel this event" submitVariant="danger" submitLabel="Cancel event"
      description={booked ? `${booked} ${booked === 1 ? "person is" : "people are"} booked. Each will receive an email with your reason.` : "Nobody has booked yet."}
      action={cancelEvent}>
      <input type="hidden" name="event_id" value={eventId} />
      <TextAreaField label="Reason" name="reason" rows={3} required hint="Shown to people who were booked. Keep it short and kind." />
    </DialogForm>
  );
}

export function TrainerForm({ eventId }: { eventId: string }) {
  return (
    <DialogForm trigger="Add" triggerSize="sm" triggerVariant="subtle" title="Allocate a trainer or presenter" action={addTrainer} submitLabel="Add">
      <input type="hidden" name="event_id" value={eventId} />
      <PersonPicker name="person_id" label="Person" required />
      <SelectField label="Role" name="role" defaultValue="trainer" options={TRAINER_ROLES.map((r) => ({ value: r.value, label: r.label }))}
        hint="Trainers and presenters with check-in permission can run check-in for this event." />
    </DialogForm>
  );
}

export function RemoveTrainer({ eventId, personId, name }: { eventId: string; personId: string; name: string }) {
  return <ActionButton action={removeTrainer} fields={{ event_id: eventId, person_id: personId }} variant="subtle" confirm={`Remove ${name} from this event?`}>Remove</ActionButton>;
}

export function InviteForm({ eventId, published }: { eventId: string; published: boolean }) {
  return (
    <DialogForm trigger="Invite" triggerSize="sm" triggerVariant="subtle" title="Invite a member" action={inviteMember} submitLabel="Invite">
      <input type="hidden" name="event_id" value={eventId} />
      <PersonPicker name="person_id" label="Member" required />
      {published ? <CheckboxField label="Let them know with a Hub notification" name="notify" defaultChecked /> : <p className="text-sm text-muted">Invited members can see the event once it is published.</p>}
    </DialogForm>
  );
}

export function RemoveInvite({ eventId, personId }: { eventId: string; personId: string }) {
  return <ActionButton action={removeInvite} fields={{ event_id: eventId, person_id: personId }} variant="subtle">Remove</ActionButton>;
}

export function ResourceForm({ eventId, documents }: { eventId: string; documents: { id: string; title: string }[] }) {
  return (
    <DialogForm trigger="Add" triggerSize="sm" triggerVariant="subtle" title="Add a resource" action={addResource} submitLabel="Add resource">
      <input type="hidden" name="event_id" value={eventId} />
      <TextField label="Title" name="title" required />
      <TextField label="Link" name="url" type="url" placeholder="https://" hint="A slide deck, handout or Solomon page. Link to Solomon rather than copying its content." />
      {documents.length > 0 && <SelectField label="Or a Library document" name="document_id" placeholder="None" options={documents.map((d) => ({ value: d.id, label: d.title }))} />}
      <SelectField label="For" name="audience" defaultValue="presenter" options={[{ value: "presenter", label: "Presenters and organisers only" }, { value: "attendees", label: "Attendees with a confirmed place" }]} />
    </DialogForm>
  );
}

export function RemoveResource({ eventId, resourceId }: { eventId: string; resourceId: string }) {
  return <ActionButton action={removeResource} fields={{ event_id: eventId, resource_id: resourceId }} variant="subtle">Remove</ActionButton>;
}

export function RegisterPersonForm({ eventId }: { eventId: string }) {
  return (
    <DialogForm trigger="Register someone" triggerSize="sm" title="Register a member" action={registerPerson} submitLabel="Register"
      description="Capacity and the waiting list apply as if they had booked themselves. They receive the usual confirmation email.">
      <input type="hidden" name="event_id" value={eventId} />
      <PersonPicker name="person_id" label="Member" required />
    </DialogForm>
  );
}

export function CancelRegistrationButton({ eventId, registrationId, name }: { eventId: string; registrationId: string; name: string }) {
  return <ActionButton action={cancelRegistration} fields={{ event_id: eventId, registration_id: registrationId }} variant="subtle" confirm={`Cancel ${name}'s place?`}>Cancel place</ActionButton>;
}

export function AttendanceForm({ eventId, registrationId, name, current }: { eventId: string; registrationId: string; name: string; current: string }) {
  return (
    <DialogForm trigger="Attendance" triggerSize="sm" triggerVariant="subtle" title={`Attendance: ${name}`} action={setAttendance} submitLabel="Save"
      description="Use this when someone could not check in themselves, or to correct a record. Your reason is kept in the audit log.">
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="registration_id" value={registrationId} />
      <SelectField label="Record as" name="status" defaultValue={current === "attended" ? "no_show" : "attended"} options={[
        { value: "attended", label: "Attended" }, { value: "no_show", label: "Did not attend" }, { value: "confirmed", label: "Confirmed (not yet recorded)" }]} />
      <TextField label="Reason" name="reason" required placeholder="e.g. Signed the paper register" />
    </DialogForm>
  );
}

export function WaitlistMove({ eventId, registrationId, first, last }: { eventId: string; registrationId: string; first: boolean; last: boolean }) {
  return (
    <span className="inline-flex gap-1">
      {!first && <ActionButton action={moveWaitlist} fields={{ event_id: eventId, registration_id: registrationId, direction: "up" }} variant="subtle"><span aria-label="Move up">Up</span></ActionButton>}
      {!last && <ActionButton action={moveWaitlist} fields={{ event_id: eventId, registration_id: registrationId, direction: "down" }} variant="subtle"><span aria-label="Move down">Down</span></ActionButton>}
    </span>
  );
}

export function CheckinControls({ eventId, open }: { eventId: string; open: boolean }) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      {open ? (
        <ActionButton action={setCheckin} fields={{ event_id: eventId, open: "false" }} size="md">Close check-in</ActionButton>
      ) : (
        <ActionButton action={setCheckin} fields={{ event_id: eventId, open: "true" }} size="md" variant="teal">Open check-in</ActionButton>
      )}
      <ActionForm action={setCheckin} className="inline-block space-y-2">
        <input type="hidden" name="event_id" value={eventId} />
        <input type="hidden" name="open" value="true" />
        <input type="hidden" name="rotate" value="on" />
        <FormActions><SubmitButton variant="subtle" pendingText="Working…">New session code</SubmitButton></FormActions>
      </ActionForm>
    </div>
  );
}
