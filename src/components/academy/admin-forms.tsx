"use client";

import { DialogForm } from "@/components/ui/dialog-form";
import { ActionForm, CheckboxField, SelectField, TextAreaField, TextField } from "@/components/ui/form";
import { PersonPicker } from "@/components/ui/pickers";
import type { ActionState } from "@/lib/action-state";
import { todayIso } from "@/lib/utils";
import { AUDIENCES } from "@/server/academy/content";

type Action = (p: ActionState, f: FormData) => Promise<ActionState>;
type Opt = { value: string; label: string };
const LEARNER_LOOKUP = "/learning/people";

export function DecisionForm({ action, versionId, to, trigger, title, noteRequired, variant = "secondary", description }: {
  action: Action; versionId: string; to: "approved" | "draft" | "published" | "archived"; trigger: string; title: string; noteRequired?: boolean;
  variant?: "primary" | "secondary" | "subtle" | "danger" | "teal"; description?: string;
}) {
  return (
    <DialogForm trigger={trigger} triggerVariant={variant} triggerSize="sm" title={title} description={description} action={action} submitLabel={trigger}>
      <input type="hidden" name="version_id" value={versionId} />
      <input type="hidden" name="to" value={to} />
      <TextAreaField label={noteRequired ? "Note for the author" : "Note (optional)"} name="note" rows={3} required={noteRequired} />
    </DialogForm>
  );
}

export function EnrolForm({ action, courses, person }: { action: Action; courses: Opt[]; person?: { id: string; label: string } }) {
  return (
    <DialogForm trigger="Enrol a learner" triggerVariant={person ? "secondary" : "primary"} title={person ? `Enrol ${person.label}` : "Enrol a learner"}
      description="The learner receives an email with a link to the course." action={action} submitLabel="Enrol">
      {person ? <input type="hidden" name="person_id" value={person.id} /> : (
        <PersonPicker name="person_id" label="Learner" required endpoint={LEARNER_LOOKUP} hint="Search by name. Only people with Hub access are listed." />
      )}
      <SelectField label="Course" name="course_id" options={courses} placeholder="Choose a course" required />
      <TextField label="Suggested completion date" name="due_on" type="date" hint="Optional. Shown to the learner as a gentle target." />
    </DialogForm>
  );
}

export function RecognitionForm({ action, courses, person }: { action: Action; courses: Opt[]; person?: { id: string; label: string } }) {
  return (
    <DialogForm trigger="Issue recognition" triggerVariant={person ? "secondary" : "primary"} title="Issue a recognition certificate"
      description="For learning or contribution recognised outside the Academy courses. The reason is recorded and audited." action={action} submitLabel="Issue certificate" wide>
      {person ? <input type="hidden" name="person_id" value={person.id} /> : <PersonPicker name="person_id" label="Learner" required endpoint={LEARNER_LOOKUP} />}
      <TextField label="Certificate title" name="title" required placeholder="e.g. Lodge Mentor development" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Date recognised" name="completed_on" type="date" defaultValue={todayIso()} max={todayIso()} required />
        <SelectField label="Related course" name="course_id" options={courses} placeholder="None" />
      </div>
      <TextAreaField label="Reason" name="reason" rows={3} required hint="A sentence or two. Shown on the learner's certificate list." />
    </DialogForm>
  );
}

export function RevokeForm({ action, certificateId, title }: { action: Action; certificateId: string; title: string }) {
  return (
    <DialogForm trigger="Revoke" triggerVariant="subtle" triggerSize="sm" title={`Revoke "${title}"`} submitVariant="danger" submitLabel="Revoke certificate"
      description="The certificate disappears from the learner's list and can no longer be downloaded. The record is kept for audit." action={action}>
      <input type="hidden" name="certificate_id" value={certificateId} />
      <TextAreaField label="Reason" name="reason" rows={3} required />
    </DialogForm>
  );
}

type Pathway = { id: string; slug: string; title: string; summary: string; audience: string; position: number };

export function PathwayForm({ action, pathway }: { action: Action; pathway?: Pathway }) {
  return (
    <DialogForm trigger={pathway ? "Edit details" : "New pathway"} triggerVariant={pathway ? "secondary" : "primary"} triggerSize={pathway ? "sm" : "md"}
      title={pathway ? "Edit pathway" : "Create a pathway"} action={action} submitLabel="Save">
      {pathway && <input type="hidden" name="id" value={pathway.id} />}
      <TextField label="Title" name="title" defaultValue={pathway?.title} required />
      <TextField label="Short name" name="slug" defaultValue={pathway?.slug} required hint="Lower-case words joined by hyphens, used in links." />
      <TextAreaField label="Summary" name="summary" rows={3} defaultValue={pathway?.summary ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Audience" name="audience" options={AUDIENCES} defaultValue={pathway?.audience ?? "lodge_mentor"} />
        <TextField label="Display order" name="position" type="number" min={0} defaultValue={String(pathway?.position ?? 0)} />
      </div>
    </DialogForm>
  );
}

export function AddPathwayCourseForm({ action, pathwayId, courses }: { action: Action; pathwayId: string; courses: Opt[] }) {
  return (
    <ActionForm action={action} className="flex flex-wrap items-end gap-3 space-y-0" resetOnSuccess>
      <input type="hidden" name="pathway_id" value={pathwayId} />
      <SelectField label="Course" name="course_id" options={courses} placeholder="Choose a course" required fieldClassName="min-w-[14rem] flex-1" />
      <SelectField label="Requirement" name="requirement" options={[{ value: "essential", label: "Essential" }, { value: "optional", label: "Optional" }]} defaultValue="essential" />
      <button type="submit" className="inline-flex h-10 items-center rounded-md bg-navy-800 px-4 font-medium text-white hover:bg-navy-900">Add course</button>
    </ActionForm>
  );
}

type Badge = { id: string; key: string; name: string; description: string; criteria: Record<string, unknown>; active: boolean };

export function BadgeForm({ action, badge, courses, pathways }: { action: Action; badge?: Badge; courses: Opt[]; pathways: Opt[] }) {
  const c = badge?.criteria ?? {};
  const type = "pathway_id" in c ? "pathway" : "courses_completed" in c ? "count" : "course";
  return (
    <DialogForm trigger={badge ? "Edit" : "New badge"} triggerVariant={badge ? "subtle" : "primary"} triggerSize={badge ? "sm" : "md"} title={badge ? "Edit badge" : "Create a badge"} action={action} submitLabel="Save badge" wide>
      {badge && <input type="hidden" name="id" value={badge.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Name" name="name" defaultValue={badge?.name} required />
        <TextField label="Key" name="key" defaultValue={badge?.key} required hint="Lower-case words joined by hyphens." />
      </div>
      <TextField label="Description" name="description" defaultValue={badge?.description} required hint="What the learner achieved, in a warm sentence." />
      <SelectField label="Awarded when" name="criteria" defaultValue={type} options={[
        { value: "course", label: "A specific course is completed" }, { value: "pathway", label: "Every essential course in a pathway is completed" },
        { value: "count", label: "A number of courses are completed" }]} />
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField label="Course" name="course_id" options={courses} placeholder="Choose" defaultValue={String(c.course_id ?? "")} hint="For course badges" />
        <SelectField label="Pathway" name="pathway_id" options={pathways} placeholder="Choose" defaultValue={String(c.pathway_id ?? "")} hint="For pathway badges" />
        <TextField label="Courses completed" name="courses_completed" type="number" min={1} defaultValue={c.courses_completed ? String(c.courses_completed) : ""} hint="For count badges" />
      </div>
      <CheckboxField label="Active" name="active" defaultChecked={badge?.active ?? true} />
    </DialogForm>
  );
}

type Link = { id: string; title: string; url: string; description: string; pathway_id: string | null; course_id: string | null; topics: string[]; position: number };

export function SolomonForm({ action, link, courses, pathways }: { action: Action; link?: Link; courses: Opt[]; pathways: Opt[] }) {
  return (
    <DialogForm trigger={link ? "Edit" : "Add a Solomon link"} triggerVariant={link ? "subtle" : "primary"} triggerSize={link ? "sm" : "md"}
      title={link ? "Edit link" : "Add a Solomon link"} description="Links only: never copy Solomon content into the Hub." action={action} submitLabel="Save link" wide>
      {link && <input type="hidden" name="id" value={link.id} />}
      <TextField label="Title" name="title" defaultValue={link?.title} required />
      <TextField label="Solomon address" name="url" type="url" defaultValue={link?.url} required hint="Must start with https://" />
      <TextAreaField label="Why it helps" name="description" rows={2} defaultValue={link?.description ?? ""} hint="Your own words: a line on why it is useful." />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Pathway" name="pathway_id" options={pathways} placeholder="None" defaultValue={link?.pathway_id ?? ""} />
        <SelectField label="Course" name="course_id" options={courses} placeholder="None" defaultValue={link?.course_id ?? ""} />
        <TextField label="Topics" name="topics" defaultValue={link?.topics.join(", ") ?? ""} hint="Comma separated" />
        <TextField label="Display order" name="position" type="number" min={0} defaultValue={String(link?.position ?? 0)} />
      </div>
    </DialogForm>
  );
}
