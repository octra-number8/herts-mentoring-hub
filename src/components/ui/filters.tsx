import { cn } from "@/lib/utils";
import { buttonClass } from "./button";

/** GET-based filter bar: works without JavaScript and keeps filters in the URL (shareable, saveable). */
export function FilterBar({ children, action, resetHref, className }: { children: React.ReactNode; action?: string; resetHref?: string; className?: string }) {
  return (
    <form method="get" action={action} role="search" className={cn("mb-4 flex flex-wrap items-end gap-3 no-print", className)}>
      {children}
      <button type="submit" className={buttonClass("secondary", "md")}>Apply</button>
      {resetHref && <a href={resetHref} className="text-sm text-muted underline-offset-2 hover:underline">Clear</a>}
    </form>
  );
}

const control = "block rounded-md border border-line bg-white px-3 py-2 text-[15px] focus:border-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-100";

export function FilterSearch({ name = "q", defaultValue, label = "Search", placeholder }: { name?: string; defaultValue?: string; label?: string; placeholder?: string }) {
  return (
    <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-sm font-medium">
      {label}
      <input type="search" name={name} defaultValue={defaultValue} placeholder={placeholder} className={cn(control, "w-full")} />
    </label>
  );
}

export function FilterSelect({ name, label, options, defaultValue, placeholder = "All" }: { name: string; label: string; options: { value: string; label: string }[]; defaultValue?: string; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      <select name={name} defaultValue={defaultValue ?? ""} className={control}>
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function FilterDate({ name, label, defaultValue }: { name: string; label: string; defaultValue?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      <input type="date" name={name} defaultValue={defaultValue} className={control} />
    </label>
  );
}
