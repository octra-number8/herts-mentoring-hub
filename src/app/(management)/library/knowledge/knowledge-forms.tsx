"use client";

import { useState } from "react";
import { ActionButton } from "@/components/ui/dialog-form";
import { ActionForm, CheckboxField, FormActions, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { articleTransition, createArticle, updateArticle } from "../actions";

const KINDS = [
  { value: "faq", label: "Frequently asked question" },
  { value: "guidance", label: "Guidance" },
  { value: "example", label: "Practical example" },
  { value: "good_practice", label: "Approved good practice" },
  { value: "training", label: "Training resource" },
];
const AUDIENCES = [
  { value: "learning", label: "Academy learners" },
  { value: "mentors", label: "Mentors" },
  { value: "internal", label: "Provincial team" },
];

type Article = { id: string; title: string; kind: string; audience: string; body_markdown: string; tags: string[]; anonymisation_confirmed: boolean; status: string };

export function ArticleEditor({ article }: { article?: Article }) {
  const [kind, setKind] = useState(article?.kind ?? "guidance");
  return (
    <ActionForm action={article ? updateArticle : createArticle}>
      {article && <input type="hidden" name="id" value={article.id} />}
      <TextField label="Title" name="title" required defaultValue={article?.title} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Type" name="kind" options={KINDS} defaultValue={kind} onChange={(e) => setKind(e.target.value)} />
        <SelectField label="Audience" name="audience" options={AUDIENCES} defaultValue={article?.audience ?? "internal"} hint="Learners see only learning articles; mentors see learning and mentors articles." />
      </div>
      <TextAreaField label="Content" name="body_markdown" rows={16} required defaultValue={article?.body_markdown} className="font-mono text-sm"
        hint="Markdown: ## for a heading, **bold**, - for a list, [text](https://link). Link to Solomon rather than copying it." />
      <TextField label="Tags" name="tags" defaultValue={article?.tags.join(", ")} hint="Optional, separated by commas." />
      {kind === "example" && (
        <div className="rounded-md border border-warning-800/20 bg-warning-50 p-3">
          <CheckboxField label="I confirm this example has been anonymised" name="anonymisation_confirmed" defaultChecked={article?.anonymisation_confirmed}
            hint="No names, Lodge names or numbers, dates or details that could identify a Brother or Lodge. Examples cannot be published without this." />
        </div>
      )}
      {article?.status === "published" && <p className="text-sm text-muted">This article is published. Saving changes returns it to draft for approval unless you are an approver.</p>}
      <FormActions><SubmitButton>{article ? "Save changes" : "Save draft"}</SubmitButton></FormActions>
    </ActionForm>
  );
}

export function ArticleAction({ id, slug, to, children, variant = "secondary", confirm, back }: { id: string; slug: string; to: string; children: React.ReactNode; variant?: "primary" | "secondary" | "teal" | "danger"; confirm?: string; back?: "approvals" }) {
  return <ActionButton action={articleTransition} fields={{ id, slug, to, ...(back ? { back } : {}) }} variant={variant} size="md" confirm={confirm}>{children}</ActionButton>;
}
