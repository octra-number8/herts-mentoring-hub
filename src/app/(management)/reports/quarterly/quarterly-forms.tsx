"use client";

import { ActionButton, DialogForm } from "@/components/ui/dialog-form";
import { ActionForm, FormActions, SelectField, SubmitButton, TextAreaField } from "@/components/ui/form";
import { generateQuarterly, regenerateQuarterly, saveNarrative, transitionQuarterly } from "../actions";

export function GenerateQuarterlyForm({ defaultYear, defaultQuarter, years }: { defaultYear: number; defaultQuarter: number; years: number[] }) {
  return (
    <DialogForm trigger="Generate report" triggerVariant="primary" title="Generate a quarterly report" description="Takes a snapshot of the figures for the quarter. While the report is in draft or review you can refresh the figures; once approved it is fixed." action={generateQuarterly} submitLabel="Generate">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Year" name="year" defaultValue={String(defaultYear)} options={years.map((y) => ({ value: String(y), label: String(y) }))} />
        <SelectField label="Quarter" name="quarter" defaultValue={String(defaultQuarter)} options={[1, 2, 3, 4].map((q) => ({ value: String(q), label: `Quarter ${q} (${["January to March", "April to June", "July to September", "October to December"][q - 1]})` }))} />
      </div>
    </DialogForm>
  );
}

export function RegenerateButton({ id, year, quarter }: { id: string; year: number; quarter: number }) {
  return <ActionButton action={regenerateQuarterly} fields={{ id, year: String(year), quarter: String(quarter) }} size="md" confirm="Refresh the figures from the current records? The narrative is kept, but you may need to update it.">Refresh figures</ActionButton>;
}

export function TransitionButton({ id, to, children, variant = "secondary", confirm }: { id: string; to: string; children: React.ReactNode; variant?: "primary" | "secondary" | "teal"; confirm?: string }) {
  return <ActionButton action={transitionQuarterly} fields={{ id, to }} size="md" variant={variant} confirm={confirm}>{children}</ActionButton>;
}

export function NarrativeForm({ id, sections, values, suggestions }: {
  id: string; sections: { key: string; label: string }[]; values: Record<string, string>; suggestions: Record<string, string>;
}) {
  return (
    <ActionForm action={saveNarrative}>
      <input type="hidden" name="id" value={id} />
      <p className="text-sm text-muted">Empty sections are filled with a suggested, factual draft from the figures. Edit freely: nothing is final until the report is approved.</p>
      {sections.map((s) => (
        <TextAreaField key={s.key} label={s.label} name={s.key} rows={s.key === "observations" ? 5 : 4}
          defaultValue={values[s.key] || suggestions[s.key] || ""}
          hint={!values[s.key] && suggestions[s.key] ? "Suggested draft, not yet saved." : s.key === "observations" ? "Leadership observations and points for attention." : undefined} />
      ))}
      <FormActions><SubmitButton>Save narrative</SubmitButton></FormActions>
    </ActionForm>
  );
}
