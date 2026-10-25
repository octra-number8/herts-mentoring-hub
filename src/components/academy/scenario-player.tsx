"use client";

import { useEffect, useRef, useState } from "react";
import { buttonClass } from "@/components/ui/button";
import type { Scenario } from "@/server/academy/content";

type Step = { node: string; choice: string; feedback?: string };

/**
 * Branching scenario: the learner makes choices, sees feedback and the path they
 * took, and can restart. `onFinished` content (usually the completion button) is
 * shown once an ending is reached.
 */
export function ScenarioPlayer({ scenario, finished }: { scenario: Scenario; finished: React.ReactNode }) {
  const [current, setCurrent] = useState(scenario.start);
  const [path, setPath] = useState<Step[]>([]);
  const [lastFeedback, setLastFeedback] = useState<string | undefined>();
  const headingRef = useRef<HTMLParagraphElement>(null);
  const node = scenario.nodes[current];
  const ended = !node || node.choices.length === 0;

  useEffect(() => { if (path.length) headingRef.current?.focus(); }, [path.length]);

  function choose(i: number) {
    const c = node!.choices[i]!;
    setPath((p) => [...p, { node: current, choice: c.label, feedback: c.feedback }]);
    setLastFeedback(c.feedback);
    setCurrent(c.next);
  }
  function restart() {
    setPath([]);
    setLastFeedback(undefined);
    setCurrent(scenario.start);
  }

  return (
    <div className="space-y-5">
      {path.length > 0 && (
        <details className="rounded-lg border border-line bg-white px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium text-navy-800">Your path so far ({path.length} {path.length === 1 ? "choice" : "choices"})</summary>
          <ol className="mt-2 list-decimal space-y-2 pl-5">
            {path.map((s, i) => (
              <li key={i}>
                <span className="text-slate-ink">{scenario.nodes[s.node]?.text}</span>
                <span className="block font-medium text-navy-900">You chose: {s.choice}</span>
                {s.feedback && <span className="block text-muted">{s.feedback}</span>}
              </li>
            ))}
          </ol>
        </details>
      )}

      {lastFeedback && (
        <div role="status" aria-live="polite" className="rounded-lg border border-teal-100 bg-teal-50 px-4 py-3 text-[15px] text-teal-800">{lastFeedback}</div>
      )}

      <div className="rounded-xl border border-navy-100 bg-white p-5 sm:p-6">
        <p ref={headingRef} tabIndex={-1} className="text-[17px] leading-relaxed text-ink focus:outline-none">
          {node ? node.text : "This path is not available."}
        </p>
        {!ended && (
          <fieldset className="mt-5">
            <legend className="mb-2 text-sm font-medium text-muted">What would you do?</legend>
            <div className="grid gap-2">
              {node!.choices.map((c, i) => (
                <button key={i} type="button" onClick={() => choose(i)}
                  className="rounded-lg border border-line px-4 py-3 text-left text-[15px] font-medium text-navy-800 hover:border-navy-600 hover:bg-navy-50">
                  {c.label}
                </button>
              ))}
            </div>
          </fieldset>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {ended && finished}
        {path.length > 0 && <button type="button" onClick={restart} className={buttonClass("secondary")}>Start the scenario again</button>}
      </div>
    </div>
  );
}
