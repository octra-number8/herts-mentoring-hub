"use client";

import { useState } from "react";
import { saveDashboardLayout, resetDashboardLayout } from "@/app/(management)/dashboard/actions";
import { ActionButton } from "@/components/ui/dialog-form";
import { Dialog } from "@/components/ui/dialog";
import { ActionForm, FormActions, SubmitButton } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";

type Panel = { key: string; title: string; shown: boolean };

/** Show, hide and reorder dashboard panels. Saved per person; nothing here changes what anyone may see. */
export function CustomiseDashboard({ panels, customised }: { panels: Panel[]; customised: boolean }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(panels);
  const move = (i: number, d: -1 | 1) => setItems((cur) => {
    const next = [...cur];
    const j = i + d;
    if (j < 0 || j >= next.length) return cur;
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  return (
    <>
      <button type="button" className={buttonClass("secondary", "sm")} onClick={() => { setItems(panels); setOpen(true); }}>Customise</button>
      <Dialog title="Customise your dashboard" description="Choose which panels to show and their order." open={open} onOpenChange={setOpen}>
        <ActionForm action={saveDashboardLayout} onSuccess={() => setOpen(false)}>
          <ol className="divide-y divide-line rounded-md border border-line">
            {items.map((p, i) => (
              <li key={p.key} className="flex items-center gap-3 px-3 py-2">
                <input type="hidden" name="order[]" value={p.key} />
                <label className="flex flex-1 items-center gap-2 text-sm">
                  <input type="checkbox" name="shown[]" value={p.key} checked={p.shown} className="h-4 w-4 accent-navy-800"
                    onChange={(e) => setItems((cur) => cur.map((x) => (x.key === p.key ? { ...x, shown: e.target.checked } : x)))} />
                  {p.title}
                </label>
                <button type="button" className={buttonClass("subtle", "sm")} onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${p.title} up`}>Up</button>
                <button type="button" className={buttonClass("subtle", "sm")} onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`Move ${p.title} down`}>Down</button>
              </li>
            ))}
          </ol>
          <FormActions>
            <SubmitButton>Save layout</SubmitButton>
            <button type="button" className={buttonClass("subtle")} onClick={() => setOpen(false)}>Cancel</button>
          </FormActions>
        </ActionForm>
        {customised && <div className="mt-3 border-t border-line pt-3"><ActionButton action={resetDashboardLayout} variant="subtle">Reset to the standard layout</ActionButton></div>}
      </Dialog>
    </>
  );
}
