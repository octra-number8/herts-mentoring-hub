"use client";

import { createContext, useContext, useId } from "react";
import { useFormState } from "@/components/ui/form";

export type AccountOption = { id: string; label: string; detail?: string };

const Accounts = createContext<AccountOption[] | null>(null);

/** Supplies the Provincial accounts that assignment fields offer (loaded once per page). */
export function AccountsProvider({ accounts, children }: { accounts: AccountOption[]; children: React.ReactNode }) {
  return <Accounts.Provider value={accounts}>{children}</Accounts.Provider>;
}

/**
 * Choose an active Provincial account (owner, escalation, mention). Same props as
 * AccountSelect, but the options come from the page via AccountsProvider.
 */
export function AssigneeSelect({ name, label, defaultValue, required, hint, allowNone = true, noneLabel = "Unassigned" }: {
  name: string; label: string; defaultValue?: string | null; required?: boolean; hint?: string; allowNone?: boolean; noneLabel?: string;
}) {
  const id = useId();
  const options = useContext(Accounts) ?? [];
  const error = useFormState().fieldErrors?.[name];
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">{label}{required && <span className="text-danger-700" aria-hidden> *</span>}</label>
      <select id={id} name={name} defaultValue={defaultValue ?? ""} aria-invalid={error ? true : undefined} aria-required={required || undefined}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="block w-full rounded-md border border-line bg-white px-3 py-2 text-[15px] focus:border-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-100">
        {(allowNone || !defaultValue) && <option value="">{required ? "Choose a person" : noneLabel}</option>}
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}{o.detail ? ` (${o.detail})` : ""}</option>)}
      </select>
      {hint && <p id={`${id}-hint`} className="text-[13px] text-muted">{hint}</p>}
      {error && <p className="text-[13px] font-medium text-danger-700">{error}</p>}
    </div>
  );
}
