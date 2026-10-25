import type { ChartSpec } from "@/components/reports/chart";
import { departuresTotal, type PeriodData } from "./analysis";

/** Key figures and simple comparison charts for a quarterly snapshot (shared by the page and the PDF). */
export type Figure = { section: string; label: string; value: number | string; previous?: number | string | null };

const v = (x: number | null | undefined) => x ?? 0;

export function keyFigures(d: PeriodData): Figure[] {
  const p = d.previous ?? {};
  return [
    { section: "Lodges and Lodge Mentors", label: "Active Lodges", value: v(d.lodges?.active), previous: p.lodges?.active },
    { section: "Lodges and Lodge Mentors", label: "Lodge Mentor in place", value: v(d.lodges?.with_lodge_mentor), previous: p.lodges?.with_lodge_mentor },
    { section: "Lodges and Lodge Mentors", label: "Lodge Mentor unconfirmed", value: v(d.lodges?.unconfirmed_lodge_mentor), previous: p.lodges?.unconfirmed_lodge_mentor },
    { section: "Lodges and Lodge Mentors", label: "Lodges allocated", value: v(d.lodges?.allocated), previous: p.lodges?.allocated },
    { section: "Lodges and Lodge Mentors", label: "Contacts with Lodges", value: v(d.activity?.contacts), previous: p.activity?.contacts },
    { section: "Lodges and Lodge Mentors", label: "Visits completed", value: v(d.activity?.visits_completed), previous: p.activity?.visits_completed },
    { section: "Lodges and Lodge Mentors", label: "Mentoring reviews", value: v(d.activity?.reviews), previous: p.activity?.reviews },
    { section: "Membership", label: "Initiations", value: v(d.membership?.initiations), previous: p.membership?.initiations },
    { section: "Membership", label: "Passings", value: v(d.membership?.passings), previous: p.membership?.passings },
    { section: "Membership", label: "Raisings", value: v(d.membership?.raisings), previous: p.membership?.raisings },
    { section: "Membership", label: "Joining members", value: v(d.membership?.joinings), previous: p.membership?.joinings },
    { section: "Membership", label: "Departures", value: departuresTotal(d.membership?.departures), previous: p.membership ? departuresTotal(p.membership.departures) : null },
    { section: "Membership", label: "Early departures (within 3 years)", value: v(d.membership?.early_departures_36m), previous: p.membership?.early_departures_36m },
    { section: "Support", label: "Support requests opened", value: v(d.support?.opened), previous: p.support?.opened },
    { section: "Support", label: "Support requests closed", value: v(d.support?.closed), previous: p.support?.closed },
    { section: "Support", label: "Open at quarter end", value: v(d.support?.open_at_end), previous: p.support?.open_at_end },
    { section: "Support", label: "Actions completed", value: v(d.activity?.tasks_completed), previous: p.activity?.tasks_completed },
    { section: "Learning", label: "Enrolments", value: v(d.learning?.enrolments), previous: p.learning?.enrolments },
    { section: "Learning", label: "Completions", value: v(d.learning?.completions), previous: p.learning?.completions },
    { section: "Learning", label: "Certificates", value: v(d.learning?.certificates), previous: p.learning?.certificates },
    { section: "Learning", label: "Active learners", value: v(d.learning?.active_learners), previous: p.learning?.active_learners },
    { section: "Events", label: "Events held", value: v(d.events?.held), previous: p.events?.held },
    { section: "Events", label: "Training sessions", value: v(d.events?.training_sessions), previous: p.events?.training_sessions },
    { section: "Events", label: "Registrations", value: v(d.events?.registrations), previous: p.events?.registrations },
    { section: "Events", label: "Attendances", value: v(d.events?.attended), previous: p.events?.attended },
    { section: "Events", label: "Campaigns sent", value: v(d.communications?.campaigns_sent), previous: p.communications?.campaigns_sent },
  ];
}

const pair = (labels: [string, number, number | undefined | null][]) => labels.map(([l, cur, prev]) => ({ measure: l, current: cur, previous: prev ?? null }));
const SERIES = [{ key: "previous", label: "Previous quarter" }, { key: "current", label: "This quarter" }];

export function quarterlyCharts(d: PeriodData): ChartSpec[] {
  const p = d.previous ?? {};
  return [
    {
      title: "Membership changes", type: "bar", x: "measure", series: SERIES,
      summary: `This quarter: ${v(d.membership?.initiations)} Initiations, ${v(d.membership?.passings)} Passings, ${v(d.membership?.raisings)} Raisings, ${v(d.membership?.joinings)} joining members and ${departuresTotal(d.membership?.departures)} departures, shown beside the previous quarter.`,
      data: pair([["Initiations", v(d.membership?.initiations), p.membership?.initiations], ["Passings", v(d.membership?.passings), p.membership?.passings],
        ["Raisings", v(d.membership?.raisings), p.membership?.raisings], ["Joining", v(d.membership?.joinings), p.membership?.joinings],
        ["Departures", departuresTotal(d.membership?.departures), p.membership ? departuresTotal(p.membership.departures) : null]]),
    },
    {
      title: "Mentoring activity", type: "bar", x: "measure", series: SERIES,
      summary: `This quarter: ${v(d.activity?.contacts)} contacts, ${v(d.activity?.visits_completed)} visits, ${v(d.activity?.reviews)} reviews and ${v(d.support?.opened)} support requests opened, shown beside the previous quarter.`,
      data: pair([["Contacts", v(d.activity?.contacts), p.activity?.contacts], ["Visits", v(d.activity?.visits_completed), p.activity?.visits_completed],
        ["Reviews", v(d.activity?.reviews), p.activity?.reviews], ["Support requests", v(d.support?.opened), p.support?.opened]]),
    },
    {
      title: "Learning and events", type: "bar", x: "measure", series: SERIES,
      summary: `This quarter: ${v(d.learning?.enrolments)} enrolments, ${v(d.learning?.completions)} completions, ${v(d.events?.held)} events and ${v(d.events?.attended)} attendances.`,
      data: pair([["Enrolments", v(d.learning?.enrolments), p.learning?.enrolments], ["Completions", v(d.learning?.completions), p.learning?.completions],
        ["Events", v(d.events?.held), p.events?.held], ["Attendances", v(d.events?.attended), p.events?.attended]]),
    },
    {
      title: "Allocated Lodges by area", type: "hbar", x: "area", series: [{ key: "lodges", label: "Lodges" }],
      summary: (d.lodges?.by_area ?? []).map((a) => `${a.area}: ${a.lodges}`).join(", ") || "No allocations recorded at quarter end.",
      data: (d.lodges?.by_area ?? []).map((a) => ({ area: a.area, lodges: a.lodges })),
    },
  ];
}
