"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useFormState } from "./form";

type Option = { id: string; label: string; detail?: string };

/** Searchable person picker (combobox). Submits the chosen id under `name`. */
export function PersonPicker({ name, label, hint, required, lodgeId, defaultValue, endpoint = "/api/lookup/people" }: {
  name: string; label: string; hint?: string; required?: boolean; lodgeId?: string; defaultValue?: Option | null; endpoint?: string;
}) {
  const id = useId();
  const [query, setQuery] = useState(defaultValue?.label ?? "");
  const [selected, setSelected] = useState<Option | null>(defaultValue ?? null);
  const [options, setOptions] = useState<Option[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(0);
  const error = useFormState().fieldErrors?.[name];

  useEffect(() => {
    if (selected && query === selected.label) return;
    clearTimeout(timer.current);
    if (query.trim().length < 2 && !lodgeId) return;
    const requestId = ++latest.current;
    timer.current = setTimeout(async () => {
      const params = new URLSearchParams({ q: query });
      if (lodgeId) params.set("lodge", lodgeId);
      const res = await fetch(`${endpoint}?${params}`).catch(() => null);
      // Ignore responses that arrive after a newer search has started.
      if (res?.ok && requestId === latest.current) { setOptions(await res.json()); setOpen(true); setActive(0); }
    }, 200);
  }, [query, lodgeId, endpoint, selected]);

  const choose = (o: Option) => { setSelected(o); setQuery(o.label); setOpen(false); };
  return (
    <div className="relative space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">{label}{required && <span className="text-danger-700" aria-hidden> *</span>}</label>
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      <input id={id} role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list" autoComplete="off"
        aria-activedescendant={open && options[active] ? `${id}-opt-${active}` : undefined} aria-invalid={error ? true : undefined}
        value={query} placeholder="Type a name or membership number"
        onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
        onFocus={() => options.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, options.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === "Enter" && options[active]) { e.preventDefault(); choose(options[active]); }
          if (e.key === "Escape") setOpen(false);
        }}
        className="block w-full rounded-md border border-line bg-white px-3 py-2 text-[15px] focus:border-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-100 aria-[invalid=true]:border-danger-700" />
      {open && (
        <ul id={`${id}-list`} role="listbox" className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-line bg-white py-1 shadow-lg">
          {options.length === 0 && <li className="px-3 py-2 text-sm text-muted">No matches</li>}
          {options.map((o, i) => (
            <li key={o.id} id={`${id}-opt-${i}`} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); choose(o); }}
              className={cn("cursor-pointer px-3 py-2 text-sm", i === active && "bg-navy-50")}>
              <span className="font-medium">{o.label}</span>{o.detail && <span className="block text-[13px] text-muted">{o.detail}</span>}
            </li>
          ))}
        </ul>
      )}
      {hint && <p className="text-[13px] text-muted">{hint}</p>}
      {error && <p className="text-[13px] font-medium text-danger-700">{error}</p>}
    </div>
  );
}

/** Select from active Provincial accounts (loaded once). */
export function AccountSelect({ name, label, role, defaultValue, required, hint, allowNone = true }: {
  name: string; label: string; role?: string; defaultValue?: string | null; required?: boolean; hint?: string; allowNone?: boolean;
}) {
  const id = useId();
  const [options, setOptions] = useState<Option[] | null>(null);
  const error = useFormState().fieldErrors?.[name];
  useEffect(() => {
    fetch(`/api/lookup/accounts${role ? `?role=${role}` : ""}`).then((r) => r.json()).then(setOptions).catch(() => setOptions([]));
  }, [role]);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">{label}{required && <span className="text-danger-700" aria-hidden> *</span>}</label>
      <select id={id} name={name} defaultValue={defaultValue ?? ""} key={options ? "loaded" : "loading"} aria-invalid={error ? true : undefined}
        className="block w-full rounded-md border border-line bg-white px-3 py-2 text-[15px] focus:border-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-100">
        {allowNone && <option value="">{options ? "Unassigned" : "Loading…"}</option>}
        {options?.map((o) => <option key={o.id} value={o.id}>{o.label}{o.detail ? ` (${o.detail})` : ""}</option>)}
      </select>
      {hint && <p className="text-[13px] text-muted">{hint}</p>}
      {error && <p className="text-[13px] font-medium text-danger-700">{error}</p>}
    </div>
  );
}
