/**
 * Campaign audience definitions (stored in campaigns.audience and segments.definition).
 * The database resolves the audience (app.campaign_audience); this module only
 * builds and describes the JSON. Empty filters are omitted: the database treats a
 * present key as an active filter, so an empty list would match nobody.
 */

export type AudienceFilters = {
  lodge_ids?: string[];
  area_ids?: string[];
  offices?: string[];
  roles?: string[];
  stages?: string[];
  initiated_from?: string;
  initiated_to?: string;
  enrolled_course_id?: string;
  completed_course_id?: string;
  not_completed_course_id?: string;
  event_id?: string;
  event_statuses?: string[];
};

export type Audience = { filters: AudienceFilters; include: string[]; exclude: string[] };

const LIST_KEYS = ["lodge_ids", "area_ids", "offices", "roles", "stages", "event_statuses"] as const;
const TEXT_KEYS = ["initiated_from", "initiated_to", "enrolled_course_id", "completed_course_id", "not_completed_course_id", "event_id"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_KEYS = new Set(["lodge_ids", "area_ids", "enrolled_course_id", "completed_course_id", "not_completed_course_id", "event_id"]);
const DATE_KEYS = new Set(["initiated_from", "initiated_to"]);
const WORD = /^[a-z_]{2,40}$/;

const valid = (key: string, v: string) => (UUID_KEYS.has(key) ? UUID.test(v) : DATE_KEYS.has(key) ? DATE.test(v) : WORD.test(v));

/** Build clean filters from loosely-typed input (form data or stored JSON). */
export function cleanFilters(input: Record<string, unknown>): AudienceFilters {
  const out: AudienceFilters = {};
  for (const k of LIST_KEYS) {
    const raw = input[k];
    const list = (Array.isArray(raw) ? raw : typeof raw === "string" && raw ? [raw] : []).map(String).map((s) => s.trim()).filter((s) => s && valid(k, s));
    if (list.length) out[k] = [...new Set(list)];
  }
  for (const k of TEXT_KEYS) {
    const v = typeof input[k] === "string" ? (input[k] as string).trim() : "";
    if (v && valid(k, v)) out[k] = v;
  }
  if (!out.event_id) delete out.event_statuses;
  if (out.initiated_to && !out.initiated_from) {
    out.initiated_from = "1900-01-01";
  }
  return out;
}

const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(String).filter((s) => UUID.test(s)))] : []);

/** Normalise a stored audience (tolerates missing keys and junk). */
export function parseAudience(raw: unknown): Audience {
  const a = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const filters = cleanFilters((a.filters && typeof a.filters === "object" ? a.filters : {}) as Record<string, unknown>);
  const exclude = ids(a.exclude);
  const include = ids(a.include).filter((i) => !exclude.includes(i));
  return { filters, include, exclude };
}

export function withPerson(a: Audience, personId: string, list: "include" | "exclude"): Audience {
  const other = list === "include" ? "exclude" : "include";
  return { ...a, [list]: [...new Set([...a[list], personId])], [other]: a[other].filter((p) => p !== personId) } as Audience;
}

export function withoutPerson(a: Audience, personId: string): Audience {
  return { ...a, include: a.include.filter((p) => p !== personId), exclude: a.exclude.filter((p) => p !== personId) };
}

export type Lookups = {
  lodges?: Map<string, string>; areas?: Map<string, string>; courses?: Map<string, string>; events?: Map<string, string>;
  label?: (k: string) => string;
};

/** Plain-English description of the filters, for review screens. */
export function describeAudience(f: AudienceFilters, scope: "province" | "allocated", lk: Lookups = {}): string[] {
  const lab = lk.label ?? ((k: string) => k.replace(/_/g, " "));
  const name = (m: Map<string, string> | undefined, id: string) => m?.get(id) ?? "an item you cannot see";
  const out: string[] = [scope === "province" ? "Province-wide" : "Lodges allocated to the sender"];
  if (f.lodge_ids?.length) out.push(`Lodges: ${f.lodge_ids.map((i) => name(lk.lodges, i)).join(", ")}`);
  if (f.area_ids?.length) out.push(`Areas: ${f.area_ids.map((i) => name(lk.areas, i)).join(", ")}`);
  if (f.offices?.length) out.push(`Office holders: ${f.offices.map(lab).join(", ")}`);
  if (f.roles?.length) out.push(`Hub roles: ${f.roles.map(lab).join(", ")}`);
  if (f.stages?.length) out.push(`Stage: ${f.stages.map(lab).join(", ")}`);
  if (f.initiated_from) out.push(`Initiated ${f.initiated_from === "1900-01-01" ? "" : `from ${f.initiated_from} `}to ${f.initiated_to ?? "today"}`.replace("  ", " "));
  if (f.enrolled_course_id) out.push(`Enrolled on: ${name(lk.courses, f.enrolled_course_id)}`);
  if (f.completed_course_id) out.push(`Completed: ${name(lk.courses, f.completed_course_id)}`);
  if (f.not_completed_course_id) out.push(`Not yet completed: ${name(lk.courses, f.not_completed_course_id)}`);
  if (f.event_id) out.push(`Event: ${name(lk.events, f.event_id)} (${(f.event_statuses ?? ["confirmed", "attended"]).map(lab).join(", ")})`);
  if (out.length === 1) out.push(scope === "province" ? "Everyone with an active Hub account, plus members of every Lodge" : "Members and office holders of the sender's allocated Lodges");
  return out;
}

/** Replace {{first_name}} and {{name}} as the sending job does. */
export function personalise(markdown: string, displayName: string): string {
  const first = displayName.replace(/^(W Bro|VW Bro|RW Bro|Bro)\s+/i, "").split(" ")[0] ?? "";
  return markdown.replace(/\{\{\s*first_name\s*\}\}/g, first).replace(/\{\{\s*name\s*\}\}/g, displayName);
}
