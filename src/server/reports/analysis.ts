/**
 * Pure reporting helpers (no database access, no "server-only" import) so they
 * can be unit tested. Every function here is deterministic given its inputs.
 */

export type Row = Record<string, unknown>;

/** Whole months between two ISO dates (b after a). Partial months are not counted. */
export function monthsDiff(a: string, b: string): number {
  const x = new Date(a + (a.length === 10 ? "T00:00:00Z" : "")), y = new Date(b + (b.length === 10 ? "T00:00:00Z" : ""));
  return (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + (y.getUTCMonth() - x.getUTCMonth()) - (y.getUTCDate() < x.getUTCDate() ? 1 : 0);
}

/** ISO date `months` after the given ISO date. */
export function addMonths(iso: string, months: number): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

/** "2026 Q3" for an ISO date. */
export function quarterLabel(iso: string): string {
  const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7));
  return `${y} Q${Math.floor((m - 1) / 3) + 1}`;
}

export function quarterRange(year: number, quarter: number): { start: string; end: string } {
  const start = new Date(Date.UTC(year, (quarter - 1) * 3, 1));
  const end = new Date(Date.UTC(year, quarter * 3, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/** The most recently completed quarter relative to `today`. */
export function previousQuarter(today: string): { year: number; quarter: number } {
  const y = Number(today.slice(0, 4)), q = Math.floor((Number(today.slice(5, 7)) - 1) / 3) + 1;
  return q === 1 ? { year: y - 1, quarter: 4 } : { year: y, quarter: q - 1 };
}

export type MembershipSpan = { joined_on: string | null; left_on: string | null };

/**
 * Cohort retention. For each person initiated in the cohort, they "remain" at
 * N months if some Lodge membership covers the date initiation + N months.
 * A person only counts towards an N-month figure once that date has passed
 * (`eligible`), so recent cohorts are never shown as losses.
 */
export function cohortRetention(
  initiates: { person_id: string; initiated_on: string; cohort: string }[],
  memberships: Map<string, MembershipSpan[]>,
  today: string,
  horizons: number[] = [12, 24, 36],
): Row[] {
  const byCohort = new Map<string, typeof initiates>();
  for (const i of initiates) byCohort.set(i.cohort, [...(byCohort.get(i.cohort) ?? []), i]);
  return [...byCohort.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([cohort, people]) => {
    const row: Row = { cohort, initiated: people.length };
    const notes: string[] = [];
    for (const h of horizons) {
      let eligible = 0, remain = 0;
      for (const p of people) {
        const at = addMonths(p.initiated_on, h);
        if (at > today) continue;
        eligible++;
        const spans = memberships.get(p.person_id) ?? [];
        if (spans.some((s) => (!s.joined_on || s.joined_on <= at) && (!s.left_on || s.left_on > at))) remain++;
      }
      row[`eligible_${h}`] = eligible;
      row[`remain_${h}`] = eligible ? remain : null;
      row[`pct_${h}`] = eligible ? Math.round((remain / eligible) * 100) : null;
      if (eligible > 0 && eligible < 10) notes.push(`${h}m: small numbers`);
      if (eligible === 0) notes.push(`${h}m: not yet reached`);
      else if (eligible < people.length) notes.push(`${h}m: partly reached`);
    }
    row.note = notes.join("; ");
    return row;
  });
}

export const PROGRESSION_BANDS = [
  { label: "Up to 6 months", max: 6 },
  { label: "7 to 9 months", max: 9 },
  { label: "10 to 12 months", max: 12 },
  { label: "13 to 18 months", max: 18 },
  { label: "19 to 24 months", max: 24 },
  { label: "Over 24 months", max: Infinity },
];

/** Distribution of month intervals into fixed bands (never a ranking). */
export function bandCounts(values: (number | null | undefined)[], bands = PROGRESSION_BANDS): { band: string; count: number }[] {
  const out = bands.map((b) => ({ band: b.label, count: 0 }));
  for (const v of values) {
    if (v === null || v === undefined || Number.isNaN(v)) continue;
    const i = bands.findIndex((b) => v <= b.max);
    out[i === -1 ? bands.length - 1 : i].count++;
  }
  return out;
}

export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round(((v[m - 1] + v[m]) / 2) * 10) / 10;
}

export type Aggregation = "count" | "sum" | "avg";

/** Group rows by a column and aggregate. Missing group values become "Not recorded". */
export function aggregate(rows: Row[], groupBy: string, agg: Aggregation, measure?: string): { group: string; value: number }[] {
  const m = new Map<string, { n: number; sum: number; c: number }>();
  for (const r of rows) {
    const raw = r[groupBy];
    const g = raw === null || raw === undefined || raw === "" ? "Not recorded" : typeof raw === "boolean" ? (raw ? "Yes" : "No") : String(raw);
    const cur = m.get(g) ?? { n: 0, sum: 0, c: 0 };
    cur.n++;
    if (measure) {
      const v = Number(r[measure]);
      if (r[measure] !== null && r[measure] !== undefined && r[measure] !== "" && Number.isFinite(v)) { cur.sum += v; cur.c++; }
    }
    m.set(g, cur);
  }
  return [...m.entries()].map(([group, s]) => ({
    group,
    value: agg === "count" || !measure ? s.n : agg === "sum" ? Math.round(s.sum * 100) / 100 : s.c ? Math.round((s.sum / s.c) * 10) / 10 : 0,
  })).sort((a, b) => a.group.localeCompare(b.group, "en-GB", { numeric: true }));
}

/* ------------------------------------------------------------------------- */
/* Quarterly report                                                           */
/* ------------------------------------------------------------------------- */

export type PeriodData = {
  period?: { start: string; end: string };
  lodges?: { active?: number; with_lodge_mentor?: number; unconfirmed_lodge_mentor?: number; allocated?: number; by_area?: { area: string; lodges: number }[] };
  membership?: { initiations?: number; passings?: number; raisings?: number; joinings?: number; exaltations?: number; departures?: Record<string, number>; early_departures_36m?: number };
  activity?: { contacts?: number; contacts_by_method?: Record<string, number>; visits_completed?: number; reviews?: number; tasks_completed?: number; tasks_open_at_end?: number };
  support?: { opened?: number; closed?: number; open_at_end?: number; by_category?: Record<string, number>; confidential_received?: number };
  learning?: { enrolments?: number; completions?: number; certificates?: number; active_learners?: number; by_course?: { course: string; enrolments: number; completions: number }[] };
  events?: { held?: number; training_sessions?: number; registrations?: number; attended?: number; average_feedback?: number | null };
  communications?: { campaigns_sent?: number; emails_delivered?: number };
  previous?: PeriodData;
};

export const QUARTERLY_SECTIONS = [
  { key: "summary", label: "Summary" },
  { key: "lodges", label: "Lodges and Lodge Mentors" },
  { key: "membership", label: "Membership" },
  { key: "support", label: "Support" },
  { key: "learning", label: "Learning" },
  { key: "events", label: "Events" },
  { key: "observations", label: "Observations" },
] as const;
export type SectionKey = (typeof QUARTERLY_SECTIONS)[number]["key"];

const n = (v: number | null | undefined) => v ?? 0;
const plural = (v: number, one: string, many = `${one}s`) => `${v} ${v === 1 ? one : many}`;

/** Neutral comparison phrase: "up from 4", "down from 6", "the same as last quarter". */
export function compare(cur: number, prev: number | undefined | null): string {
  if (prev === undefined || prev === null) return "";
  if (cur === prev) return " (the same as the previous quarter)";
  return cur > prev ? ` (up from ${prev} in the previous quarter)` : ` (down from ${prev} in the previous quarter)`;
}

export const departuresTotal = (d?: Record<string, number>) => Object.values(d ?? {}).reduce((a, b) => a + Number(b), 0);

/**
 * Neutral, factual draft sentences for each narrative section. Leadership edits
 * them; they never judge a Lodge or Brother and never rank Lodges.
 */
export function suggestNarrative(d: PeriodData, periodLabel: string): Record<SectionKey, string> {
  const p = d.previous ?? {};
  const L = d.lodges ?? {}, M = d.membership ?? {}, S = d.support ?? {}, A = d.activity ?? {}, E = d.events ?? {}, LE = d.learning ?? {};
  const active = n(L.active), withLm = n(L.with_lodge_mentor), alloc = n(L.allocated);
  const vacant = Math.max(0, active - withLm);
  const deps = departuresTotal(M.departures);
  return {
    summary: `During ${periodLabel}, ${plural(active, "active Lodge")} were supported, ${withLm} with a Lodge Mentor in place. ` +
      `The team recorded ${plural(n(A.contacts), "contact")} with Lodges${compare(n(A.contacts), p.activity?.contacts)} and completed ${plural(n(A.visits_completed), "visit")}. ` +
      `${plural(n(M.initiations), "Initiation")} ${n(M.initiations) === 1 ? "was" : "were"} recorded.`,
    lodges: `${withLm} of ${active} active Lodges had a Lodge Mentor in place at the end of the quarter` +
      `${n(L.unconfirmed_lodge_mentor) ? `, of whom ${n(L.unconfirmed_lodge_mentor)} ${n(L.unconfirmed_lodge_mentor) === 1 ? "is" : "are"} awaiting confirmation` : ""}. ` +
      `${vacant ? `${plural(vacant, "Lodge")} did not have a Lodge Mentor recorded. ` : ""}${alloc} Lodges were allocated to an Assistant Provincial Grand Mentor. ` +
      `${plural(n(A.reviews), "mentoring review")} took place.`,
    membership: `The quarter saw ${plural(n(M.initiations), "Initiation")}${compare(n(M.initiations), p.membership?.initiations)}, ${plural(n(M.passings), "Passing")} and ${plural(n(M.raisings), "Raising")}. ` +
      `${plural(n(M.joinings), "joining member")} ${n(M.joinings) === 1 ? "was" : "were"} welcomed. ${plural(deps, "departure")} ${deps === 1 ? "was" : "were"} recorded from imported data` +
      `${n(M.early_departures_36m) ? `, ${n(M.early_departures_36m)} within three years of Initiation` : ""}. Figures depend on the membership imports received and may be partial.`,
    support: `${plural(n(S.opened), "support request")} ${n(S.opened) === 1 ? "was" : "were"} opened${compare(n(S.opened), p.support?.opened)} and ${n(S.closed)} closed; ` +
      `${n(S.open_at_end)} remained open at the end of the quarter. ${n(A.tasks_completed)} follow-up actions were completed.`,
    learning: `The Academy recorded ${plural(n(LE.enrolments), "enrolment")}${compare(n(LE.enrolments), p.learning?.enrolments)}, ${plural(n(LE.completions), "course completion")} and ${plural(n(LE.certificates), "certificate")} issued. ` +
      `${plural(n(LE.active_learners), "learner")} ${n(LE.active_learners) === 1 ? "was" : "were"} active during the quarter.`,
    events: `${plural(n(E.held), "event")} took place, including ${plural(n(E.training_sessions), "training session")}. ` +
      `There were ${plural(n(E.registrations), "registration")} and ${n(E.attended)} recorded attendances` +
      `${E.average_feedback ? `, with an average feedback rating of ${E.average_feedback} out of 5` : ""}.`,
    observations: "",
  };
}
