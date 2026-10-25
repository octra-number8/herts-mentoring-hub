"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useId, useRef } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { buttonClass } from "./button";

const FormState = createContext<ActionState>(initialActionState);
const FormPending = createContext(false);

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/** A form bound to a server action, with field errors and a status message. */
export function ActionForm({ action, children, className, success, resetOnSuccess, onSuccess, id }: {
  action: Action; children: React.ReactNode; className?: string; success?: string; resetOnSuccess?: boolean;
  onSuccess?: (s: ActionState) => void; id?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  const ref = useRef<HTMLFormElement>(null);
  const seen = useRef(0);
  useEffect(() => {
    if (state.ok && state.nonce && state.nonce !== seen.current) {
      seen.current = state.nonce;
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.(state);
    }
  }, [state, resetOnSuccess, onSuccess]);
  return (
    // Submitted through a transition rather than the form's action prop: React 19 resets
    // a form after its action runs, which would clear what was typed when the server
    // returns a validation error. Successful submissions reset only if asked.
    <form ref={ref} className={cn("space-y-4", className)} id={id} noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
        const fd = new FormData(e.currentTarget, submitter);
        startTransition(() => formAction(fd));
      }}>
      <FormPending.Provider value={pending}>
      <FormState.Provider value={state}>
        {state.error && (
          <div role="alert" className="rounded-md border border-danger-700/20 bg-danger-50 px-4 py-2.5 text-sm text-danger-700">{state.error}</div>
        )}
        {state.ok && (state.message || success) && (
          <div role="status" className="rounded-md border border-success-700/20 bg-success-50 px-4 py-2.5 text-sm text-success-700">{state.message ?? success}</div>
        )}
        {children}
      </FormState.Provider>
      </FormPending.Provider>
    </form>
  );
}

export const useFormState = () => useContext(FormState);

export function Field({ label, name, hint, children, required, className }: {
  label: string; name: string; hint?: React.ReactNode; children: (p: { id: string; name: string; "aria-invalid"?: boolean; "aria-describedby"?: string; required?: boolean }) => React.ReactNode;
  required?: boolean; className?: string;
}) {
  const id = useId();
  const state = useFormState();
  const error = state.fieldErrors?.[name];
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}{required && <span className="text-danger-700" aria-hidden> *</span>}
      </label>
      {children({ id, name, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy, required })}
      {hint && <p id={`${id}-hint`} className="text-[13px] text-muted">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-[13px] font-medium text-danger-700">{error}</p>}
    </div>
  );
}

const control = "block w-full rounded-md border border-line bg-white px-3 py-2 text-[15px] text-ink placeholder:text-muted/70 focus:border-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-100 aria-[invalid=true]:border-danger-700";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; hint?: React.ReactNode; fieldClassName?: string };
export function TextField({ label, name, hint, required, fieldClassName, className, ...rest }: InputProps) {
  return (
    <Field label={label} name={name} hint={hint} required={required} className={fieldClassName}>
      {(p) => <input {...p} {...rest} className={cn(control, className)} />}
    </Field>
  );
}

type AreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; name: string; hint?: React.ReactNode; fieldClassName?: string };
export function TextAreaField({ label, name, hint, required, fieldClassName, className, rows = 4, ...rest }: AreaProps) {
  return (
    <Field label={label} name={name} hint={hint} required={required} className={fieldClassName}>
      {(p) => <textarea {...p} {...rest} rows={rows} className={cn(control, "resize-y", className)} />}
    </Field>
  );
}

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string; name: string; hint?: React.ReactNode; options: { value: string; label: string }[]; placeholder?: string; fieldClassName?: string;
};
export function SelectField({ label, name, hint, required, options, placeholder, fieldClassName, className, ...rest }: SelectProps) {
  return (
    <Field label={label} name={name} hint={hint} required={required} className={fieldClassName}>
      {(p) => (
        <select {...p} {...rest} className={cn(control, "pr-8", className)}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </Field>
  );
}

export function CheckboxField({ label, name, hint, defaultChecked, value }: { label: string; name: string; hint?: React.ReactNode; defaultChecked?: boolean; value?: string }) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <input id={id} type="checkbox" name={name} value={value} defaultChecked={defaultChecked} className="mt-1 h-4 w-4 rounded border-line accent-navy-800" />
      <label htmlFor={id} className="text-sm">
        <span className="font-medium text-ink">{label}</span>
        {hint && <span className="block text-[13px] text-muted">{hint}</span>}
      </label>
    </div>
  );
}

export function RadioGroup({ legend, name, options, defaultValue, hint }: { legend: string; name: string; options: { value: string; label: string; hint?: string }[]; defaultValue?: string; hint?: string }) {
  const state = useFormState();
  const error = state.fieldErrors?.[name];
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-ink">{legend}</legend>
      {hint && <p className="text-[13px] text-muted">{hint}</p>}
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {options.map((o) => (
          <label key={o.value} className="flex items-start gap-2 text-sm">
            <input type="radio" name={name} value={o.value} defaultChecked={defaultValue === o.value} className="mt-1 accent-navy-800" />
            <span>{o.label}{o.hint && <span className="block text-[13px] text-muted">{o.hint}</span>}</span>
          </label>
        ))}
      </div>
      {error && <p className="text-[13px] font-medium text-danger-700">{error}</p>}
    </fieldset>
  );
}

export function SubmitButton({ children, variant = "primary", size = "md", className, pendingText, name, value }: {
  children: React.ReactNode; variant?: "primary" | "secondary" | "danger" | "teal" | "subtle"; size?: "sm" | "md"; className?: string; pendingText?: string; name?: string; value?: string;
}) {
  const status = useFormStatus();
  const formPending = useContext(FormPending);
  const pending = status.pending || formPending;
  return (
    <button type="submit" name={name} value={value} disabled={pending} aria-busy={pending} className={buttonClass(variant, size, className)}>
      {pending ? pendingText ?? "Saving…" : children}
    </button>
  );
}

export function FormActions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 pt-1">{children}</div>;
}
