"use client";

import { useState } from "react";
import { ActionButton } from "@/components/ui/dialog-form";
import { ActionForm, FormActions, RadioGroup, SelectField, SubmitButton, TextField } from "@/components/ui/form";
import { PersonPicker } from "@/components/ui/pickers";
import type { ActionState } from "@/lib/action-state";

type Action = (p: ActionState, f: FormData) => Promise<ActionState>;

const SOURCES = [
  { value: "hermes", label: "Hermes" }, { value: "adelphi", label: "Adelphi" },
  { value: "portal", label: "UGLE Portal" }, { value: "other", label: "Other report" },
];

export function UploadForm({ action, templates }: { action: Action; templates: { id: string; name: string }[] }) {
  return (
    <ActionForm action={action}>
      <div className="space-y-1.5">
        <label htmlFor="import-file" className="block text-sm font-medium">Report file <span className="text-danger-700" aria-hidden>*</span></label>
        <input id="import-file" name="file" type="file" required accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="block w-full rounded-md border border-line bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-navy-50 file:px-3 file:py-1 file:text-navy-800" aria-describedby="import-file-hint" />
        <p id="import-file-hint" className="text-[13px] text-muted">CSV or Excel (.xlsx), up to 20 MB. The first worksheet is read.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Source" name="source" options={SOURCES} defaultValue="hermes" required />
        <SelectField label="Report format" name="template_id" placeholder="Identify automatically" options={templates.map((t) => ({ value: t.id, label: t.name }))}
          hint="Leave blank to match a saved template by its columns, or map the columns yourself." />
      </div>
      <RadioGroup legend="What does this report cover?" name="report_scope" defaultValue="partial" options={[
        { value: "partial", label: "Part of the membership", hint: "For example one Lodge or recent changes. Members missing from it are noted only." },
        { value: "full", label: "The full membership of the Lodges in it", hint: "Members missing from it can be sent to the Assistant to check. Status never changes automatically." },
      ]} />
      <FormActions><SubmitButton pendingText="Reading the file…">Upload and check</SubmitButton></FormActions>
    </ActionForm>
  );
}

export function MappingForm({ action, batchId, headers, samples, suggested, fields, source }: {
  action: Action; batchId: string; headers: string[]; samples: Record<string, string>[]; suggested: Record<string, string>;
  fields: { key: string; label: string; required?: boolean }[]; source: string;
}) {
  const options = fields.map((f) => ({ value: f.key, label: `${f.label}${f.required ? " (required)" : ""}` }));
  return (
    <ActionForm action={action}>
      <input type="hidden" name="batch_id" value={batchId} />
      <input type="hidden" name="source" value={source} />
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Column mapping</caption>
          <thead className="border-b border-line bg-canvas/70 text-[13px] text-muted">
            <tr><th scope="col" className="px-4 py-2.5 font-medium">Column in the file</th><th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Example values</th><th scope="col" className="px-4 py-2.5 font-medium">Hub field</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {headers.map((h, i) => (
              <tr key={h}>
                <td className="px-4 py-2.5 align-top font-medium">{h}</td>
                <td className="hidden px-4 py-2.5 align-top text-[13px] text-muted md:table-cell">{samples.map((s) => s[h]).filter(Boolean).slice(0, 3).join(" · ") || "Empty"}</td>
                <td className="px-4 py-2 align-top">
                  <SelectField label={`Hub field for ${h}`} name={`map_${i}`} options={options} placeholder="Do not import" defaultValue={suggested[h] ?? ""}
                    fieldClassName="[&>label]:sr-only" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TextField label="Save as a template (optional)" name="save_as" placeholder="e.g. Hermes membership report" hint="Next time a report with the same columns is identified automatically." />
      <FormActions><SubmitButton pendingText="Checking rows…">Check rows</SubmitButton></FormActions>
    </ActionForm>
  );
}

const DECISION_LABELS: Record<string, string> = { accept: "Accept", skip: "Skip", merge: "Merge into an existing record", create_new: "Create a new record" };

export function RowDecision({ action, batchId, rowId, allowed, current, candidates, editable }: {
  action: Action; batchId: string; rowId: string; allowed: string[]; current: string; candidates: { id: string; label: string }[]; editable: boolean;
}) {
  const [choice, setChoice] = useState(current === "pending" ? allowed[0] : current);
  if (!editable) return <span className="text-sm">{current === "pending" ? "Pending" : DECISION_LABELS[current]}</span>;
  return (
    <ActionForm action={action} className="space-y-2">
      <input type="hidden" name="batch_id" value={batchId} />
      <input type="hidden" name="row_id" value={rowId} />
      <SelectField label="Decision" name="decision" options={allowed.map((a) => ({ value: a, label: DECISION_LABELS[a] }))} value={choice}
        onChange={(e) => setChoice(e.target.value)} fieldClassName="[&>label]:sr-only min-w-44" className="py-1.5 text-sm" />
      {choice === "merge" && (candidates.length ? (
        <SelectField label="Existing record" name="person_id" options={candidates.map((c) => ({ value: c.id, label: c.label }))} className="py-1.5 text-sm" />
      ) : (
        <PersonPicker name="person_id" label="Existing record" hint="Search by name or membership number." />
      ))}
      <SubmitButton size="sm" variant={current === "pending" ? "primary" : "secondary"}>{current === "pending" ? "Decide" : "Change"}</SubmitButton>
    </ActionForm>
  );
}

export function BulkDecision({ action, batchId, outcome, options }: { action: Action; batchId: string; outcome: string; options: { decision: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <ActionButton key={o.decision} action={action} fields={{ batch_id: batchId, outcome, decision: o.decision }} variant="secondary" confirm={`${o.label}?`}>{o.label}</ActionButton>
      ))}
    </div>
  );
}
