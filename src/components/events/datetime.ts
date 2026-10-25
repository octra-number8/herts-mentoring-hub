/** Date helpers for event forms and calendars, always in UK time. */

const PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function parts(d: Date) {
  const p = Object.fromEntries(PARTS.formatToParts(d).map((x) => [x.type, x.value]));
  return { y: p.year, m: p.month, d: p.day, h: p.hour, min: p.minute };
}

/** ISO timestamp to the value a datetime-local input expects (UK time). */
export function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const p = parts(new Date(iso));
  return `${p.y}-${p.m}-${p.d}T${p.h}:${p.min}`;
}

/** ISO timestamp to its UK calendar date (YYYY-MM-DD). */
export function ukDate(iso: string | Date): string {
  const p = parts(new Date(iso));
  return `${p.y}-${p.m}-${p.d}`;
}

/** "2026-11" for the month containing a date. */
export const monthKey = (iso: string | Date) => ukDate(iso).slice(0, 7);

/** Validate "YYYY-MM", falling back to the given default. */
export function parseMonth(v: string | undefined, fallback: string): string {
  return v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : fallback;
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthTitle(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** The Monday-start weeks covering a month, as YYYY-MM-DD strings. */
export function monthGrid(month: string): string[][] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(y, m - 1, 1 - offset));
  const weeks: string[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: string[] = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(start.getTime() + (w * 7 + d) * 86400000);
      week.push(day.toISOString().slice(0, 10));
    }
    if (w >= 4 && !week.some((d) => d.startsWith(month))) break;
    weeks.push(week);
  }
  return weeks;
}

/** UTC bounds that safely cover a month's grid (a week either side). */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, -7)).toISOString(), to: new Date(Date.UTC(y, m, 8)).toISOString() };
}
