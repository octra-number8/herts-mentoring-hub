"use client";

import { useState } from "react";
import type { ActionState } from "@/lib/action-state";
import { Dialog } from "./dialog";
import { ActionForm, FormActions, SubmitButton } from "./form";
import { buttonClass } from "./button";

/** A button that opens a dialog containing a server-action form; closes on success. */
export function DialogForm({ trigger, title, description, action, children, submitLabel = "Save", triggerVariant = "secondary", triggerSize = "md", wide, submitVariant = "primary" }: {
  trigger: React.ReactNode; title: string; description?: React.ReactNode; action: (p: ActionState, f: FormData) => Promise<ActionState>;
  children: React.ReactNode; submitLabel?: string; triggerVariant?: "primary" | "secondary" | "subtle" | "danger" | "teal"; triggerSize?: "sm" | "md";
  wide?: boolean; submitVariant?: "primary" | "danger" | "teal";
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  return (
    <>
      <button type="button" className={buttonClass(triggerVariant, triggerSize)} onClick={() => { setDone(null); setOpen(true); }}>{trigger}</button>
      {/* The dialog closes on success, so its confirmation is announced beside the trigger. */}
      {done && <span role="status" className="ml-2 text-sm font-medium text-success-700">{done}</span>}
      <Dialog title={title} description={description} open={open} onOpenChange={setOpen} wide={wide}>
        <ActionForm action={action} onSuccess={(s) => { setOpen(false); setDone(s.message ?? "Saved."); }}>
          {children}
          <FormActions>
            <SubmitButton variant={submitVariant}>{submitLabel}</SubmitButton>
            <button type="button" className={buttonClass("subtle")} onClick={() => setOpen(false)}>Cancel</button>
          </FormActions>
        </ActionForm>
      </Dialog>
    </>
  );
}

/** A single-button form (e.g. Approve, Mark complete) with optional confirmation. */
export function ActionButton({ action, children, confirm, variant = "secondary", size = "sm", fields }: {
  action: (p: ActionState, f: FormData) => Promise<ActionState>; children: React.ReactNode; confirm?: string;
  variant?: "primary" | "secondary" | "subtle" | "danger" | "teal"; size?: "sm" | "md"; fields?: Record<string, string>;
}) {
  return (
    <ActionForm action={action} className="inline-block space-y-2">
      {fields && Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <span onClickCapture={(e) => { if (confirm && !window.confirm(confirm)) { e.preventDefault(); e.stopPropagation(); } }}>
        <SubmitButton variant={variant} size={size} pendingText="Working…">{children}</SubmitButton>
      </span>
    </ActionForm>
  );
}
