/**
 * Import pipeline, step 2: identify the report format and map its columns to
 * the Hub's target fields. Pure functions; templates are loaded by the caller.
 */

export const TARGET_FIELDS = [
  { key: "membership_number", label: "Membership number" },
  { key: "title", label: "Title" },
  { key: "first_name", label: "First name", required: true },
  { key: "last_name", label: "Last name", required: true },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "lodge_number", label: "Lodge number", required: true },
  { key: "is_primary", label: "Primary Lodge" },
  { key: "status", label: "Membership status" },
  { key: "initiated_on", label: "Initiated" },
  { key: "passed_on", label: "Passed" },
  { key: "raised_on", label: "Raised" },
  { key: "joined_on", label: "Joined" },
  { key: "exalted_on", label: "Exalted" },
  { key: "left_on", label: "Left" },
  { key: "leaving_reason", label: "Leaving reason" },
] as const;

export type TargetField = (typeof TARGET_FIELDS)[number]["key"];
export type Mapping = Record<string, TargetField>;
export type MappedRow = Partial<Record<TargetField, string>>;
export type TemplateLike = { id: string; name: string; mapping: Record<string, string>; header_signature: string[] | null };

export const isTargetField = (k: string): k is TargetField => TARGET_FIELDS.some((f) => f.key === k);
export const REQUIRED_FIELDS = TARGET_FIELDS.filter((f) => "required" in f && f.required).map((f) => f.key) as TargetField[];

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Order-independent signature of a report's columns. */
export function headerSignature(headers: string[]): string[] {
  return [...new Set(headers.map(norm).filter(Boolean))].sort();
}

/**
 * Find the saved template for these headers: an exact signature match, or a
 * template whose mapped columns are all present in the file.
 */
export function matchTemplate<T extends TemplateLike>(headers: string[], templates: T[]): T | null {
  const sig = headerSignature(headers);
  const exact = templates.find((t) => t.header_signature && headerSignature(t.header_signature).join("|") === sig.join("|"));
  if (exact) return exact;
  const present = new Set(sig);
  const covering = templates
    .filter((t) => Object.keys(t.mapping).length > 0 && Object.keys(t.mapping).every((col) => present.has(norm(col))))
    .sort((a, b) => Object.keys(b.mapping).length - Object.keys(a.mapping).length);
  return covering[0] ?? null;
}

const SYNONYMS: Record<TargetField, string[]> = {
  membership_number: ["membership number", "membership no", "member number", "member no", "reg no", "registration number", "ugle number", "ugle no", "ref", "member id", "hermes id"],
  title: ["title", "prefix", "rank"],
  first_name: ["first name", "forename", "forenames", "given name", "first names", "christian name"],
  last_name: ["last name", "surname", "family name"],
  email: ["email", "email address", "e mail"],
  phone: ["phone", "telephone", "mobile", "phone number", "tel"],
  lodge_number: ["lodge number", "lodge no", "lodge", "lodge num"],
  is_primary: ["primary", "primary lodge", "mother lodge", "is primary"],
  status: ["status", "membership status", "member status"],
  initiated_on: ["initiated", "initiation date", "date initiated", "initiated on", "date of initiation"],
  passed_on: ["passed", "passing date", "date passed", "passed on"],
  raised_on: ["raised", "raising date", "date raised", "raised on"],
  joined_on: ["joined", "joining date", "date joined", "joined on"],
  exalted_on: ["exalted", "exaltation date", "date exalted", "exalted on"],
  left_on: ["left", "date left", "left on", "resigned", "leaving date"],
  leaving_reason: ["leaving reason", "reason for leaving", "reason left", "reason"],
};

/** Best-guess mapping from column names, used when no template matches. */
export function suggestMapping(headers: string[]): Mapping {
  const out: Mapping = {};
  const used = new Set<TargetField>();
  for (const h of headers) {
    const n = norm(h);
    const hit = (Object.keys(SYNONYMS) as TargetField[]).find((k) => !used.has(k) && SYNONYMS[k].includes(n));
    if (hit) { out[h] = hit; used.add(hit); }
  }
  return out;
}

/** Problems with a mapping before it is applied. */
export function checkMapping(mapping: Record<string, string>, headers: string[]): string[] {
  const problems: string[] = [];
  const targets = Object.values(mapping).filter(Boolean);
  for (const col of Object.keys(mapping)) if (!headers.includes(col)) problems.push(`Column "${col}" is not in this file.`);
  for (const t of targets) if (!isTargetField(t)) problems.push(`"${t}" is not a field the Hub can import.`);
  const dupes = targets.filter((t, i) => targets.indexOf(t) !== i);
  for (const d of new Set(dupes)) problems.push(`More than one column is mapped to ${TARGET_FIELDS.find((f) => f.key === d)?.label ?? d}.`);
  for (const r of REQUIRED_FIELDS) if (!targets.includes(r)) problems.push(`Map a column to ${TARGET_FIELDS.find((f) => f.key === r)!.label}.`);
  return problems;
}

/** Apply a column mapping to raw rows. Unmapped columns are ignored. */
export function applyMapping(rows: Record<string, string>[], mapping: Record<string, string>): MappedRow[] {
  const entries = Object.entries(mapping).filter(([, t]) => isTargetField(t)) as [string, TargetField][];
  return rows.map((r) => {
    const out: MappedRow = {};
    for (const [col, target] of entries) out[target] = (r[col] ?? "").trim();
    return out;
  });
}
