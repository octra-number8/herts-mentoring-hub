"use client";

import { ActionButton, DialogForm } from "@/components/ui/dialog-form";
import { ActionForm, CheckboxField, FormActions, RadioGroup, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { PersonPicker } from "@/components/ui/pickers";
import { AssigneeSelect } from "@/components/members/assignee-select";
import { todayIso } from "@/lib/utils";
import { FIELDS } from "@/components/members/fields";
import { addPersonNote, clearCorrection, logPersonContact, recordCorrection, recordDegree, updateJourney, updatePersonalMentor } from "../actions";

const STAGES = [
  { value: "enquirer", label: "Enquirer" }, { value: "applicant", label: "Applicant" }, { value: "candidate", label: "Candidate" },
  { value: "entered_apprentice", label: "Entered Apprentice" }, { value: "fellow_craft", label: "Fellow Craft" },
  { value: "master_mason", label: "Master Mason" }, { value: "established", label: "Established member" },
];
const ROYAL_ARCH = [
  { value: "not_discussed", label: "Not yet discussed" }, { value: "informed", label: "Informed" }, { value: "interested", label: "Interested" },
  { value: "proposed", label: "Proposed" }, { value: "exalted", label: "Exalted" }, { value: "not_now", label: "Not at present" },
];
const METHODS = [
  { value: "telephone", label: "Telephone" }, { value: "email", label: "Email" }, { value: "online_meeting", label: "Online meeting" },
  { value: "face_to_face", label: "Face to face" }, { value: "lodge_visit", label: "Lodge visit" }, { value: "other", label: "Other" },
];


type Journey = {
  stage: string; royal_arch: string; journey_status: string; next_review_on: string | null; learning_opt_in: boolean;
  personal_mentor_allocated: string; personal_mentor_confirmed_on: string | null; personal_mentor_review_on: string | null;
} | null;

export function JourneyForm({ personId, journey }: { personId: string; journey: Journey }) {
  return (
    <DialogForm trigger={journey ? "Edit" : "Start journey"} triggerSize="sm" triggerVariant={journey ? "subtle" : "secondary"} title="Mentoring journey"
      description="Where the Brother is on his journey. There is no fixed end date." action={updateJourney} wide>
      <input type="hidden" name="person_id" value={personId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Stage" name="stage" options={STAGES} defaultValue={journey?.stage ?? "entered_apprentice"} required />
        <SelectField label="Journey status" name="journey_status" defaultValue={journey?.journey_status ?? "active"}
          options={[{ value: "active", label: "Active" }, { value: "paused", label: "Paused" }, { value: "closed", label: "Closed" }]} />
        <SelectField label="Royal Arch" name="royal_arch" options={ROYAL_ARCH} defaultValue={journey?.royal_arch ?? "not_discussed"}
          hint="For information only. This is not a recruitment record." />
        <TextField label="Next review" name="next_review_on" type="date" defaultValue={journey?.next_review_on ?? ""} hint="Optional. Set whenever a conversation would be useful." />
      </div>
      <CheckboxField label="Has chosen to take part in Academy learning" name="learning_opt_in" defaultChecked={journey?.learning_opt_in ?? false} />
    </DialogForm>
  );
}

export function PersonalMentorForm({ personId, journey, lodgeId }: { personId: string; journey: Journey; lodgeId?: string | null }) {
  return (
    <DialogForm trigger="Update" triggerSize="sm" triggerVariant="subtle" title="Personal Mentor"
      description="Recording whether a Personal Mentor is in place is enough. Naming the mentor is optional." action={updatePersonalMentor}>
      <input type="hidden" name="person_id" value={personId} />
      <RadioGroup legend="Is a Personal Mentor allocated?" name="personal_mentor_allocated" defaultValue={journey?.personal_mentor_allocated ?? "unknown"}
        options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unknown", label: "Unknown" }]} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Date confirmed" name="personal_mentor_confirmed_on" type="date" defaultValue={todayIso()} hint="Required for Yes or No." />
        <TextField label="Review date" name="personal_mentor_review_on" type="date" defaultValue={journey?.personal_mentor_review_on ?? ""} hint="Optional." />
      </div>
      <PersonPicker name="personal_mentor_confirmed_by" label="Confirmed by" hint="Leave blank if you confirmed it yourself." />
      <PersonPicker name="personal_mentor_person_id" label="Personal Mentor (optional)" lodgeId={lodgeId ?? undefined} hint="Only if useful. Never required." />
    </DialogForm>
  );
}

export function PersonContactForm({ personId }: { personId: string }) {
  return (
    <DialogForm trigger="Log contact" triggerVariant="primary" title="Log a contact" description="Keep it quick: a line or two is enough." action={logPersonContact} submitLabel="Save contact">
      <input type="hidden" name="person_id" value={personId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="How" name="method" options={METHODS} defaultValue="telephone" required />
        <TextField label="When" name="occurred_on" type="date" defaultValue={todayIso()} required />
      </div>
      <TextAreaField label="Summary" name="summary" rows={3} required />
      <TextField label="Outcome" name="outcome" placeholder="Optional" />
      <TextField label="Follow up by" name="follow_up_on" type="date" />
      <CheckboxField label="Create a follow-up task for me" name="create_task" />
      <SelectField label="Who can see this" name="visibility" defaultValue="ordinary" options={[
        { value: "ordinary", label: "Those responsible for this Brother's Lodge" }, { value: "team", label: "Provincial team" }, { value: "leadership", label: "Leadership only" }]} />
    </DialogForm>
  );
}

export function PersonNoteForm({ personId, visibilities }: { personId: string; visibilities: { value: string; label: string }[] }) {
  return (
    <ActionForm action={addPersonNote} resetOnSuccess success="Note added.">
      <input type="hidden" name="person_id" value={personId} />
      <TextAreaField label="Note" name="body" rows={4} required />
      <SelectField label="Who can see this" name="visibility" options={visibilities} defaultValue={visibilities[0]?.value} />
      <AssigneeSelect name="mentions[]" label="Mention (optional)" noneLabel="Nobody" hint="They are notified; they only see the note if their role already allows." />
      <FormActions><SubmitButton>Add note</SubmitButton></FormActions>
    </ActionForm>
  );
}

export function CorrectionForm({ personId, current }: { personId: string; current: Record<string, string | null> }) {
  return (
    <DialogForm trigger="Correct a detail" triggerSize="sm" triggerVariant="subtle" title="Correct a contact detail"
      description="Hermes or Adelphi remains the membership record. A local correction is kept with your reason, and membership imports will not overwrite it." action={recordCorrection}>
      <input type="hidden" name="person_id" value={personId} />
      <SelectField label="Detail" name="field" options={FIELDS.map((f) => ({ ...f, label: `${f.label}${current[f.value] ? ` (now: ${current[f.value]})` : ""}` }))} defaultValue="email" />
      <TextField label="Corrected value" name="value" hint="Leave blank to clear an email, telephone or title." />
      <TextAreaField label="Reason" name="reason" rows={2} required placeholder="e.g. Brother confirmed his new email by telephone" />
    </DialogForm>
  );
}

export function ClearCorrectionButton({ personId, field }: { personId: string; field: string }) {
  return (
    <ActionButton action={clearCorrection} fields={{ person_id: personId, field }} variant="subtle"
      confirm="Allow the next membership import to update this detail again?">Release</ActionButton>
  );
}

export function DegreeForm({ personId, lodges }: { personId: string; lodges: { id: string; label: string }[] }) {
  return (
    <DialogForm trigger="Record" triggerSize="sm" triggerVariant="subtle" title="Record a degree or joining"
      description="Normally these arrive through membership imports. Record one here only if it is missing." action={recordDegree}>
      <input type="hidden" name="person_id" value={personId} />
      <SelectField label="Event" name="kind" defaultValue="passing" options={[
        { value: "initiation", label: "Initiation" }, { value: "passing", label: "Passing" }, { value: "raising", label: "Raising" },
        { value: "joining", label: "Joining" }, { value: "exaltation", label: "Exaltation" }]} />
      <TextField label="Date" name="event_date" type="date" required />
      <SelectField label="Lodge" name="lodge_id" placeholder="Not recorded" options={lodges.map((l) => ({ value: l.id, label: l.label }))} defaultValue={lodges[0]?.id ?? ""} />
    </DialogForm>
  );
}
