"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass } from "@/components/ui/button";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { cn } from "@/lib/utils";

export type QuizQuestion = { id: string; kind: string; prompt: string; options: { id: string; text: string }[] };
export type QuizOutcome = {
  score: number; passed: boolean; pass_mark: number; attempt_no: number; attempts_remaining: number | null; enrolment_status: string;
  results: { question_id: string; correct: boolean; feedback: string | null; explanation: string | null }[];
};

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} aria-busy={pending} className={buttonClass("primary")}>{pending ? "Checking…" : children}</button>;
}

/**
 * Knowledge check. Answers are scored in the database; this component never
 * sees answer keys. Feedback per question is shown after each submission.
 */
export function QuizPlayer({ action, hidden, questions, passMark, maxAttempts, attemptsUsed, alreadyPassed, nextHref, courseHref, preview }: {
  action: (p: ActionState, f: FormData) => Promise<ActionState>;
  hidden: Record<string, string>;
  questions: QuizQuestion[]; passMark: number; maxAttempts: number | null; attemptsUsed: number; alreadyPassed: boolean;
  nextHref?: string; courseHref: string; preview?: boolean;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  const [retakeNonce, setRetakeNonce] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const outcome = state.ok && state.nonce !== retakeNonce ? (state.data as QuizOutcome | undefined) : undefined;
  const byQuestion = new Map(outcome?.results.map((r) => [r.question_id, r]) ?? []);
  const used = outcome ? outcome.attempt_no : attemptsUsed;
  const remaining = maxAttempts === null ? null : Math.max(0, maxAttempts - used);
  const locked = !!outcome || alreadyPassed;

  if (!questions.length) return <p className="text-sm text-muted">This knowledge check has no questions yet.</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-lg bg-canvas px-4 py-3 text-sm text-slate-ink">
        <span>Pass mark: <strong>{passMark}%</strong></span>
        <span>{questions.length} {questions.length === 1 ? "question" : "questions"}</span>
        {maxAttempts !== null ? <span>Attempts remaining: <strong>{remaining}</strong> of {maxAttempts}</span> : <span>You can try as many times as you need</span>}
      </div>

      {alreadyPassed && !outcome && (
        <div role="status" className="rounded-md border border-success-700/20 bg-success-50 px-4 py-3 text-sm text-success-700">You have already passed this knowledge check. Well done.</div>
      )}

      {outcome && (
        <div role="status" aria-live="polite" className={cn("rounded-lg border px-4 py-3", outcome.passed ? "border-success-700/20 bg-success-50 text-success-700" : "border-warning-800/20 bg-warning-50 text-warning-800")}>
          <p className="font-semibold">{outcome.passed ? `Passed with ${outcome.score}%` : `You scored ${outcome.score}%. The pass mark is ${outcome.pass_mark}%.`}</p>
          <p className="mt-0.5 text-sm">
            {outcome.passed
              ? outcome.enrolment_status === "completed" ? "That completes the course." : "Take a look at the feedback below, then carry on when you are ready."
              : outcome.attempts_remaining === 0 ? "You have used all your attempts. The Academy team will be glad to help: please get in touch."
              : "Read the feedback below and try again when you are ready."}
          </p>
        </div>
      )}

      {state.error && !outcome && <div role="alert" className="rounded-md border border-danger-700/20 bg-danger-50 px-4 py-2.5 text-sm text-danger-700">{state.error}</div>}

      <form ref={formRef} action={formAction} key={retakeNonce} className="space-y-5" noValidate>
        {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <ol className="space-y-5">
          {questions.map((q, n) => {
            const r = byQuestion.get(q.id);
            const multiple = q.kind === "multiple";
            return (
              <li key={q.id}>
                <fieldset className={cn("rounded-xl border bg-white p-4 sm:p-5", r ? (r.correct ? "border-success-700/40" : "border-warning-800/40") : "border-line")} disabled={locked}>
                  <legend className="sr-only">Question {n + 1}</legend>
                  <p className="font-medium text-navy-900"><span className="text-muted">{n + 1}. </span>{q.prompt}</p>
                  {multiple && <p className="mt-0.5 text-[13px] text-muted">Choose all that apply.</p>}
                  <div className="mt-3 space-y-2">
                    {q.options.map((o) => (
                      <label key={o.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line px-3 py-2.5 has-[:checked]:border-navy-600 has-[:checked]:bg-navy-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-teal-600">
                        <input type={multiple ? "checkbox" : "radio"} name={`a_${q.id}[]`} value={o.id} className="mt-1 h-4 w-4 accent-navy-800" />
                        <span>{o.text}</span>
                      </label>
                    ))}
                  </div>
                  {r && (
                    <div className="mt-3 text-sm">
                      <p className={cn("font-semibold", r.correct ? "text-success-700" : "text-warning-800")}>{r.correct ? "Correct" : "Not quite"}</p>
                      {r.feedback && <p className="text-slate-ink">{r.feedback}</p>}
                      {r.explanation && <p className="mt-1 text-muted">{r.explanation}</p>}
                    </div>
                  )}
                </fieldset>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap items-center gap-3">
          {!locked && (remaining === null || remaining > 0) && <Submit>{preview ? "Check answers (preview)" : "Submit answers"}</Submit>}
          {outcome && !outcome.passed && (outcome.attempts_remaining === null || outcome.attempts_remaining > 0) && (
            <button type="button" className={buttonClass("primary")} onClick={() => setRetakeNonce(state.nonce ?? 0)}>Try again</button>
          )}
          {(outcome?.passed || alreadyPassed) && (
            outcome?.enrolment_status === "completed" ? <Link href={`${courseHref}?completed=1`} className={buttonClass("teal")}>See your achievement</Link>
            : nextHref ? <Link href={nextHref} className={buttonClass("teal")}>Next lesson</Link>
            : <Link href={courseHref} className={buttonClass("secondary")}>Back to the course</Link>
          )}
          {!locked && remaining === 0 && <p className="text-sm text-muted">No attempts remaining. Please contact the Academy team.</p>}
        </div>
      </form>
    </div>
  );
}
