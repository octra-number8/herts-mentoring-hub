"use client";

import { DialogForm } from "@/components/ui/dialog-form";
import { ActionForm, CheckboxField, FormActions, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import type { ActionState } from "@/lib/action-state";
import { AUDIENCES, LESSON_KINDS, LEVELS, PRINCIPLE_OPTIONS, STAGES } from "@/server/academy/content";

type Action = (p: ActionState, f: FormData) => Promise<ActionState>;

export type CourseMeta = {
  id?: string; slug?: string; title: string; summary: string; audiences: string[]; masonic_stages: string[]; topics: string[];
  level: string; principle: string | null; estimated_minutes: number | null;
};

function CourseFields({ course }: { course?: CourseMeta }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField label="Level" name="level" options={LEVELS} defaultValue={course?.level ?? "optional"} />
        <SelectField label="Principle" name="principle" options={PRINCIPLE_OPTIONS} placeholder="None" defaultValue={course?.principle ?? ""} />
        <TextField label="Estimated minutes" name="estimated_minutes" type="number" min={1} max={600} defaultValue={course?.estimated_minutes?.toString() ?? ""} />
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink">Audiences</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {AUDIENCES.map((a) => <CheckboxField key={a.value} label={a.label} name="audiences[]" value={a.value} defaultChecked={course?.audiences.includes(a.value)} />)}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink">Suited to stages</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {STAGES.map((s) => <CheckboxField key={s.value} label={s.label} name="masonic_stages[]" value={s.value} defaultChecked={course?.masonic_stages.includes(s.value)} />)}
        </div>
      </fieldset>
      <TextField label="Topics" name="topics" defaultValue={course?.topics.join(", ") ?? ""} hint="Comma separated. Used to match learners' interests." />
    </>
  );
}

export function NewCourseForm({ action }: { action: Action }) {
  return (
    <DialogForm trigger="New course" triggerVariant="primary" title="Create a course" description="This creates the course and its first draft version." action={action} submitLabel="Create course" wide>
      <TextField label="Title" name="title" required />
      <TextField label="Web address" name="slug" required hint="Lower-case words joined by hyphens, e.g. listening-well. This cannot be changed later." />
      <TextAreaField label="Summary" name="summary" rows={3} hint="One or two sentences shown on the course card." />
      <CourseFields />
    </DialogForm>
  );
}

export function EditCourseForm({ action, course }: { action: Action; course: CourseMeta }) {
  return (
    <DialogForm trigger="Edit course details" triggerSize="sm" title="Course details" description="Audience, level and topics apply to every version. Title and summary come from each version." action={action} wide>
      <input type="hidden" name="course_id" value={course.id} />
      <input type="hidden" name="title" value={course.title} />
      <input type="hidden" name="summary" value={course.summary} />
      <CourseFields course={course} />
    </DialogForm>
  );
}

export function VersionSettingsForm({ action, version }: {
  action: Action; version: { id: string; title: string; summary: string; pass_mark: number; completion_rule: string; certificate_enabled: boolean; change_summary: string | null };
}) {
  return (
    <ActionForm action={action}>
      <input type="hidden" name="version_id" value={version.id} />
      <TextField label="Title" name="title" defaultValue={version.title} required />
      <TextAreaField label="Summary" name="summary" rows={3} defaultValue={version.summary} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Course pass mark (%)" name="pass_mark" type="number" min={0} max={100} defaultValue={String(version.pass_mark)} required hint="Knowledge checks can override this." />
        <SelectField label="Completion rule" name="completion_rule" defaultValue={version.completion_rule} options={[
          { value: "all_lessons", label: "All required lessons" }, { value: "all_lessons_and_assessments", label: "All required lessons and every knowledge check passed" }]} />
      </div>
      <CheckboxField label="Issue a certificate on completion" name="certificate_enabled" defaultChecked={version.certificate_enabled} />
      <TextAreaField label="Change summary" name="change_summary" rows={2} defaultValue={version.change_summary ?? ""} hint="What is new in this version. Reviewers see this." />
      <FormActions><SubmitButton>Save settings</SubmitButton></FormActions>
    </ActionForm>
  );
}

export function ModuleForm({ action, versionId, module }: { action: Action; versionId?: string; module?: { id: string; title: string; summary: string } }) {
  return (
    <DialogForm trigger={module ? "Rename" : "Add module"} triggerVariant={module ? "subtle" : "secondary"} triggerSize="sm" title={module ? "Edit module" : "Add a module"} action={action}>
      {versionId && <input type="hidden" name="version_id" value={versionId} />}
      {module && <input type="hidden" name="module_id" value={module.id} />}
      <TextField label="Module title" name="title" defaultValue={module?.title} required />
      <TextAreaField label="Summary" name="summary" rows={2} defaultValue={module?.summary ?? ""} />
    </DialogForm>
  );
}

export function NewLessonForm({ action, moduleId }: { action: Action; moduleId: string }) {
  return (
    <DialogForm trigger="Add lesson" triggerSize="sm" title="Add a lesson" description="You will go straight to the lesson editor." action={action} submitLabel="Add lesson">
      <input type="hidden" name="module_id" value={moduleId} />
      <TextField label="Lesson title" name="title" required />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Kind" name="kind" options={LESSON_KINDS} defaultValue="content" />
        <TextField label="Estimated minutes" name="estimated_minutes" type="number" min={1} max={240} />
      </div>
      <CheckboxField label="Required for completion" name="required" defaultChecked />
    </DialogForm>
  );
}

export function LessonSettingsForm({ action, lesson }: {
  action: Action; lesson: { id: string; title: string; kind: string; estimated_minutes: number | null; required: boolean; pass_mark: number | null; max_attempts: number | null };
}) {
  return (
    <ActionForm action={action}>
      <input type="hidden" name="lesson_id" value={lesson.id} />
      <TextField label="Lesson title" name="title" defaultValue={lesson.title} required />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Kind" name="kind" options={LESSON_KINDS} defaultValue={lesson.kind} />
        <TextField label="Estimated minutes" name="estimated_minutes" type="number" min={1} max={240} defaultValue={lesson.estimated_minutes?.toString() ?? ""} />
      </div>
      <CheckboxField label="Required for completion" name="required" defaultChecked={lesson.required} />
      {lesson.kind === "quiz" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Pass mark override (%)" name="pass_mark" type="number" min={0} max={100} defaultValue={lesson.pass_mark?.toString() ?? ""} hint="Leave blank to use the course pass mark." />
          <TextField label="Maximum attempts" name="max_attempts" type="number" min={1} max={20} defaultValue={lesson.max_attempts?.toString() ?? ""} hint="Leave blank for unlimited." />
        </div>
      )}
      <FormActions><SubmitButton>Save lesson settings</SubmitButton></FormActions>
    </ActionForm>
  );
}

export function SubmitForReviewForm({ action, versionId, changeSummary }: { action: Action; versionId: string; changeSummary: string | null }) {
  return (
    <DialogForm trigger="Submit for review" triggerVariant="primary" title="Submit for review" submitLabel="Submit"
      description="A reviewer other than you will check the course. While it is in review it cannot be edited; you can withdraw it at any time before approval." action={action}>
      <input type="hidden" name="version_id" value={versionId} />
      <TextAreaField label="Change summary" name="change_summary" rows={3} defaultValue={changeSummary ?? ""} hint="What is new or changed. Optional for a first version." />
    </DialogForm>
  );
}
