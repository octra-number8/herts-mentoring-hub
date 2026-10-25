"use client";

import { DialogForm } from "@/components/ui/dialog-form";
import { ActionForm, CheckboxField, FormActions, RadioGroup, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { AccountSelect, PersonPicker } from "@/components/ui/pickers";
import { isoInDays, todayIso } from "@/lib/utils";
import {
  addLodgeNote, addLodgeTask, changeMentoringStatus, completeVisit, decideProposal, logContact, planVisit,
  recordAppointment, recordReview, updateLodgeDetails, updateMentoringArrangements,
} from "../actions";

const METHODS = [
  { value: "telephone", label: "Telephone" }, { value: "email", label: "Email" }, { value: "online_meeting", label: "Online meeting" },
  { value: "face_to_face", label: "Face to face" }, { value: "lodge_visit", label: "Lodge visit" }, { value: "other", label: "Other" },
];
const YNU = [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unknown", label: "Unknown" }];

export function ContactForm({ lodgeId }: { lodgeId: string }) {
  return (
    <DialogForm trigger="Log contact" triggerVariant="primary" title="Log a contact" description="Keep it quick: a line or two is enough." action={logContact} submitLabel="Save contact">
      <input type="hidden" name="lodge_id" value={lodgeId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="How" name="method" options={METHODS} defaultValue="telephone" required />
        <TextField label="When" name="occurred_on" type="date" defaultValue={todayIso()} required />
      </div>
      <TextAreaField label="Summary" name="summary" rows={3} required />
      <TextField label="Outcome" name="outcome" placeholder="Optional" />
      <TextField label="Follow up by" name="follow_up_on" type="date" />
      <CheckboxField label="Create a follow-up task for me" name="create_task" />
      <SelectField label="Who can see this" name="visibility" defaultValue="ordinary" options={[
        { value: "ordinary", label: "Those responsible for this Lodge" }, { value: "team", label: "Provincial team" }, { value: "leadership", label: "Leadership only" }]} />
    </DialogForm>
  );
}

export function VisitForm({ lodgeId, canCalendar }: { lodgeId: string; canCalendar: boolean }) {
  return (
    <DialogForm trigger="Plan visit" title="Plan a Lodge visit" action={planVisit} submitLabel="Plan visit">
      <input type="hidden" name="lodge_id" value={lodgeId} />
      <TextField label="Date and time" name="planned_for" type="datetime-local" required />
      <TextAreaField label="Purpose" name="purpose" rows={2} required />
      {canCalendar && <CheckboxField label="Add to the Provincial calendar" name="add_to_calendar" defaultChecked />}
    </DialogForm>
  );
}

export function CompleteVisitForm({ lodgeId, visitId }: { lodgeId: string; visitId: string }) {
  return (
    <DialogForm trigger="Record outcome" triggerSize="sm" title="Record visit outcome" action={completeVisit} submitLabel="Save">
      <input type="hidden" name="lodge_id" value={lodgeId} />
      <input type="hidden" name="visit_id" value={visitId} />
      <SelectField label="Status" name="status" defaultValue="completed" options={[{ value: "completed", label: "Completed" }, { value: "postponed", label: "Postponed" }, { value: "cancelled", label: "Cancelled" }]} />
      <TextAreaField label="Outcome" name="outcome" rows={3} />
      <TextField label="Follow-up action" name="follow_up" placeholder="Optional" />
      <TextField label="Follow up by" name="follow_up_on" type="date" hint="With a follow-up action, this creates a task for you." />
    </DialogForm>
  );
}

export function ReviewForm({ lodgeId }: { lodgeId: string }) {
  return (
    <DialogForm trigger="Annual review" title="Light-touch mentoring review" description="Five short questions. Leave anything blank that isn't useful." action={recordReview} submitLabel="Save review" wide>
      <input type="hidden" name="lodge_id" value={lodgeId} />
      <TextField label="Date of conversation" name="review_date" type="date" defaultValue={todayIso()} required />
      <RadioGroup legend="Is a Lodge Mentor in place?" name="lodge_mentor_in_place" options={YNU} defaultValue="yes" />
      <RadioGroup legend="Do new members have Personal Mentors?" name="personal_mentors_in_place" options={[...YNU.slice(0, 2), { value: "partly", label: "Partly" }, YNU[2]]} defaultValue="yes" />
      <TextAreaField label="What is working well?" name="what_is_working" rows={2} />
      <TextAreaField label="What support would help?" name="support_wanted" rows={2} />
      <TextField label="Training needs" name="training_needs" />
      <TextField label="Next review" name="next_review_on" type="date" defaultValue={isoInDays(365)} />
    </DialogForm>
  );
}

export function StatusForm({ lodgeId, statuses, current }: { lodgeId: string; statuses: { id: string; label: string }[]; current: string | null }) {
  return (
    <DialogForm trigger="Change" triggerSize="sm" triggerVariant="subtle" title="Change mentoring status" action={changeMentoringStatus}>
      <input type="hidden" name="lodge_id" value={lodgeId} />
      <SelectField label="Status" name="status_id" defaultValue={current ?? ""} options={statuses.map((s) => ({ value: s.id, label: s.label }))} required />
      <TextAreaField label="Reason" name="note" rows={2} hint="Optional. Added to the Lodge notes." />
    </DialogForm>
  );
}

export function AppointmentForm({ lodgeId }: { lodgeId: string }) {
  return (
    <DialogForm trigger="Record appointment" triggerSize="sm" title="Record an appointment" description="The previous holder's dates are kept. A new Lodge Mentor does not receive Lodge management access in this release." action={recordAppointment}>
      <input type="hidden" name="lodge_id" value={lodgeId} />
      <SelectField label="Office" name="office" defaultValue="lodge_mentor" options={[
        { value: "lodge_mentor", label: "Lodge Mentor" }, { value: "assistant_lodge_mentor", label: "Assistant Lodge Mentor" },
        { value: "worshipful_master", label: "Worshipful Master" }, { value: "secretary", label: "Secretary" },
        { value: "membership_officer", label: "Membership Officer" }, { value: "almoner", label: "Almoner" },
        { value: "royal_arch_representative", label: "Royal Arch Representative" }]} />
      <PersonPicker name="person_id" label="Brother appointed" lodgeId={lodgeId} hint="Search this Lodge's members, or type a name." />
      <CheckboxField label="Record the office as vacant instead" name="vacant" />
      <TextField label="From" name="starts_on" type="date" defaultValue={todayIso()} required />
      <CheckboxField label="Confirmed with the Lodge" name="confirmed" defaultChecked />
    </DialogForm>
  );
}

type Profile = { personal_mentors_for_new_members: string; arrangements: string | null; guidance_used: string | null; training_requirements: string | null; improvement_opportunities: string | null; good_practice: string | null; next_review_on: string | null } | null;

export function ArrangementsForm({ lodgeId, profile }: { lodgeId: string; profile: Profile }) {
  return (
    <DialogForm trigger="Edit" triggerSize="sm" triggerVariant="subtle" title="Mentoring arrangements" action={updateMentoringArrangements} wide>
      <input type="hidden" name="lodge_id" value={lodgeId} />
      <RadioGroup legend="Do new members receive a Personal Mentor?" name="personal_mentors_for_new_members" defaultValue={profile?.personal_mentors_for_new_members ?? "unknown"}
        options={[{ value: "yes", label: "Yes" }, { value: "partly", label: "Partly" }, { value: "no", label: "No" }, { value: "unknown", label: "Unknown" }]} />
      <TextAreaField label="Arrangements" name="arrangements" rows={3} defaultValue={profile?.arrangements ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Guidance used" name="guidance_used" defaultValue={profile?.guidance_used ?? ""} />
        <TextField label="Training requirements" name="training_requirements" defaultValue={profile?.training_requirements ?? ""} />
        <TextField label="Opportunities" name="improvement_opportunities" defaultValue={profile?.improvement_opportunities ?? ""} />
        <TextField label="Good practice" name="good_practice" defaultValue={profile?.good_practice ?? ""} />
      </div>
      <TextField label="Next review" name="next_review_on" type="date" defaultValue={profile?.next_review_on ?? ""} />
    </DialogForm>
  );
}

type LodgeRow = { id: string; name: string; meeting_centre_id: string | null; meeting_pattern: string | null; installation_month: number | null; status: string; website: string | null; email: string | null };

export function DetailsForm({ lodge, centres }: { lodge: LodgeRow; centres: { id: string; name: string }[] }) {
  return (
    <DialogForm trigger="Edit" triggerSize="sm" triggerVariant="subtle" title="Lodge details" action={updateLodgeDetails} wide>
      <input type="hidden" name="lodge_id" value={lodge.id} />
      <TextField label="Lodge name" name="name" defaultValue={lodge.name} required />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Meeting centre" name="meeting_centre_id" defaultValue={lodge.meeting_centre_id ?? ""} placeholder="Not set" options={centres.map((c) => ({ value: c.id, label: c.name }))} />
        <TextField label="Meeting pattern" name="meeting_pattern" defaultValue={lodge.meeting_pattern ?? ""} />
        <SelectField label="Installation month" name="installation_month" defaultValue={lodge.installation_month?.toString() ?? ""} placeholder="Not set"
          options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: new Date(2000, i).toLocaleString("en-GB", { month: "long" }) }))} />
        <SelectField label="Lodge status" name="status" defaultValue={lodge.status} options={[{ value: "active", label: "Active" }, { value: "in_abeyance", label: "In abeyance" }, { value: "amalgamated", label: "Amalgamated" }, { value: "erased", label: "Erased" }, { value: "consecrating", label: "Consecrating" }]} />
        <TextField label="Website" name="website" defaultValue={lodge.website ?? ""} />
        <TextField label="Lodge email" name="email" type="email" defaultValue={lodge.email ?? ""} />
      </div>
    </DialogForm>
  );
}

export function AddNoteForm({ lodgeId, visibilities }: { lodgeId: string; visibilities: { value: string; label: string }[] }) {
  return (
    <ActionForm action={addLodgeNote} resetOnSuccess success="Note added.">
      <input type="hidden" name="lodge_id" value={lodgeId} />
      <TextAreaField label="Note" name="body" rows={4} required />
      <SelectField label="Who can see this" name="visibility" options={visibilities} defaultValue={visibilities[0]?.value} />
      <AccountSelect name="mentions[]" label="Mention (optional)" hint="They are notified; they only see the note if their role already allows." />
      <FormActions><SubmitButton>Add note</SubmitButton></FormActions>
    </ActionForm>
  );
}

export function AddTaskForm({ lodgeId }: { lodgeId: string }) {
  return (
    <DialogForm trigger="Add" triggerSize="sm" triggerVariant="subtle" title="New task for this Lodge" action={addLodgeTask}>
      <input type="hidden" name="lodge_id" value={lodgeId} />
      <TextField label="Task" name="title" required />
      <AccountSelect name="owner_account_id" label="Owner" hint="Leave unassigned to take it yourself." />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Due" name="due_on" type="date" />
        <SelectField label="Priority" name="priority" defaultValue="normal" options={[{ value: "low", label: "Low" }, { value: "normal", label: "Normal" }, { value: "high", label: "High" }]} />
      </div>
    </DialogForm>
  );
}

export function ProposalDecision({ lodgeId, proposalId }: { lodgeId: string; proposalId: string }) {
  return (
    <ActionForm action={decideProposal} className="flex flex-wrap items-center gap-2 space-y-0">
      <input type="hidden" name="lodge_id" value={lodgeId} />
      <input type="hidden" name="proposal_id" value={proposalId} />
      <SubmitButton size="sm" name="decision" value="accepted">Apply change</SubmitButton>
      <SubmitButton size="sm" variant="secondary" name="decision" value="rejected">Decline</SubmitButton>
    </ActionForm>
  );
}
