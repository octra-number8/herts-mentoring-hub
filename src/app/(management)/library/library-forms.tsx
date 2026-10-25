"use client";

import { useState } from "react";
import { ActionButton, DialogForm } from "@/components/ui/dialog-form";
import { CheckboxField, Field, SelectField, TextAreaField, TextField, useFormState } from "@/components/ui/form";
import { todayIso } from "@/lib/utils";
import { archiveDocument, createDocument, setReviewDate, transitionVersion, updateDocument, uploadVersion } from "./actions";

type Opt = { value: string; label: string };
const CLASS_OPTS = [
  { value: "learning", label: "Academy learners", hint: "Approved learning material" },
  { value: "mentors", label: "Mentors", hint: "Lodge and Personal Mentors, and the Provincial team" },
  { value: "internal", label: "Provincial team" },
  { value: "leadership", label: "Leadership only" },
];

type Doc = {
  id: string; title: string; summary: string; category_id: string | null; classification: string; owner_person_id: string | null;
  requires_ack: boolean; renew_ack_on_revision: boolean; review_on: string | null;
};

function DocFields({ categories, owners, doc, classifications }: { categories: (Opt & { cls: string })[]; owners: Opt[]; doc?: Doc; classifications: string[] }) {
  const [cls, setCls] = useState(doc?.classification ?? "");
  const clsError = useFormState().fieldErrors?.classification;
  return (
    <>
      <TextField label="Title" name="title" required defaultValue={doc?.title} />
      <TextAreaField label="Summary" name="summary" rows={2} defaultValue={doc?.summary} hint="A sentence or two shown in the library list and search." />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" name="category_id" required>
          {(p) => (
            <select {...p} defaultValue={doc?.category_id ?? ""} className="block w-full rounded-md border border-line bg-white px-3 py-2 text-[15px]"
              onChange={(e) => { if (!doc) { const c = categories.find((x) => x.value === e.target.value); if (c && classifications.includes(c.cls)) setCls(c.cls); } }}>
              <option value="">Choose a category</option>
              {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          )}
        </Field>
        <SelectField label="Owner" name="owner_person_id" defaultValue={doc?.owner_person_id ?? ""} placeholder="Me" options={owners} />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Who can read it</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {CLASS_OPTS.filter((o) => classifications.includes(o.value)).map((o) => (
            <label key={o.value} className="flex items-start gap-2 text-sm">
              <input type="radio" name="classification" value={o.value} checked={cls === o.value} onChange={() => setCls(o.value)} className="mt-1 accent-navy-800" />
              <span>{o.label}{o.hint && <span className="block text-[13px] text-muted">{o.hint}</span>}</span>
            </label>
          ))}
        </div>
        {clsError && <p className="text-[13px] font-medium text-danger-700">Choose who can read it.</p>}
      </fieldset>
      <CheckboxField label="Readers must read and acknowledge it" name="requires_ack" defaultChecked={doc?.requires_ack} />
      <CheckboxField label="Ask for renewed acknowledgement when a new issue is published" name="renew_ack_on_revision" defaultChecked={doc?.renew_ack_on_revision ?? true} />
      <TextField label="Review by" name="review_on" type="date" defaultValue={doc?.review_on ?? ""} hint="The owner is reminded when the review is due." />
    </>
  );
}

export function NewDocumentForm(props: { categories: (Opt & { cls: string })[]; owners: Opt[]; classifications: string[] }) {
  return (
    <DialogForm trigger="New document" triggerVariant="primary" title="New controlled document" description="Create the record, then upload the first draft for review." action={createDocument} submitLabel="Create document" wide>
      <TextField label="Reference" name="reference" required placeholder="e.g. B3" hint="Short and unique, as used in the document itself." />
      <DocFields {...props} />
    </DialogForm>
  );
}

export function EditDocumentForm(props: { categories: (Opt & { cls: string })[]; owners: Opt[]; doc: Doc; classifications: string[] }) {
  return (
    <DialogForm trigger="Edit details" title="Document details" action={updateDocument} wide>
      <input type="hidden" name="document_id" value={props.doc.id} />
      <DocFields {...props} />
    </DialogForm>
  );
}

export function ReviewDateForm({ documentId, reviewOn }: { documentId: string; reviewOn: string | null }) {
  return (
    <DialogForm trigger="Set review date" triggerSize="sm" triggerVariant="subtle" title="Review date" action={setReviewDate}>
      <input type="hidden" name="document_id" value={documentId} />
      <TextField label="Review by" name="review_on" type="date" defaultValue={reviewOn ?? ""} min={todayIso()} hint="Leave empty to clear." />
    </DialogForm>
  );
}

export function UploadVersionForm({ documentId, versionId, trigger = "Upload new draft", primary }: { documentId: string; versionId?: string; trigger?: string; primary?: boolean }) {
  return (
    <DialogForm trigger={trigger} triggerVariant={primary ? "primary" : "secondary"} triggerSize={versionId ? "sm" : "md"} title={versionId ? "Replace the draft file" : "Upload a new draft version"}
      description="The draft is only visible to library managers until it is approved and published." action={uploadVersion} submitLabel="Upload">
      <input type="hidden" name="document_id" value={documentId} />
      {versionId && <input type="hidden" name="version_id" value={versionId} />}
      {!versionId && <TextField label="Version label" name="version_label" required placeholder="e.g. Issue 2, November 2026" />}
      <TextAreaField label="What has changed" name="change_summary" rows={2} />
      <TextField label="File" name="file" type="file" required accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.rtf,.odt" hint="PDF, Office, text or image files up to 25 MB." />
    </DialogForm>
  );
}

export function VersionAction({ documentId, versionId, to, children, variant = "secondary", confirm, back }: { documentId: string; versionId: string; to: string; children: React.ReactNode; variant?: "primary" | "secondary" | "teal" | "danger"; confirm?: string; back?: "approvals" }) {
  return <ActionButton action={transitionVersion} fields={{ document_id: documentId, version_id: versionId, to, ...(back ? { back } : {}) }} variant={variant} confirm={confirm}>{children}</ActionButton>;
}

export function ReturnVersionForm({ documentId, versionId, back }: { documentId: string; versionId: string; back?: "approvals" }) {
  return (
    <DialogForm trigger="Return" triggerSize="sm" title="Return to draft" description="Explain what needs to change. The note is kept in the approval history." action={transitionVersion} submitLabel="Return to draft">
      <input type="hidden" name="document_id" value={documentId} />
      <input type="hidden" name="version_id" value={versionId} />
      <input type="hidden" name="to" value="draft" />
      {back && <input type="hidden" name="back" value={back} />}
      <TextAreaField label="Note for the author" name="note" rows={3} required />
    </DialogForm>
  );
}

export function ApproveVersionForm({ documentId, versionId, back }: { documentId: string; versionId: string; back?: "approvals" }) {
  return (
    <DialogForm trigger="Approve" triggerSize="sm" triggerVariant="primary" title="Approve this version" action={transitionVersion} submitLabel="Approve">
      <input type="hidden" name="document_id" value={documentId} />
      <input type="hidden" name="version_id" value={versionId} />
      <input type="hidden" name="to" value="approved" />
      {back && <input type="hidden" name="back" value={back} />}
      <TextAreaField label="Approval note" name="note" rows={2} hint="Optional. Kept in the approval history." />
    </DialogForm>
  );
}

export function ArchiveDocumentButton({ documentId, archived }: { documentId: string; archived: boolean }) {
  return (
    <ActionButton action={archiveDocument} fields={{ document_id: documentId, ...(archived ? { restore: "on" } : {}) }} variant={archived ? "secondary" : "danger"} size="md"
      confirm={archived ? undefined : "Archive this document? Readers will no longer see it. Its versions and history are kept."}>
      {archived ? "Restore" : "Archive document"}
    </ActionButton>
  );
}

