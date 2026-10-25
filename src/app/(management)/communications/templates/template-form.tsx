"use client";

import Link from "next/link";
import { ActionButton } from "@/components/ui/dialog-form";
import { ActionForm, FormActions, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { deleteTemplate, saveTemplate } from "../actions";

type T = { id: string; key: string; name: string; subject: string; body_markdown: string; is_system: boolean };

export function TemplateForm({ t, placeholders }: { t?: T; placeholders: string[] }) {
  return (
    <ActionForm action={saveTemplate} className="space-y-4">
      {t && <input type="hidden" name="template_id" value={t.id} />}
      {!t && <TextField label="Key" name="key" required hint="A short identifier, e.g. lodge_mentor_update. It cannot be changed later." />}
      <TextField label="Name" name="name" defaultValue={t?.name} required />
      <TextField label="Subject" name="subject" defaultValue={t?.subject} required />
      <TextAreaField label="Message" name="body_markdown" rows={14} defaultValue={t?.body_markdown} required className="font-mono text-[14px]"
        hint={<>Markdown. {placeholders.length ? <>Placeholders: {placeholders.map((p) => <code key={p} className="mr-1 rounded bg-canvas px-1">{`{{${p}}}`}</code>)}</> : null}</>} />
      <FormActions>
        <SubmitButton>{t ? "Save template" : "Create template"}</SubmitButton>
        <Link href="/communications/templates" className={buttonClass("subtle")}>Back</Link>
      </FormActions>
    </ActionForm>
  );
}

export function DeleteTemplate({ id }: { id: string }) {
  return <ActionButton action={deleteTemplate} fields={{ template_id: id }} variant="danger" size="md" confirm="Delete this template?">Delete template</ActionButton>;
}
