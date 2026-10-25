import Link from "next/link";
import { cn } from "@/lib/utils";
import { monthGrid, monthTitle, shiftMonth } from "./datetime";

export type CalendarItem = {
  id: string;
  date: string; // YYYY-MM-DD (UK)
  time?: string;
  title: string;
  href?: string;
  tag: string; // short type label, shown as text so meaning never relies on colour
  tone?: "navy" | "teal" | "neutral" | "warning";
  muted?: boolean;
};

const TONES = {
  navy: "border-l-navy-800 bg-navy-50",
  teal: "border-l-teal-700 bg-teal-50",
  neutral: "border-l-slate-ink bg-canvas",
  warning: "border-l-warning-800 bg-warning-50",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Month grid on wider screens; on phones it collapses to a list of the days
 * that have something on, so nothing is squeezed into tiny cells.
 */
export function MonthCalendar({ month, items, hrefFor, today }: { month: string; items: CalendarItem[]; hrefFor: (month: string) => string; today: string }) {
  const weeks = monthGrid(month);
  const byDay = new Map<string, CalendarItem[]>();
  for (const i of items) byDay.set(i.date, [...(byDay.get(i.date) ?? []), i]);
  const daysWithItems = [...byDay.keys()].filter((d) => d.startsWith(month)).sort();

  return (
    <section aria-label={monthTitle(month)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-navy-900">{monthTitle(month)}</h2>
        <nav aria-label="Change month" className="flex gap-2 text-sm">
          <Link href={hrefFor(shiftMonth(month, -1))} className="rounded-md border border-line bg-white px-3 py-1.5 hover:border-navy-600">Previous</Link>
          <Link href={hrefFor(today.slice(0, 7))} className="rounded-md border border-line bg-white px-3 py-1.5 hover:border-navy-600">This month</Link>
          <Link href={hrefFor(shiftMonth(month, 1))} className="rounded-md border border-line bg-white px-3 py-1.5 hover:border-navy-600">Next</Link>
        </nav>
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-line bg-surface md:block">
        <table className="w-full table-fixed border-collapse text-sm">
          <caption className="sr-only">{monthTitle(month)}</caption>
          <thead className="bg-canvas/70 text-[13px] text-muted">
            <tr>{WEEKDAYS.map((d) => <th key={d} scope="col" className="px-2 py-2 text-left font-medium">{d}</th>)}</tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week[0]} className="border-t border-line">
                {week.map((day) => {
                  const inMonth = day.startsWith(month);
                  const list = byDay.get(day) ?? [];
                  return (
                    <td key={day} className={cn("h-28 border-l border-line p-1.5 align-top first:border-l-0", !inMonth && "bg-canvas/50")}>
                      <div className={cn("mb-1 text-[13px] tabular-nums", day === today ? "inline-flex h-6 w-6 items-center justify-center rounded-full bg-navy-800 font-semibold text-white" : inMonth ? "text-slate-ink" : "text-muted/70")}>
                        {Number(day.slice(8))}
                        {day === today && <span className="sr-only"> (today)</span>}
                      </div>
                      <ul className="space-y-1">
                        {list.slice(0, 4).map((i) => <li key={i.id}><Entry item={i} compact /></li>)}
                        {list.length > 4 && <li className="text-[12px] text-muted">+{list.length - 4} more</li>}
                      </ul>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden">
        {daysWithItems.length === 0 ? (
          <p className="rounded-md border border-dashed border-line bg-canvas/60 px-4 py-5 text-sm text-muted">Nothing this month.</p>
        ) : (
          <ol className="space-y-4">
            {daysWithItems.map((day) => (
              <li key={day}>
                <h3 className="mb-1.5 text-sm font-semibold text-navy-900">
                  {new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
                </h3>
                <ul className="space-y-1.5">{byDay.get(day)!.map((i) => <li key={i.id}><Entry item={i} /></li>)}</ul>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function Entry({ item, compact }: { item: CalendarItem; compact?: boolean }) {
  const body = (
    <>
      <span className={cn("block truncate font-medium text-ink", item.muted && "line-through decoration-muted")}>{item.time ? `${item.time} ` : ""}{item.title}</span>
      <span className="block truncate text-[12px] text-muted">{item.tag}</span>
    </>
  );
  const cls = cn("block rounded border-l-[3px] px-1.5 py-1", TONES[item.tone ?? "navy"], compact ? "text-[12px] leading-tight" : "text-sm");
  return item.href ? <Link href={item.href} className={cn(cls, "hover:underline")} title={item.title}>{body}</Link> : <div className={cls} title={item.title}>{body}</div>;
}
