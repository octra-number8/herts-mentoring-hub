/**
 * iCalendar (RFC 5545) generation for single-event downloads and subscription
 * feeds. Pure functions: no database access, so they are unit-tested directly.
 */

export type IcsEvent = {
  id: string;
  title: string;
  description?: string | null;
  starts_at: string;
  ends_at: string;
  location?: string | null;
  status?: string | null;
  url?: string | null;
  updated_at?: string | null;
};

/** 20261026T190000Z */
export function icsDate(d: string | Date): string {
  return new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escape text values (backslash, semicolon, comma, newline). */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Fold lines longer than 75 octets, as the standard requires. */
export function icsFold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, "utf8");
    const limit = parts.length === 0 ? 75 : 74;
    if (size + n > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const STATUS: Record<string, string> = { cancelled: "CANCELLED", draft: "TENTATIVE" };

export function buildIcs(events: IcsEvent[], opts: { calendarName?: string; now?: Date } = {}): string {
  const stamp = icsDate(opts.now ?? new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hertfordshire Mentoring Hub//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  if (opts.calendarName) lines.push(`X-WR-CALNAME:${icsEscape(opts.calendarName)}`);
  lines.push("X-WR-TIMEZONE:Europe/London");
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@mentoring-hub`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(e.starts_at)}`,
      `DTEND:${icsDate(e.ends_at)}`,
      `SUMMARY:${icsEscape((e.status === "cancelled" ? "Cancelled: " : "") + e.title)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
    if (e.location) lines.push(`LOCATION:${icsEscape(e.location)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    if (e.updated_at) lines.push(`LAST-MODIFIED:${icsDate(e.updated_at)}`);
    lines.push(`STATUS:${STATUS[e.status ?? ""] ?? "CONFIRMED"}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}

/** A safe file name for a download. */
export function icsFileName(title: string): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return `${base || "event"}.ics`;
}
