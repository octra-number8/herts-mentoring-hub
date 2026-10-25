"use client";

import { useId, useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ActionForm, FormActions, SubmitButton } from "@/components/ui/form";
import type { ActionState } from "@/lib/action-state";
import { cn } from "@/lib/utils";

type Action = (p: ActionState, f: FormData) => Promise<ActionState>;
export type EditableQuestion = {
  id?: string; kind: "single" | "multiple" | "true_false"; prompt: string; options: { id: string; text: string }[];
  correct: string[]; feedback_correct: string; feedback_incorrect: string; explanation: string;
};

const control = "block w-full rounded-md border border-line bg-white px-3 py-2 text-[15px] text-ink focus:border-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-100";
const LETTERS = "abcdefgh";
const TF = [{ id: "t", text: "True" }, { id: "f", text: "False" }];

function Text({ label, value, onChange, area, hint }: { label: string; value: string; onChange: (v: string) => void; area?: boolean; hint?: string }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-ink">{label}</label>
      {area ? <textarea id={id} rows={2} className={control} value={value} onChange={(e) => onChange(e.target.value)} />
        : <input id={id} className={control} value={value} onChange={(e) => onChange(e.target.value)} />}
      {hint && <p className="text-[13px] text-muted">{hint}</p>}
    </div>
  );
}

/** Question and answer key editor. Keys are stored separately and never shown to learners. */
export function QuestionEditor({ action, lessonId, question, trigger }: { action: Action; lessonId: string; question?: EditableQuestion; trigger: string }) {
  const [open, setOpen] = useState(false);
  const blank: EditableQuestion = { kind: "single", prompt: "", options: [{ id: "a", text: "" }, { id: "b", text: "" }], correct: [], feedback_correct: "", feedback_incorrect: "", explanation: "" };
  const [q, setQ] = useState<EditableQuestion>(question ?? blank);
  const kindId = useId();

  function setKind(kind: EditableQuestion["kind"]) {
    if (kind === "true_false") setQ({ ...q, kind, options: TF, correct: q.correct.filter((c) => c === "t" || c === "f").slice(0, 1) });
    else setQ({ ...q, kind, options: q.kind === "true_false" ? blank.options : q.options, correct: kind === "single" ? q.correct.slice(0, 1) : q.correct });
  }
  function toggle(id: string) {
    if (q.kind === "multiple") setQ({ ...q, correct: q.correct.includes(id) ? q.correct.filter((c) => c !== id) : [...q.correct, id] });
    else setQ({ ...q, correct: [id] });
  }
  function addOption() {
    const id = LETTERS.split("").find((l) => !q.options.some((o) => o.id === l));
    if (id) setQ({ ...q, options: [...q.options, { id, text: "" }] });
  }
  const payload = JSON.stringify({ kind: q.kind, prompt: q.prompt, options: q.options, correct: q.correct, feedback_correct: q.feedback_correct, feedback_incorrect: q.feedback_incorrect, explanation: q.explanation });

  return (
    <>
      <button type="button" className={buttonClass(question ? "subtle" : "secondary", "sm")} onClick={() => { setQ(question ?? blank); setOpen(true); }}>{trigger}</button>
      <Dialog title={question ? "Edit question" : "Add a question"} open={open} onOpenChange={setOpen} wide>
        <ActionForm action={action} onSuccess={() => setOpen(false)}>
          <input type="hidden" name="lesson_id" value={lessonId} />
          {question?.id && <input type="hidden" name="question_id" value={question.id} />}
          <input type="hidden" name="payload" value={payload} />
          <div className="space-y-1">
            <label htmlFor={kindId} className="block text-sm font-medium text-ink">Question type</label>
            <select id={kindId} className={cn(control, "w-64")} value={q.kind} onChange={(e) => setKind(e.target.value as EditableQuestion["kind"])}>
              <option value="single">Single answer</option><option value="multiple">Multiple answers</option><option value="true_false">True or false</option>
            </select>
          </div>
          <Text label="Question" value={q.prompt} onChange={(v) => setQ({ ...q, prompt: v })} area />
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-ink">Options <span className="font-normal text-muted">(tick the correct {q.kind === "multiple" ? "answers" : "answer"})</span></legend>
            {q.options.map((o, i) => (
              <div key={o.id} className="flex items-center gap-2">
                <input type={q.kind === "multiple" ? "checkbox" : "radio"} name="correct-choice" checked={q.correct.includes(o.id)} onChange={() => toggle(o.id)}
                  aria-label={`Option ${i + 1} is correct`} className="h-4 w-4 accent-navy-800" />
                {q.kind === "true_false" ? <span className="text-[15px]">{o.text}</span> : (
                  <input aria-label={`Option ${i + 1}`} className={control} value={o.text} onChange={(e) => setQ({ ...q, options: q.options.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)) })} />
                )}
                {q.kind !== "true_false" && q.options.length > 2 && (
                  <button type="button" className={buttonClass("subtle", "sm")} onClick={() => setQ({ ...q, options: q.options.filter((x) => x.id !== o.id), correct: q.correct.filter((c) => c !== o.id) })}>Remove<span className="sr-only"> option {i + 1}</span></button>
                )}
              </div>
            ))}
            {q.kind !== "true_false" && q.options.length < 8 && <button type="button" className={buttonClass("secondary", "sm")} onClick={addOption}>Add option</button>}
          </fieldset>
          <Text label="Feedback when correct" value={q.feedback_correct} onChange={(v) => setQ({ ...q, feedback_correct: v })} />
          <Text label="Feedback when not correct" value={q.feedback_incorrect} onChange={(v) => setQ({ ...q, feedback_incorrect: v })} hint="Kind and helpful: explain, don't judge." />
          <Text label="Explanation (optional)" value={q.explanation} onChange={(v) => setQ({ ...q, explanation: v })} area />
          <FormActions>
            <SubmitButton>Save question</SubmitButton>
            <button type="button" className={buttonClass("subtle")} onClick={() => setOpen(false)}>Cancel</button>
          </FormActions>
        </ActionForm>
      </Dialog>
    </>
  );
}
