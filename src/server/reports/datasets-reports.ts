import "server-only";
import { label } from "@/lib/utils";
import type { Row } from "../export/format";
import type { DB } from "../supabase";
import { addMonths, cohortRetention, monthsDiff, quarterLabel, type MembershipSpan } from "./analysis";
import { registerDataset } from "./datasets";
import { fetchAll, isoOr, lodgeIndex } from "./fetch";

/**
 * Reporting-specific datasets (Lodge, membership, learning, events and
 * communications reports). Every query runs as the signed-in user: RLS limits
 * rows, and field-level rules are respected by the views and tables used.
 * Membership figures never name individuals: they are statistical.
 */

const today = () => new Date().toISOString().slice(0, 10);
const yearAgo = () => addMonths(today(), -12);

const DATE_FILTERS = [
  { key: "from", label: "From", type: "date" as const },
  { key: "to", label: "To", type: "date" as const },
];
const AREA = { key: "area", label: "Area", type: "select" as const };
const LODGE = { key: "lodge", label: "Lodge", type: "select" as const };

type Ctx = { permissions: string[]; allocated_lodge_ids: string[] };
async function context(db: DB): Promise<Ctx> {
  const { data } = await db.rpc("my_context");
  const c = (data ?? {}) as unknown as Partial<Ctx>;
  return { permissions: c.permissions ?? [], allocated_lodge_ids: c.allocated_lodge_ids ?? [] };
}

/** Lodges whose activity the caller may see in full (all, or their allocation). */
async function activityLodges(db: DB): Promise<Set<string> | "all"> {
  const c = await context(db);
  if (c.permissions.includes("activity.read.all")) return "all";
  return new Set(c.permissions.includes("activity.read.allocated") ? c.allocated_lodge_ids : []);
}

const lodgeCols = (r: { number?: number; name?: string; area?: string | null }) => ({ lodge_number: r.number ?? null, lodge: r.name ?? null, area: r.area ?? null });

// ---------------------------------------------------------------------------
// Lodge reporting
// ---------------------------------------------------------------------------

registerDataset({
  key: "lodge_coverage",
  label: "Lodge Mentor coverage and allocations",
  description: "Lodge Mentor in place, vacant or unconfirmed; Assistant allocation and mentoring arrangements for each Lodge.",
  permission: ["reports.read"],
  exportPermission: ["reports.export"],
  columns: [
    { key: "number", label: "No.", type: "number", width: 0.5 },
    { key: "name", label: "Lodge", width: 1.8 },
    { key: "area", label: "Area", width: 1 },
    { key: "apgmen", label: "Assistant PGMen", width: 1.5 },
    { key: "cover_apgmen", label: "Cover", width: 1.2 },
    { key: "lodge_mentor", label: "Lodge Mentor", width: 1.5 },
    { key: "coverage", label: "Lodge Mentor position", width: 1 },
    { key: "personal_mentors", label: "New members have Personal Mentors", width: 1.1 },
    { key: "mentoring_status", label: "Mentoring status", width: 1.2 },
    { key: "last_contact_on", label: "Last contact", type: "date", width: 0.9 },
    { key: "last_review_on", label: "Last review", type: "date", width: 0.9 },
    { key: "next_review_on", label: "Next review", type: "date", width: 0.9 },
  ],
  filters: [
    AREA,
    { key: "coverage", label: "Lodge Mentor", type: "select", options: [{ value: "In place", label: "In place" }, { value: "Unconfirmed", label: "Unconfirmed" }, { value: "Vacant", label: "Vacant" }] },
    { key: "allocation", label: "Allocation", type: "select", options: [{ value: "allocated", label: "Allocated" }, { value: "unallocated", label: "Unallocated" }] },
  ],
  query: async (db, f) => {
    let q = db.from("v_lodge_overview").select("*").eq("status", "active").order("number");
    if (f.area) q = q.eq("area_id", f.area);
    if (f.allocation === "unallocated") q = q.is("apgmen", null);
    if (f.allocation === "allocated") q = q.not("apgmen", "is", null);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((l) => ({
      ...l,
      coverage: !l.lodge_mentor ? "Vacant" : l.lodge_mentor_confirmed === false ? "Unconfirmed" : "In place",
      personal_mentors: l.personal_mentors_for_new_members ? label(l.personal_mentors_for_new_members) : "Not recorded",
    })).filter((r) => !f.coverage || r.coverage === f.coverage) as Row[];
  },
});

registerDataset({
  key: "lodge_activity",
  label: "Lodge mentoring activity",
  description: "Contacts, visits, mentoring reviews, support requests and outstanding actions for each Lodge in a period. Only Lodges whose activity you may see are included.",
  permission: ["reports.read"],
  exportPermission: ["reports.export"],
  columns: [
    { key: "lodge_number", label: "No.", type: "number", width: 0.5 },
    { key: "lodge", label: "Lodge", width: 1.8 },
    { key: "area", label: "Area", width: 1 },
    { key: "apgmen", label: "Assistant PGMen", width: 1.4 },
    { key: "contacts", label: "Contacts", type: "number", width: 0.7 },
    { key: "visits_completed", label: "Visits completed", type: "number", width: 0.8 },
    { key: "visits_planned", label: "Visits planned", type: "number", width: 0.8 },
    { key: "reviews", label: "Mentoring reviews", type: "number", width: 0.8 },
    { key: "requests_opened", label: "Support requests opened", type: "number", width: 0.9 },
    { key: "requests_open", label: "Requests open now", type: "number", width: 0.8 },
    { key: "open_actions", label: "Outstanding actions", type: "number", width: 0.8 },
    { key: "overdue_actions", label: "Overdue actions", type: "number", width: 0.8 },
    { key: "training_needs", label: "Training needs (latest review)", width: 2 },
  ],
  filters: [...DATE_FILTERS, AREA],
  query: async (db, f) => {
    const from = isoOr(f.from, yearAgo()), to = isoOr(f.to, today());
    const [lodges, scope] = await Promise.all([lodgeIndex(db), activityLodges(db)]);
    const visible = [...lodges.values()].filter((l) => (scope === "all" || scope.has(l.id)) && (!f.area || l.area_id === f.area));
    if (!visible.length) return [];
    const ids = visible.map((l) => l.id);
    const [contacts, visits, reviews, cases, tasks] = await Promise.all([
      fetchAll<{ lodge_id: string | null }>((a, b) => db.from("contacts").select("lodge_id").in("lodge_id", ids).gte("occurred_on", from).lte("occurred_on", to).order("id").range(a, b)),
      fetchAll<{ lodge_id: string; status: string; planned_for: string }>((a, b) => db.from("visits").select("lodge_id, status, planned_for").in("lodge_id", ids).order("id").range(a, b)),
      fetchAll<{ lodge_id: string; review_date: string; training_needs: string | null }>((a, b) => db.from("lodge_reviews").select("lodge_id, review_date, training_needs").in("lodge_id", ids).lte("review_date", to).order("review_date").range(a, b)),
      fetchAll<{ lodge_id: string | null; status: string; created_at: string }>((a, b) => db.from("cases").select("lodge_id, status, created_at").eq("kind", "request").in("lodge_id", ids).order("id").range(a, b)),
      fetchAll<{ lodge_id: string | null; status: string; due_on: string | null }>((a, b) => db.from("tasks").select("lodge_id, status, due_on").in("lodge_id", ids).in("status", ["open", "in_progress", "waiting"]).order("id").range(a, b)),
    ]);
    const t = today();
    return visible.map((l) => {
      const lr = reviews.filter((r) => r.lodge_id === l.id);
      return {
        lodge_number: l.number, lodge: l.name, area: l.area, apgmen: l.apgmen,
        contacts: contacts.filter((c) => c.lodge_id === l.id).length,
        visits_completed: visits.filter((v) => v.lodge_id === l.id && v.status === "completed" && v.planned_for.slice(0, 10) >= from && v.planned_for.slice(0, 10) <= to).length,
        visits_planned: visits.filter((v) => v.lodge_id === l.id && v.status === "planned").length,
        reviews: lr.filter((r) => r.review_date >= from).length,
        requests_opened: cases.filter((c) => c.lodge_id === l.id && c.created_at.slice(0, 10) >= from && c.created_at.slice(0, 10) <= to).length,
        requests_open: cases.filter((c) => c.lodge_id === l.id && !["closed", "resolved", "referred"].includes(c.status)).length,
        open_actions: tasks.filter((x) => x.lodge_id === l.id).length,
        overdue_actions: tasks.filter((x) => x.lodge_id === l.id && x.due_on && x.due_on < t).length,
        training_needs: lr.at(-1)?.training_needs ?? null,
      };
    });
  },
});

registerDataset({
  key: "lodge_reviews_report",
  label: "Mentoring reviews and training needs",
  description: "Light-touch mentoring reviews held in a period, with the support and training each Lodge asked for.",
  permission: ["reports.read"],
  exportPermission: ["reports.export"],
  columns: [
    { key: "review_date", label: "Review", type: "date", width: 0.8 },
    { key: "lodge_number", label: "No.", type: "number", width: 0.5 },
    { key: "lodge", label: "Lodge", width: 1.5 },
    { key: "area", label: "Area", width: 0.9 },
    { key: "lodge_mentor_in_place", label: "Lodge Mentor in place", width: 0.8 },
    { key: "personal_mentors_in_place", label: "Personal Mentors in place", width: 0.8 },
    { key: "what_is_working", label: "What is working", width: 2 },
    { key: "support_wanted", label: "Support wanted", width: 2 },
    { key: "training_needs", label: "Training needs", width: 1.6 },
    { key: "next_review_on", label: "Next review", type: "date", width: 0.8 },
  ],
  filters: [...DATE_FILTERS, AREA],
  query: async (db, f) => {
    const from = isoOr(f.from, yearAgo()), to = isoOr(f.to, today());
    const lodges = await lodgeIndex(db);
    const { data, error } = await db.from("lodge_reviews").select("*").gte("review_date", from).lte("review_date", to).order("review_date", { ascending: false });
    if (error) throw error;
    return (data ?? []).filter((r) => !f.area || lodges.get(r.lodge_id)?.area_id === f.area).map((r) => ({
      ...r, ...lodgeCols(lodges.get(r.lodge_id) ?? {}),
      lodge_mentor_in_place: label(r.lodge_mentor_in_place), personal_mentors_in_place: label(r.personal_mentors_in_place),
    }));
  },
});

// ---------------------------------------------------------------------------
// Membership (statistical: no names)
// ---------------------------------------------------------------------------

type Degree = { person_id: string; lodge_id: string | null; kind: string; event_date: string };
type Membership = { person_id: string; lodge_id: string; joined_on: string | null; left_on: string | null; join_type: string | null; leaving_reason: string | null };

const degrees = (db: DB, kinds: string[], from?: string, to?: string) =>
  fetchAll<Degree>((a, b) => {
    let q = db.from("degree_events").select("person_id, lodge_id, kind, event_date").in("kind", kinds);
    if (from) q = q.gte("event_date", from);
    if (to) q = q.lte("event_date", to);
    return q.order("id").range(a, b);
  });

const memberships = (db: DB, o: { leftFrom?: string; leftTo?: string; current?: boolean; persons?: string[] } = {}) =>
  fetchAll<Membership>((a, b) => {
    let q = db.from("lodge_memberships").select("person_id, lodge_id, joined_on, left_on, join_type, leaving_reason");
    if (o.leftFrom) q = q.gte("left_on", o.leftFrom);
    if (o.leftTo) q = q.lte("left_on", o.leftTo);
    if (o.current) q = q.is("left_on", null);
    if (o.persons) q = q.in("person_id", o.persons);
    return q.order("id").range(a, b);
  });

const inScope = (lodgeId: string | null, lodges: Map<string, { area_id: string | null }>, f: Record<string, string>) =>
  (!f.lodge || lodgeId === f.lodge) && (!f.area || (lodgeId ? lodges.get(lodgeId)?.area_id === f.area : false));

const CHANGE_LABELS: Record<string, string> = {
  initiation: "Initiation", passing: "Passing", raising: "Raising", joining: "Joining member",
  resigned: "Resignation", ceased: "Cessation", deceased: "Death", excluded: "Exclusion", other: "Other departure", unrecorded: "Departure (reason not recorded)",
};

registerDataset({
  key: "membership_changes",
  label: "Membership changes",
  description: "Initiations, Passings, Raisings, joining members, resignations, cessations and deaths recorded in a period.",
  permission: ["reports.membership"],
  exportPermission: ["reports.export"],
  columns: [
    { key: "date", label: "Date", type: "date", width: 0.8 },
    { key: "quarter", label: "Quarter", width: 0.7 },
    { key: "change", label: "Change", width: 1.2 },
    { key: "direction", label: "Direction", width: 0.7 },
    { key: "lodge_number", label: "No.", type: "number", width: 0.5 },
    { key: "lodge", label: "Lodge", width: 1.6 },
    { key: "area", label: "Area", width: 1 },
  ],
  filters: [...DATE_FILTERS, AREA, LODGE, {
    key: "change", label: "Change", type: "select",
    options: ["initiation", "passing", "raising", "joining", "resigned", "ceased", "deceased"].map((k) => ({ value: k, label: CHANGE_LABELS[k] })),
  }],
  query: async (db, f) => {
    const from = isoOr(f.from, yearAgo()), to = isoOr(f.to, today());
    const [lodges, deg, left] = await Promise.all([
      lodgeIndex(db), degrees(db, ["initiation", "passing", "raising", "joining"], from, to),
      memberships(db, { leftFrom: from, leftTo: to }),
    ]);
    const rows: Row[] = [
      ...deg.filter((d) => inScope(d.lodge_id, lodges, f)).map((d) => ({ date: d.event_date, kind: d.kind, lodge_id: d.lodge_id, direction: d.kind === "joining" || d.kind === "initiation" ? "In" : "Progression" })),
      ...left.filter((m) => inScope(m.lodge_id, lodges, f)).map((m) => ({ date: m.left_on, kind: m.leaving_reason ?? "unrecorded", lodge_id: m.lodge_id, direction: "Out" })),
    ].filter((r) => !f.change || r.kind === f.change).map((r) => ({
      date: r.date, quarter: quarterLabel(String(r.date)), change: CHANGE_LABELS[String(r.kind)] ?? label(String(r.kind)), change_key: r.kind, direction: r.direction,
      ...lodgeCols(lodges.get(String(r.lodge_id)) ?? {}),
    }));
    return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  },
});

registerDataset({
  key: "progression_periods",
  label: "Progression periods",
  description: "Months from Initiation to Passing and from Passing to Raising, for Brethren initiated in a period. A long interval is a prompt for a conversation, never a judgement.",
  permission: ["reports.membership"],
  exportPermission: ["reports.export"],
  columns: [
    { key: "lodge_number", label: "No.", type: "number", width: 0.5 },
    { key: "lodge", label: "Lodge", width: 1.6 },
    { key: "area", label: "Area", width: 1 },
    { key: "initiated_on", label: "Initiated", type: "date", width: 0.8 },
    { key: "passed_on", label: "Passed", type: "date", width: 0.8 },
    { key: "raised_on", label: "Raised", type: "date", width: 0.8 },
    { key: "months_ea_fc", label: "Months EA to FC", type: "number", width: 0.7 },
    { key: "months_fc_mm", label: "Months FC to MM", type: "number", width: 0.7 },
    { key: "months_since_last", label: "Months at current stage", type: "number", width: 0.7 },
  ],
  filters: [...DATE_FILTERS, AREA, LODGE],
  query: async (db, f) => {
    const from = isoOr(f.from, addMonths(today(), -60)), to = isoOr(f.to, today());
    const [lodges, init] = await Promise.all([lodgeIndex(db), degrees(db, ["initiation"], from, to)]);
    const people = init.filter((d) => inScope(d.lodge_id, lodges, f));
    if (!people.length) return [];
    const later = await degrees(db, ["passing", "raising"], from);
    const first = (pid: string, kind: string) => later.filter((d) => d.person_id === pid && d.kind === kind).map((d) => d.event_date).sort()[0] ?? null;
    const t = today();
    return people.sort((a, b) => a.event_date.localeCompare(b.event_date)).map((d) => {
      const passed = first(d.person_id, "passing"), raised = first(d.person_id, "raising");
      return {
        ...lodgeCols(lodges.get(d.lodge_id ?? "") ?? {}), initiated_on: d.event_date, passed_on: passed, raised_on: raised,
        months_ea_fc: passed ? monthsDiff(d.event_date, passed) : null,
        months_fc_mm: passed && raised ? monthsDiff(passed, raised) : null,
        months_since_last: raised ? null : monthsDiff(passed ?? d.event_date, t),
      };
    });
  },
});

registerDataset({
  key: "membership_cohorts",
  label: "Retention by Initiation cohort",
  description: "Of the Brethren initiated in each period, how many remained members 12, 24 and 36 months later. Only cohorts that have reached each point are counted.",
  permission: ["reports.membership"],
  exportPermission: ["reports.export"],
  columns: [
    { key: "cohort", label: "Initiated in", width: 0.8 },
    { key: "initiated", label: "Initiated", type: "number", width: 0.6 },
    { key: "eligible_12", label: "Reached 12 months", type: "number", width: 0.7 },
    { key: "remain_12", label: "Remaining at 12 months", type: "number", width: 0.7 },
    { key: "pct_12", label: "% at 12 months", type: "number", width: 0.6 },
    { key: "eligible_24", label: "Reached 24 months", type: "number", width: 0.7 },
    { key: "remain_24", label: "Remaining at 24 months", type: "number", width: 0.7 },
    { key: "pct_24", label: "% at 24 months", type: "number", width: 0.6 },
    { key: "eligible_36", label: "Reached 36 months", type: "number", width: 0.7 },
    { key: "remain_36", label: "Remaining at 36 months", type: "number", width: 0.7 },
    { key: "pct_36", label: "% at 36 months", type: "number", width: 0.6 },
    { key: "note", label: "Notes", width: 1.8 },
  ],
  filters: [...DATE_FILTERS, AREA, LODGE, { key: "cohort", label: "Cohort", type: "select", options: [{ value: "year", label: "By year" }, { value: "quarter", label: "By quarter" }] }],
  query: async (db, f) => {
    const t = today();
    const from = isoOr(f.from, `${Number(t.slice(0, 4)) - 6}-01-01`), to = isoOr(f.to, t);
    const [lodges, init] = await Promise.all([lodgeIndex(db), degrees(db, ["initiation"], from, to)]);
    const people = init.filter((d) => inScope(d.lodge_id, lodges, f));
    if (!people.length) return [];
    const ids = [...new Set(people.map((p) => p.person_id))];
    const spans = new Map<string, MembershipSpan[]>();
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      for (const m of await memberships(db, { persons: chunk })) spans.set(m.person_id, [...(spans.get(m.person_id) ?? []), m]);
    }
    return cohortRetention(people.map((p) => ({ person_id: p.person_id, initiated_on: p.event_date, cohort: f.cohort === "quarter" ? quarterLabel(p.event_date) : p.event_date.slice(0, 4) })), spans, t);
  },
});

registerDataset({
  key: "membership_length",
  label: "Length of membership",
  description: "Current members by length of membership in their Lodge.",
  permission: ["reports.membership"],
  exportPermission: ["reports.export"],
  columns: [
    { key: "lodge_number", label: "No.", type: "number", width: 0.5 },
    { key: "lodge", label: "Lodge", width: 1.6 },
    { key: "area", label: "Area", width: 1 },
    { key: "join_type", label: "Joined by", width: 0.8 },
    { key: "joined_on", label: "Joined", type: "date", width: 0.8 },
    { key: "years", label: "Years of membership", type: "number", width: 0.7 },
    { key: "band", label: "Band", width: 0.9 },
  ],
  filters: [AREA, LODGE],
  query: async (db, f) => {
    const [lodges, current] = await Promise.all([lodgeIndex(db), memberships(db, { current: true })]);
    const t = today();
    const band = (y: number) => (y < 3 ? "Under 3 years" : y < 5 ? "3 to 4 years" : y < 10 ? "5 to 9 years" : y < 20 ? "10 to 19 years" : "20 years or more");
    return current.filter((m) => inScope(m.lodge_id, lodges, f)).map((m) => {
      const years = m.joined_on ? Math.floor(monthsDiff(m.joined_on, t) / 12) : null;
      return { ...lodgeCols(lodges.get(m.lodge_id) ?? {}), join_type: label(m.join_type), joined_on: m.joined_on, years, band: years === null ? "Not recorded" : band(years) };
    }).sort((a, b) => Number(a.lodge_number) - Number(b.lodge_number));
  },
});

registerDataset({
  key: "membership_departures",
  label: "Departures and early departures",
  description: "Members leaving in a period, with length of membership. Early departures are those leaving within three years of joining.",
  permission: ["reports.membership"],
  exportPermission: ["reports.export"],
  columns: [
    { key: "left_on", label: "Left", type: "date", width: 0.8 },
    { key: "reason", label: "Reason", width: 1.1 },
    { key: "lodge_number", label: "No.", type: "number", width: 0.5 },
    { key: "lodge", label: "Lodge", width: 1.6 },
    { key: "area", label: "Area", width: 1 },
    { key: "join_type", label: "Joined by", width: 0.8 },
    { key: "months", label: "Months of membership", type: "number", width: 0.8 },
    { key: "early", label: "Early departure", type: "boolean", width: 0.7 },
  ],
  filters: [...DATE_FILTERS, AREA, LODGE],
  query: async (db, f) => {
    const from = isoOr(f.from, yearAgo()), to = isoOr(f.to, today());
    const [lodges, left] = await Promise.all([lodgeIndex(db), memberships(db, { leftFrom: from, leftTo: to })]);
    return left.filter((m) => inScope(m.lodge_id, lodges, f)).map((m) => {
      const months = m.joined_on && m.left_on ? monthsDiff(m.joined_on, m.left_on) : null;
      return { left_on: m.left_on, reason: CHANGE_LABELS[m.leaving_reason ?? "unrecorded"] ?? label(m.leaving_reason), ...lodgeCols(lodges.get(m.lodge_id) ?? {}),
        join_type: label(m.join_type), months, early: months !== null && months < 36 };
    }).sort((a, b) => String(b.left_on).localeCompare(String(a.left_on)));
  },
});

// ---------------------------------------------------------------------------
// Learning, events and communications
// ---------------------------------------------------------------------------

registerDataset({
  key: "learning_summary",
  label: "Learning summary",
  description: "Academy enrolments, completions, outstanding learning and certificates, grouped by course, Lodge, area or role. Visible to those who may read learning records.",
  permission: ["reports.read"],
  exportPermission: ["reports.export"],
  columns: [
    { key: "group", label: "Group", width: 2 },
    { key: "enrolments", label: "Enrolments", type: "number", width: 0.7 },
    { key: "in_progress", label: "In progress", type: "number", width: 0.7 },
    { key: "completions", label: "Completions", type: "number", width: 0.7 },
    { key: "outstanding", label: "Overdue", type: "number", width: 0.7 },
    { key: "certificates", label: "Certificates", type: "number", width: 0.7 },
    { key: "learners", label: "Learners", type: "number", width: 0.7 },
  ],
  filters: [...DATE_FILTERS, AREA, { key: "by", label: "Group by", type: "select", options: [{ value: "course", label: "Course" }, { value: "lodge", label: "Lodge" }, { value: "area", label: "Area" }, { value: "role", label: "Role" }] }],
  query: async (db, f) => {
    const from = isoOr(f.from, yearAgo()), to = isoOr(f.to, today());
    const roleRows = f.by === "role" ? ((await db.rpc("learning_person_roles")).data ?? []) : [];
    const roleOf = new Map(roleRows.map((r: { person_id: string; role_name: string }) => [r.person_id, r.role_name]));
    const [lodges, recs, certs] = await Promise.all([
      lodgeIndex(db),
      fetchAll<{ person_id: string; course_title: string; status: string; enrolled_at: string; completed_at: string | null; due_on: string | null; lodge_id: string | null }>((a, b) =>
        db.from("v_learning_records").select("person_id, course_title, status, enrolled_at, completed_at, due_on, lodge_id").order("id").range(a, b)),
      fetchAll<{ person_id: string; course_id: string | null; title: string; issued_at: string; revoked_at: string | null }>((a, b) =>
        db.from("certificates").select("person_id, course_id, title, issued_at, revoked_at").gte("issued_at", from).lte("issued_at", `${to}T23:59:59Z`).is("revoked_at", null).order("id").range(a, b)),
    ]);
    const lodgeOf = new Map(recs.map((r) => [r.person_id, r.lodge_id]));
    const groupOf = (title: string, lodgeId: string | null, personId?: string) => {
      if (f.by === "role") return roleOf.get(personId ?? "") ?? "No Hub account";
      if (f.by === "lodge") { const l = lodges.get(lodgeId ?? ""); return l ? `${l.name} No. ${l.number}` : "No Lodge recorded"; }
      if (f.by === "area") return lodges.get(lodgeId ?? "")?.area ?? "No area recorded";
      return title;
    };
    const t = today();
    const out = new Map<string, { enrolments: number; in_progress: number; completions: number; outstanding: number; certificates: number; learners: Set<string> }>();
    const get = (g: string) => out.get(g) ?? out.set(g, { enrolments: 0, in_progress: 0, completions: 0, outstanding: 0, certificates: 0, learners: new Set() }).get(g)!;
    for (const r of recs) {
      if (f.area && lodges.get(r.lodge_id ?? "")?.area_id !== f.area) continue;
      const g = get(groupOf(r.course_title, r.lodge_id, r.person_id));
      const enrolled = r.enrolled_at.slice(0, 10), completed = r.completed_at?.slice(0, 10);
      if (enrolled >= from && enrolled <= to) { g.enrolments++; g.learners.add(r.person_id); }
      if (completed && completed >= from && completed <= to) g.completions++;
      if (!completed && ["enrolled", "in_progress"].includes(r.status)) g.in_progress++;
      if (!completed && r.due_on && r.due_on < t && r.status !== "withdrawn") g.outstanding++;
    }
    for (const c of certs) {
      const lodgeId = lodgeOf.get(c.person_id) ?? null;
      if (f.area && lodges.get(lodgeId ?? "")?.area_id !== f.area) continue;
      get(groupOf(c.title, lodgeId, c.person_id)).certificates++;
    }
    return [...out.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([group, s]) => ({ group, ...s, learners: s.learners.size }));
  },
});

registerDataset({
  key: "report_event_attendance",
  label: "Event attendance and feedback",
  description: "Registrations, attendance and feedback for events in a period.",
  permission: ["reports.read"],
  exportPermission: ["reports.export"],
  columns: [
    { key: "date", label: "Date", type: "date", width: 0.8 },
    { key: "title", label: "Event", width: 2 },
    { key: "kind", label: "Type", width: 0.9 },
    { key: "training", label: "Training", type: "boolean", width: 0.6 },
    { key: "capacity", label: "Capacity", type: "number", width: 0.6 },
    { key: "registered", label: "Registered", type: "number", width: 0.7 },
    { key: "attended", label: "Attended", type: "number", width: 0.7 },
    { key: "no_show", label: "Did not attend", type: "number", width: 0.7 },
    { key: "attendance_pct", label: "% attended", type: "number", width: 0.6 },
    { key: "average_rating", label: "Average feedback (of 5)", type: "number", width: 0.7 },
    { key: "feedback_count", label: "Feedback responses", type: "number", width: 0.7 },
  ],
  filters: [...DATE_FILTERS, { key: "training", label: "Training only", type: "select", options: [{ value: "1", label: "Training events" }] }],
  query: async (db, f) => {
    const from = isoOr(f.from, yearAgo()), to = isoOr(f.to, addMonths(today(), 6));
    let q = db.from("v_event_attendance").select("*").gte("starts_at", from).lte("starts_at", `${to}T23:59:59Z`).neq("status", "cancelled").order("starts_at");
    if (f.training === "1") q = q.eq("is_training", true);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((e) => ({
      date: e.starts_at, title: e.title, kind: label(e.kind), training: e.is_training, capacity: e.capacity, registered: e.registered, attended: e.attended,
      no_show: e.no_show, attendance_pct: e.registered && (e.attended || e.no_show) ? Math.round((Number(e.attended) / Number(e.registered)) * 100) : null,
      average_rating: e.average_rating, feedback_count: e.feedback_count,
    }));
  },
});

registerDataset({
  key: "report_communications",
  label: "Communications summary",
  description: "Email campaigns sent in a period, with delivery and engagement. You see the campaigns your role allows.",
  permission: ["reports.read"],
  exportPermission: ["reports.export"],
  columns: [
    { key: "sent_at", label: "Sent", type: "date", width: 0.8 },
    { key: "title", label: "Campaign", width: 2 },
    { key: "category", label: "Category", width: 0.8 },
    { key: "status", label: "Status", width: 0.7 },
    { key: "recipients", label: "Recipients", type: "number", width: 0.7 },
    { key: "delivered", label: "Delivered", type: "number", width: 0.7 },
    { key: "opened", label: "Opened", type: "number", width: 0.7 },
    { key: "clicked", label: "Clicked", type: "number", width: 0.7 },
    { key: "failed", label: "Not delivered", type: "number", width: 0.7 },
  ],
  filters: [...DATE_FILTERS],
  query: async (db, f) => {
    const from = isoOr(f.from, yearAgo()), to = isoOr(f.to, today());
    const { data, error } = await db.from("campaigns").select("id, title, category, status, sent_at, recipient_count")
      .gte("sent_at", from).lte("sent_at", `${to}T23:59:59Z`).order("sent_at", { ascending: false });
    if (error) throw error;
    if (!data?.length) return [];
    const recips = await fetchAll<{ campaign_id: string; status: string; first_opened_at: string | null; first_clicked_at: string | null }>((a, b) =>
      db.from("campaign_recipients").select("campaign_id, status, first_opened_at, first_clicked_at").in("campaign_id", data.map((c) => c.id)).order("id").range(a, b));
    return data.map((c) => {
      const r = recips.filter((x) => x.campaign_id === c.id);
      return {
        sent_at: c.sent_at, title: c.title, category: label(c.category), status: label(c.status), recipients: c.recipient_count ?? r.length,
        delivered: r.filter((x) => x.status === "delivered").length, opened: r.filter((x) => x.first_opened_at).length,
        clicked: r.filter((x) => x.first_clicked_at).length, failed: r.filter((x) => ["failed", "bounced", "complained"].includes(x.status)).length,
      };
    });
  },
});
