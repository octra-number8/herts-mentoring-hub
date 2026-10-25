/**
 * Import pipeline, step 5: load what matching needs (as the signed-in user, so
 * RLS applies), run mapping -> validation -> matching, and store the result
 * with the `import_stage` definer function. Committing is a separate,
 * approver-only step (`import_commit`).
 *
 * Adapter seam: any source that yields a `ParsedTable` and a column mapping can
 * call `stageTable`. Uploaded files arrive through `parseFile`; a future
 * authorised feed would provide its own reader and reuse everything below.
 */
import type { DB } from "../supabase";
import { applyMapping } from "./mapping";
import { matchRows, type ExistingPerson } from "./match";
import type { ParsedTable } from "./parse";
import { validateRows } from "./validate";

async function all<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await fetchPage(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

export async function loadLodgeNumbers(db: DB): Promise<Map<number, string>> {
  const lodges = await all<{ id: string; number: number }>((a, b) => db.from("lodges").select("id, number").order("number").range(a, b));
  return new Map(lodges.map((l) => [l.number, l.id]));
}

export async function loadExistingPeople(db: DB): Promise<ExistingPerson[]> {
  const [persons, memberships, degrees] = await Promise.all([
    all<Omit<ExistingPerson, "lodge_ids" | "degrees">>((a, b) => db.from("persons")
      .select("id, membership_number, title, first_name, last_name, email, phone, status, local_corrections").is("anonymised_at", null).order("id").range(a, b) as never),
    all<{ person_id: string; lodge_id: string }>((a, b) => db.from("lodge_memberships").select("person_id, lodge_id").is("left_on", null).order("id").range(a, b)),
    all<{ person_id: string; kind: string; event_date: string }>((a, b) => db.from("degree_events").select("person_id, kind, event_date").order("event_date").order("id").range(a, b)),
  ]);
  const lodgesOf = new Map<string, string[]>();
  for (const m of memberships) lodgesOf.set(m.person_id, [...(lodgesOf.get(m.person_id) ?? []), m.lodge_id]);
  const degreesOf = new Map<string, ExistingPerson["degrees"]>();
  for (const d of degrees) {
    const cur = degreesOf.get(d.person_id) ?? {};
    const k = d.kind as keyof ExistingPerson["degrees"];
    cur[k] = [...(cur[k] ?? []), d.event_date];
    degreesOf.set(d.person_id, cur);
  }
  return persons.map((p) => ({ ...p, local_corrections: (p.local_corrections ?? {}) as Record<string, unknown>, lodge_ids: lodgesOf.get(p.id) ?? [], degrees: degreesOf.get(p.id) ?? {} }));
}

export async function loadAuthoritativeFields(db: DB): Promise<string[] | undefined> {
  const { data } = await db.from("organisations").select("settings").single();
  const fields = (data?.settings as { imports?: { authoritative_fields?: string[] } } | undefined)?.imports?.authoritative_fields;
  return Array.isArray(fields) ? fields : undefined;
}

/** Validate, match and store a parsed table for an uploaded batch. Returns the preview counts. */
export async function stageTable(db: DB, opts: { batchId: string; table: ParsedTable; mapping: Record<string, string>; isPartial: boolean; templateId?: string | null }) {
  const [lodges, people, authoritative] = await Promise.all([loadLodgeNumbers(db), loadExistingPeople(db), loadAuthoritativeFields(db)]);
  const mapped = applyMapping(opts.table.rows, opts.mapping);
  const validated = validateRows(mapped, lodges, opts.table.rows);
  const { rows, stats } = matchRows(validated, people, { authoritative, isPartial: opts.isPartial });
  const scope = [...new Set(validated.filter((r) => !r.errors.length && r.data.lodge_id).map((r) => r.data.lodge_id!))];
  const { error } = await db.rpc("import_stage", { p_batch: opts.batchId, p_rows: rows as never, p_stats: stats as never, p_template: opts.templateId ?? undefined, p_scope: scope });
  if (error) throw error;
  return stats;
}
