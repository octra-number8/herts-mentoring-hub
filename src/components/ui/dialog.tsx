"use client";

import { useEffect, useRef, useState } from "react";
import { buttonClass } from "./button";
import { cn } from "@/lib/utils";

/** Accessible modal built on the native <dialog> element. */
export function Dialog({ trigger, title, description, children, triggerVariant = "secondary", triggerSize = "md", wide, open: controlledOpen, onOpenChange }: {
  trigger?: React.ReactNode; title: string; description?: React.ReactNode; children: React.ReactNode | ((close: () => void) => React.ReactNode);
  triggerVariant?: "primary" | "secondary" | "subtle" | "danger" | "teal"; triggerSize?: "sm" | "md"; wide?: boolean;
  open?: boolean; onOpenChange?: (o: boolean) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [internal, setInternal] = useState(false);
  const open = controlledOpen ?? internal;
  const setOpen = (o: boolean) => (onOpenChange ? onOpenChange(o) : setInternal(o));
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const close = () => setOpen(false);
  return (
    <>
      {trigger && (
        <button type="button" className={buttonClass(triggerVariant, triggerSize)} onClick={() => setOpen(true)}>{trigger}</button>
      )}
      <dialog ref={ref} onClose={close} aria-labelledby="dialog-title"
        className={cn("m-auto w-[calc(100%-2rem)] rounded-lg border border-line bg-white p-0 text-ink shadow-xl backdrop:bg-navy-950/40", wide ? "max-w-3xl" : "max-w-lg")}>
        {open && (
          <div className="p-5 sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 id="dialog-title" className="text-lg font-semibold text-navy-900">{title}</h2>
                {description && <p className="mt-1 text-sm text-muted">{description}</p>}
              </div>
              <button type="button" onClick={close} className="rounded p-1 text-muted hover:bg-canvas hover:text-ink" aria-label="Close">
                <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              </button>
            </div>
            {typeof children === "function" ? children(close) : children}
          </div>
        )}
      </dialog>
    </>
  );
}
