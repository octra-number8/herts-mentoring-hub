/**
 * Import pipeline, step 4: match validated rows to existing people and decide
 * the outcome of each row. Pure: the caller supplies the existing records.
 *
 * Outcomes: new, update (with field-level diff), unchanged, duplicate (within
 * the file or a likely existing person without a matching number), conflict
 * (a local correction differs, or the same number has a different name),
 * invalid, and possible_removal (a current member of an in-scope Lodge who is
 * absent from the file). Omissions never imply departures: a possible removal
 * can at most create a review task, and only on a full report.
 */
import { DATE_FIELDS, type ImportData, type ValidatedRow } from "./validate";

export type Outcome = "new" | "update" | "unchanged" | "duplicate" | "conflict" | "invalid" | "possible_removal";
export type Decision = "pending" | "accept" | "skip" | "merge" | "create_new";

export type ExistingPerson = {
  id: string;
  membership_number: string | null;
  title: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  local_corrections: Record<string, unknown> | null;
  lodge_ids: string[];
  degrees: Partial<Record<"initiation" | "passing" | "raising" | "joining" | "exaltation", string[]>>;
};

export type FieldDiff = Record<string, { from: string | null; to: string | null }>;

export type StagedRow = {
  row_no: number;
  raw: Record<string, string>;
  data: Partial<ImportData> & { notes?: string[] };
  errors: string[];
  outcome: Outcome;
  matched_person_id: string | null;
  candidate_person_ids: string[];
  diff: FieldDiff;
  decision: Decision;
};

export const DEFAULT_AUTHORITATIVE = ["title", "first_name", "last_name", "email", "phone", "status"];

const DATE_KIND: Record<(typeof DATE_FIELDS)[number], keyof ExistingPerson["degrees"] | null> = {
  initiated_on: "initiation", passed_on: "passing", raised_on: "raising", joined_on: "joining", exalted_on: "exaltation", left_on: null,
};

const n = (s: string | null | undefined) => (s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "");
const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/** Field-level differences between a row and an existing person (authoritative fields, Lodge link, degree dates). */
export function diffPerson(d: ImportData, p: ExistingPerson, authoritative: string[]): FieldDiff {
  const diff: FieldDiff = {};
  for (const f of authoritative) {
    const to = (d as Record<string, unknown>)[f];
    if (to === null || to === undefined || to === "") continue;
    const from = (p as unknown as Record<string, unknown>)[f] as string | null;
    if (!same(String(to), from)) diff[f] = { from: from ?? null, to: String(to) };
  }
  if (d.lodge_id && !p.lodge_ids.includes(d.lodge_id)) diff.lodge = { from: null, to: `No. ${d.lodge_number}` };
  for (const f of DATE_FIELDS) {
    const kind = DATE_KIND[f];
    const v = d[f];
    if (!v) continue;
    if (kind) {
      const known = p.degrees[kind] ?? [];
      if (!known.includes(v)) diff[f] = { from: known[known.length - 1] ?? null, to: v };
    } else if (f === "left_on" && d.lodge_id && p.lodge_ids.includes(d.lodge_id)) {
      diff.left_on = { from: null, to: v };
    }
  }
  return diff;
}

export function matchRows(rows: ValidatedRow[], people: ExistingPerson[], opts: { authoritative?: string[]; isPartial: boolean }): { rows: StagedRow[]; stats: Record<string, number | boolean> } {
  const authoritative = opts.authoritative?.length ? opts.authoritative : DEFAULT_AUTHORITATIVE;
  const byNumber = new Map(people.filter((p) => p.membership_number).map((p) => [p.membership_number!.toLowerCase(), p]));
  const byName = new Map<string, ExistingPerson[]>();
  for (const p of people) {
    const k = n(p.last_name);
    byName.set(k, [...(byName.get(k) ?? []), p]);
  }
  const seen = new Map<string, number>();
  const out: StagedRow[] = [];
  const accounted = new Set<string>();
  const scope = new Set<string>();

  for (const r of rows) {
    const base = { row_no: r.row_no, raw: r.raw, errors: r.errors, data: { ...r.data } as StagedRow["data"], diff: {} as FieldDiff, matched_person_id: null as string | null, candidate_person_ids: [] as string[] };
    if (r.errors.length) { out.push({ ...base, outcome: "invalid", decision: "skip" }); continue; }
    const d = r.data;
    if (d.lodge_id) scope.add(d.lodge_id);

    const key = d.membership_number ? `#${d.membership_number.toLowerCase()}` : `${n(d.first_name)}|${n(d.last_name)}|${d.lodge_id}`;
    const earlier = seen.get(key);
    if (earlier !== undefined) {
      const first = out.find((o) => o.row_no === earlier);
      if (first?.matched_person_id) accounted.add(first.matched_person_id);
      out.push({ ...base, data: { ...base.data, notes: [`Appears more than once in this file (first at row ${earlier}).`] }, outcome: "duplicate",
        candidate_person_ids: first?.matched_person_id ? [first.matched_person_id] : first?.candidate_person_ids ?? [], decision: "pending" });
      continue;
    }
    seen.set(key, r.row_no);

    const p = d.membership_number ? byNumber.get(d.membership_number.toLowerCase()) : undefined;
    if (p) {
      accounted.add(p.id);
      const notes: string[] = [];
      if (n(p.last_name) !== n(d.last_name)) notes.push(`Membership number ${d.membership_number} belongs to ${p.first_name} ${p.last_name} in the Hub, but the report names ${d.first_name} ${d.last_name}.`);
      const diff = diffPerson(d, p, authoritative);
      for (const f of Object.keys(diff)) {
        if (p.local_corrections && f in p.local_corrections) notes.push(`${f.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())} was corrected locally and the report differs. The local correction is kept unless you choose otherwise.`);
      }
      if (notes.length) out.push({ ...base, data: { ...base.data, notes }, diff, matched_person_id: p.id, outcome: "conflict", decision: "pending" });
      else if (Object.keys(diff).length === 0) out.push({ ...base, matched_person_id: p.id, outcome: "unchanged", decision: "skip" });
      else out.push({ ...base, diff, matched_person_id: p.id, outcome: "update", decision: "accept" });
      continue;
    }

    // No membership number match: look for the same person by name (and Lodge).
    const candidates = (byName.get(n(d.last_name)) ?? []).filter((c) => {
      if (d.membership_number && c.membership_number && !same(c.membership_number, d.membership_number)) {
        return n(c.first_name) === n(d.first_name) && !!d.lodge_id && c.lodge_ids.includes(d.lodge_id);
      }
      const firstOk = n(c.first_name) === n(d.first_name) || (n(c.first_name)[0] === n(d.first_name)[0] && !!d.lodge_id && c.lodge_ids.includes(d.lodge_id));
      return firstOk && (!d.lodge_id || c.lodge_ids.length === 0 || c.lodge_ids.includes(d.lodge_id));
    });
    if (candidates.length) {
      for (const c of candidates) accounted.add(c.id);
      out.push({ ...base, data: { ...base.data, notes: [`Possibly the same person as ${candidates.length === 1 ? "an existing record" : `${candidates.length} existing records`}. Merge, create a new record, or skip.`] },
        candidate_person_ids: candidates.map((c) => c.id), outcome: "duplicate", decision: "pending" });
      continue;
    }
    out.push({ ...base, outcome: "new", decision: "accept" });
  }

  // Possible removals: current members of the Lodges in this report who are absent from it.
  let rowNo = rows.length;
  for (const p of people) {
    if (accounted.has(p.id) || p.status !== "active") continue;
    const lodge = p.lodge_ids.find((l) => scope.has(l));
    if (!lodge) continue;
    out.push({
      row_no: ++rowNo, raw: {}, errors: [], diff: {}, matched_person_id: p.id, candidate_person_ids: [],
      data: { first_name: p.first_name, last_name: p.last_name, membership_number: p.membership_number, lodge_id: lodge,
        notes: [opts.isPartial
          ? "Not in this partial report. Nothing changes: a partial report never implies that anyone has left."
          : "Not in this full report. Accepting creates a review task for the allocated Assistant. Membership status never changes automatically."] },
      outcome: "possible_removal", decision: opts.isPartial ? "skip" : "pending",
    });
  }

  const count = (o: Outcome) => out.filter((r) => r.outcome === o).length;
  const stats = {
    rows: rows.length, new: count("new"), update: count("update"), unchanged: count("unchanged"), duplicate: count("duplicate"),
    conflict: count("conflict"), invalid: count("invalid"), possible_removal: count("possible_removal"), is_partial: opts.isPartial, lodges: scope.size,
  };
  return { rows: out, stats };
}
