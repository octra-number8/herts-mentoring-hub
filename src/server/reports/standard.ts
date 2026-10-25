import "server-only";
import type { ChartSpec } from "@/components/reports/chart";
import type { Permission } from "@/lib/permissions";
import { aggregate, bandCounts, median, type Row } from "./analysis";

/**
 * The standard reports offered at /reports. Each is a registered dataset (so it
 * exports through /api/export/<key>) plus chart builders. Charts summarise by
 * period, area or band: never a league table of Lodges.
 */
export type StandardReport = {
  key: string;
  section: "Lodges" | "Membership" | "Learning and events" | "Communications";
  title: string;
  permission: Permission[];
  limitations?: string[];
  charts: (rows: Row[], filters: Record<string, string>) => ChartSpec[];
};

export const MEMBERSHIP_LIMITATIONS = [
  "Figures come from the membership imports received so far. Imports can be partial, so a missing record never implies that a Brother has left.",
  "This environment holds synthetic data for testing. Do not draw conclusions about real Lodges from it.",
  "Where numbers are small (fewer than 10), percentages can swing widely and should be read with care.",
];

const num = (v: unknown) => Number(v ?? 0) || 0;
const sumBy = (rows: Row[], key: string) => rows.reduce((a, r) => a + num(r[key]), 0);
const groupSum = (rows: Row[], by: string, keys: string[]) => {
  const m = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const g = String(r[by] ?? "Not recorded");
    const cur = m.get(g) ?? Object.fromEntries(keys.map((k) => [k, 0]));
    for (const k of keys) cur[k] += num(r[k]);
    m.set(g, cur);
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, "en-GB", { numeric: true })).map(([g, v]) => ({ [by]: g, ...v }));
};

export const STANDARD_REPORTS: StandardReport[] = [
  {
    key: "lodge_coverage", section: "Lodges", title: "Lodge Mentor coverage and allocations", permission: ["reports.read"],
    charts: (rows) => {
      const byArea = new Map<string, { area: string; in_place: number; unconfirmed: number; vacant: number }>();
      for (const r of rows) {
        const a = String(r.area ?? "Unallocated");
        const cur = byArea.get(a) ?? { area: a, in_place: 0, unconfirmed: 0, vacant: 0 };
        if (r.coverage === "Vacant") cur.vacant++; else if (r.coverage === "Unconfirmed") cur.unconfirmed++; else cur.in_place++;
        byArea.set(a, cur);
      }
      const totals = { in_place: rows.filter((r) => r.coverage === "In place").length, unconfirmed: rows.filter((r) => r.coverage === "Unconfirmed").length, vacant: rows.filter((r) => r.coverage === "Vacant").length };
      return [{
        title: "Lodge Mentor position by area", type: "stacked", x: "area",
        summary: `Of ${rows.length} active Lodges shown, ${totals.in_place} have a Lodge Mentor in place, ${totals.unconfirmed} are awaiting confirmation and ${totals.vacant} have no Lodge Mentor recorded.`,
        data: [...byArea.values()].sort((a, b) => a.area.localeCompare(b.area)),
        series: [{ key: "in_place", label: "In place" }, { key: "unconfirmed", label: "Unconfirmed" }, { key: "vacant", label: "Vacant" }],
      }];
    },
  },
  {
    key: "lodge_activity", section: "Lodges", title: "Lodge mentoring activity", permission: ["reports.read"],
    limitations: ["Counts show recorded activity only. A Lodge with few contacts recorded may simply need little support."],
    charts: (rows) => [{
      title: "Activity by area", type: "bar", x: "area",
      summary: `${sumBy(rows, "contacts")} contacts, ${sumBy(rows, "visits_completed")} completed visits and ${sumBy(rows, "reviews")} mentoring reviews recorded across ${rows.length} Lodges in the period. ${sumBy(rows, "open_actions")} actions are outstanding.`,
      data: groupSum(rows, "area", ["contacts", "visits_completed", "reviews", "requests_opened"]),
      series: [{ key: "contacts", label: "Contacts" }, { key: "visits_completed", label: "Visits completed" }, { key: "reviews", label: "Reviews" }, { key: "requests_opened", label: "Support requests" }],
    }],
  },
  {
    key: "lodge_reviews_report", section: "Lodges", title: "Mentoring reviews and training needs", permission: ["reports.read"],
    charts: (rows) => [{
      title: "Mentoring reviews by area", type: "bar", x: "group",
      summary: `${rows.length} reviews held in the period; ${rows.filter((r) => r.training_needs).length} recorded a training need.`,
      data: aggregate(rows, "area", "count").map((g) => ({ group: g.group, reviews: g.value })), series: [{ key: "reviews", label: "Reviews" }],
    }],
  },
  {
    key: "membership_changes", section: "Membership", title: "Membership changes", permission: ["reports.membership"], limitations: MEMBERSHIP_LIMITATIONS,
    charts: (rows) => {
      const quarters = new Map<string, { quarter: string; initiations: number; joinings: number; departures: number }>();
      for (const r of rows) {
        const q = String(r.quarter);
        const cur = quarters.get(q) ?? { quarter: q, initiations: 0, joinings: 0, departures: 0 };
        if (r.change_key === "initiation") cur.initiations++;
        else if (r.change_key === "joining") cur.joinings++;
        else if (r.direction === "Out") cur.departures++;
        quarters.set(q, cur);
      }
      const byType = aggregate(rows, "change", "count").map((g) => ({ change: g.group, count: g.value }));
      return [
        {
          title: "Members joining and leaving by quarter", type: "bar", x: "quarter",
          summary: `${rows.filter((r) => r.change_key === "initiation").length} Initiations, ${rows.filter((r) => r.change_key === "joining").length} joining members and ${rows.filter((r) => r.direction === "Out").length} departures recorded in the period.`,
          data: [...quarters.values()].sort((a, b) => a.quarter.localeCompare(b.quarter)),
          series: [{ key: "initiations", label: "Initiations" }, { key: "joinings", label: "Joining members" }, { key: "departures", label: "Departures" }],
        },
        { title: "Changes by type", type: "hbar", x: "change", summary: byType.map((t) => `${t.change}: ${t.count}`).join(", ") + ".", data: byType, series: [{ key: "count", label: "Changes" }] },
      ];
    },
  },
  {
    key: "progression_periods", section: "Membership", title: "Progression periods", permission: ["reports.membership"], limitations: MEMBERSHIP_LIMITATIONS,
    charts: (rows) => {
      const ea = rows.map((r) => r.months_ea_fc as number | null).filter((v): v is number => v !== null);
      const fc = rows.map((r) => r.months_fc_mm as number | null).filter((v): v is number => v !== null);
      const a = bandCounts(ea), b = bandCounts(fc);
      return [{
        title: "Time between Degrees", type: "bar", x: "band",
        summary: `Median ${median(ea) ?? "n/a"} months from Initiation to Passing (${ea.length} Brethren) and ${median(fc) ?? "n/a"} months from Passing to Raising (${fc.length} Brethren). ${rows.filter((r) => !r.passed_on).length} have not yet been passed.`,
        data: a.map((x, i) => ({ band: x.band, ea_fc: x.count, fc_mm: b[i].count })),
        series: [{ key: "ea_fc", label: "Initiation to Passing" }, { key: "fc_mm", label: "Passing to Raising" }],
      }];
    },
  },
  {
    key: "membership_cohorts", section: "Membership", title: "Retention by Initiation cohort (12, 24 and 36 months)", permission: ["reports.membership"],
    limitations: [...MEMBERSHIP_LIMITATIONS, "A cohort is only counted at 12, 24 or 36 months once that point has passed for its members. Recent cohorts therefore show fewer figures, never losses."],
    charts: (rows) => [{
      title: "Share remaining after 12, 24 and 36 months", type: "bar", x: "cohort", unit: "%",
      summary: rows.length
        ? `${sumBy(rows, "initiated")} Brethren initiated across ${rows.length} cohorts. ` + rows.filter((r) => r.pct_36 !== null).map((r) => `${r.cohort}: ${r.pct_36}% remained after 36 months (of ${r.eligible_36})`).slice(-3).join("; ") + "."
        : "No Initiations in this window.",
      data: rows.map((r) => ({ cohort: String(r.cohort), pct_12: r.pct_12 as number | null, pct_24: r.pct_24 as number | null, pct_36: r.pct_36 as number | null })),
      series: [{ key: "pct_12", label: "After 12 months" }, { key: "pct_24", label: "After 24 months" }, { key: "pct_36", label: "After 36 months" }],
    }],
  },
  {
    key: "membership_length", section: "Membership", title: "Length of membership", permission: ["reports.membership"], limitations: MEMBERSHIP_LIMITATIONS,
    charts: (rows) => {
      const order = ["Under 3 years", "3 to 4 years", "5 to 9 years", "10 to 19 years", "20 years or more", "Not recorded"];
      const data = order.map((b) => ({ band: b, members: rows.filter((r) => r.band === b).length })).filter((d) => d.members > 0 || d.band !== "Not recorded");
      return [{ title: "Current members by length of membership", type: "bar", x: "band", summary: `${rows.length} current memberships. Median ${median(rows.map((r) => Number(r.years)).filter((v) => !Number.isNaN(v))) ?? "n/a"} years.`, data, series: [{ key: "members", label: "Members" }] }];
    },
  },
  {
    key: "membership_departures", section: "Membership", title: "Departures and early departures", permission: ["reports.membership"], limitations: MEMBERSHIP_LIMITATIONS,
    charts: (rows) => {
      const data = aggregate(rows, "reason", "count").map((g) => ({ reason: g.group, all: g.value, early: rows.filter((r) => r.reason === g.group && r.early).length }));
      return [{
        title: "Departures by reason", type: "bar", x: "reason",
        summary: `${rows.length} departures recorded in the period, of which ${rows.filter((r) => r.early).length} were within three years of joining.`,
        data, series: [{ key: "all", label: "All departures" }, { key: "early", label: "Within three years" }],
      }];
    },
  },
  {
    key: "learning_summary", section: "Learning and events", title: "Learning summary", permission: ["reports.read"],
    limitations: ["Learning records are visible only to those who may read them. If you see no rows, your role may not include learning records."],
    charts: (rows) => [{
      title: "Enrolments and completions", type: "hbar", x: "group",
      summary: `${sumBy(rows, "enrolments")} enrolments, ${sumBy(rows, "completions")} completions and ${sumBy(rows, "certificates")} certificates in the period; ${sumBy(rows, "outstanding")} enrolments are past their due date.`,
      data: rows.map((r) => ({ group: String(r.group), enrolments: num(r.enrolments), completions: num(r.completions) })),
      series: [{ key: "enrolments", label: "Enrolments" }, { key: "completions", label: "Completions" }],
    }],
  },
  {
    key: "report_event_attendance", section: "Learning and events", title: "Event attendance and feedback", permission: ["reports.read"],
    charts: (rows) => {
      const months = new Map<string, { month: string; registered: number; attended: number }>();
      for (const r of rows) {
        const m = String(r.date).slice(0, 7);
        const cur = months.get(m) ?? { month: m, registered: 0, attended: 0 };
        cur.registered += num(r.registered); cur.attended += num(r.attended);
        months.set(m, cur);
      }
      const rated = rows.filter((r) => r.average_rating !== null && r.average_rating !== undefined);
      return [{
        title: "Registrations and attendance by month", type: "bar", x: "month",
        summary: `${rows.length} events, ${sumBy(rows, "registered")} registrations and ${sumBy(rows, "attended")} recorded attendances.${rated.length ? ` ${sumBy(rows, "feedback_count")} feedback responses were received.` : ""}`,
        data: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
        series: [{ key: "registered", label: "Registered" }, { key: "attended", label: "Attended" }],
      }];
    },
  },
  {
    key: "report_communications", section: "Communications", title: "Communications summary", permission: ["reports.read"],
    charts: (rows) => [{
      title: "Delivery and engagement by month", type: "bar", x: "month",
      summary: `${rows.length} campaigns sent to ${sumBy(rows, "recipients")} recipients; ${sumBy(rows, "delivered")} delivered and ${sumBy(rows, "opened")} opened.`,
      data: groupSum(rows.map((r) => ({ ...r, month: String(r.sent_at ?? "").slice(0, 7) })), "month", ["delivered", "opened"]),
      series: [{ key: "delivered", label: "Delivered" }, { key: "opened", label: "Opened" }],
    }],
  },
];

export const standardReport = (key: string) => STANDARD_REPORTS.find((r) => r.key === key);
