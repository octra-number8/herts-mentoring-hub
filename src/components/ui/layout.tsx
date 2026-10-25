import Link from "next/link";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions, breadcrumbs, meta }: {
  title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode;
  breadcrumbs?: { href: string; label: string }[]; meta?: React.ReactNode;
}) {
  return (
    <header className="mb-6">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2 text-sm text-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            {breadcrumbs.map((b, i) => (
              <li key={b.href} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden>/</span>}
                <Link href={b.href} className="hover:text-navy-800 hover:underline">{b.label}</Link>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-navy-900 text-balance">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-muted">{description}</p>}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end no-print">{actions}</div>}
      </div>
    </header>
  );
}

export function Panel({ title, description, actions, children, className, padded = true, id }: {
  title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode;
  className?: string; padded?: boolean; id?: string;
}) {
  return (
    <section id={id} className={cn("rounded-lg border border-line bg-surface", className)} aria-labelledby={title && id ? `${id}-title` : undefined}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-3.5">
          <div>
            {title && <h2 id={id ? `${id}-title` : undefined} className="text-[15px] font-semibold text-navy-900">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn(padded && "p-5")}>{children}</div>
    </section>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-md border border-dashed border-line bg-canvas/60 px-5 py-6">
      <p className="font-medium text-navy-900">{title}</p>
      {children && <div className="max-w-prose text-sm text-muted">{children}</div>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function DescriptionList({ items, columns = 2 }: { items: { label: string; value: React.ReactNode; wide?: boolean }[]; columns?: 1 | 2 | 3 }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-4", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-2 lg:grid-cols-3")}>
      {items.map((i) => (
        <div key={i.label} className={cn(i.wide && "sm:col-span-full")}>
          <dt className="text-[13px] font-medium text-muted">{i.label}</dt>
          <dd className="mt-0.5 text-ink">{i.value === null || i.value === undefined || i.value === "" ? <span className="text-muted">Not recorded</span> : i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Stat({ label, value, hint, href, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; href?: string; tone?: "attention" }) {
  const body = (
    <>
      <div className="text-[13px] font-medium text-muted">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", tone === "attention" ? "text-warning-800" : "text-navy-900")}>{value}</div>
      {hint && <div className="mt-0.5 text-[13px] text-muted">{hint}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-lg border border-line bg-surface px-4 py-3 hover:border-navy-600">{body}</Link>
  ) : (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">{body}</div>
  );
}

export function Tabs({ tabs, current }: { tabs: { href: string; label: string; key: string; count?: number }[]; current: string }) {
  return (
    <nav aria-label="Sections" className="mb-5 overflow-x-auto border-b border-line">
      <ul className="flex min-w-max gap-1">
        {tabs.map((t) => {
          const active = t.key === current;
          return (
            <li key={t.key}>
              <Link href={t.href} aria-current={active ? "page" : undefined}
                className={cn("inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium",
                  active ? "border-navy-800 text-navy-900" : "border-transparent text-muted hover:text-navy-800")}>
                {t.label}
                {t.count !== undefined && <span className="rounded bg-canvas px-1.5 text-xs tabular-nums text-slate-ink">{t.count}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function Alert({ tone = "info", title, children }: { tone?: "info" | "success" | "warning" | "danger"; title?: string; children?: React.ReactNode }) {
  const styles = {
    info: "border-navy-100 bg-navy-50 text-navy-900",
    success: "border-success-700/20 bg-success-50 text-success-700",
    warning: "border-warning-800/20 bg-warning-50 text-warning-800",
    danger: "border-danger-700/20 bg-danger-50 text-danger-700",
  }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-md border px-4 py-3 text-sm", styles)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn(title && "mt-0.5")}>{children}</div>}
    </div>
  );
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const text = name.replace(/^(W Bro|VW Bro|RW Bro|Bro)\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-full bg-navy-100 font-semibold text-navy-800" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {text}
    </span>
  );
}

export function Timeline({ items }: { items: { id: string; when: string; title: React.ReactNode; body?: React.ReactNode; meta?: React.ReactNode }[] }) {
  return (
    <ol className="relative space-y-5 border-l border-line pl-5">
      {items.map((i) => (
        <li key={i.id} className="relative">
          <span aria-hidden className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-teal-700" />
          <div className="text-[13px] text-muted">{i.when}</div>
          <div className="font-medium text-ink">{i.title}</div>
          {i.body && <div className="mt-0.5 text-sm text-slate-ink">{i.body}</div>}
          {i.meta && <div className="mt-1 text-[13px] text-muted">{i.meta}</div>}
        </li>
      ))}
    </ol>
  );
}
