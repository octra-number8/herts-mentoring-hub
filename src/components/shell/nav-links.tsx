"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; match?: string[] };

function isActive(path: string, item: Item, exact?: boolean) {
  const prefixes = item.match ?? [item.href];
  if (exact) return path === item.href;
  return prefixes.some((p) => path === p || path.startsWith(p + "/"));
}

export function SideNav({ items }: { items: Item[] }) {
  const path = usePathname();
  return (
    <ul className="space-y-0.5">
      {items.map((i) => {
        const active = isActive(path, i);
        return (
          <li key={i.href}>
            <Link href={i.href} aria-current={active ? "page" : undefined}
              className={cn("block rounded-md px-3 py-2 text-[15px] font-medium transition-colors",
                active ? "bg-white/12 text-white" : "text-navy-100/85 hover:bg-white/8 hover:text-white")}>
              {i.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function TopNav({ items }: { items: Item[] }) {
  const path = usePathname();
  return (
    <ul className="flex flex-wrap gap-1">
      {items.map((i) => {
        const active = i.href === "/academy" ? path === "/academy" : isActive(path, i);
        return (
          <li key={i.href}>
            <Link href={i.href} aria-current={active ? "page" : undefined}
              className={cn("block rounded-md px-3 py-2 text-[15px] font-medium",
                active ? "bg-navy-50 text-navy-900" : "text-slate-ink hover:bg-navy-50 hover:text-navy-900")}>
              {i.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Mobile menu disclosure; closes on navigation. */
export function MobileMenu({ children, label = "Menu", dark }: { children: React.ReactNode; label?: string; dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  return (
    <div className="lg:hidden">
      <button type="button" aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen((o) => !o)}
        className={cn("inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium", dark ? "text-white hover:bg-white/10" : "text-navy-900 hover:bg-navy-50")}>
        <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden><path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        {label}
      </button>
      {open && <div id="mobile-menu" className="absolute inset-x-0 top-full z-40 border-b border-line bg-white p-3 shadow-lg">{children}</div>}
    </div>
  );
}

export function MobileNavList({ items }: { items: Item[] }) {
  const path = usePathname();
  return (
    <ul className="grid gap-0.5 sm:grid-cols-2">
      {items.map((i) => (
        <li key={i.href}>
          <Link href={i.href} aria-current={isActive(path, i) ? "page" : undefined}
            className="block rounded-md px-3 py-2.5 font-medium text-navy-900 hover:bg-navy-50 aria-[current=page]:bg-navy-50">{i.label}</Link>
        </li>
      ))}
    </ul>
  );
}
