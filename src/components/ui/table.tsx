import Link from "next/link";
import { cn } from "@/lib/utils";

export function Table({ children, className, caption }: { children: React.ReactNode; className?: string; caption?: string }) {
  return (
    // Focusable so keyboard users can scroll wide tables on small screens (WCAG 2.1.1).
    <div className={cn("overflow-x-auto rounded-lg border border-line bg-surface", className)} tabIndex={0} role="region" aria-label={caption ?? "Table"}>
      <table className="w-full border-collapse text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}
export const THead = ({ children }: { children: React.ReactNode }) => (
  <thead className="border-b border-line bg-canvas/70 text-[13px] text-muted"><tr>{children}</tr></thead>
);
export const TH = ({ children, className, align }: { children?: React.ReactNode; className?: string; align?: "right" }) => (
  <th scope="col" className={cn("px-4 py-2.5 font-medium whitespace-nowrap", align === "right" && "text-right", className)}>{children}</th>
);
export const TBody = ({ children }: { children: React.ReactNode }) => <tbody className="divide-y divide-line">{children}</tbody>;
export const TR = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <tr className={cn("hover:bg-navy-50/50", className)}>{children}</tr>
);
export const TD = ({ children, className, align }: { children?: React.ReactNode; className?: string; align?: "right" }) => (
  <td className={cn("px-4 py-2.5 align-top", align === "right" && "text-right tabular-nums", className)}>{children}</td>
);
export const RowLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="font-medium text-navy-800 hover:underline">{children}</Link>
);

export function Pagination({ page, pageSize, total, href }: { page: number; pageSize: number; total: number; href: (p: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <p className="mt-3 text-sm text-muted">{total} {total === 1 ? "record" : "records"}</p>;
  return (
    <nav aria-label="Pagination" className="mt-3 flex items-center justify-between text-sm">
      <span className="text-muted">Page {page} of {pages} · {total} records</span>
      <span className="flex gap-2">
        {page > 1 ? <Link className="rounded-md border border-line bg-white px-3 py-1.5 hover:border-navy-600" href={href(page - 1)}>Previous</Link> : null}
        {page < pages ? <Link className="rounded-md border border-line bg-white px-3 py-1.5 hover:border-navy-600" href={href(page + 1)}>Next</Link> : null}
      </span>
    </nav>
  );
}
