/**
 * Import pipeline, step 3: validate and normalise mapped rows. Pure.
 */
import type { MappedRow } from "./mapping";
import { parseDate } from "./parse";

export const PERSON_STATUSES = ["active", "resigned", "ceased", "deceased", "excluded", "unknown"] as const;
export const LEAVING_REASONS = ["resigned", "ceased", "excluded", "deceased", "transferred", "other"] as const;
export const DATE_FIELDS = ["initiated_on", "passed_on", "raised_on", "joined_on", "exalted_on", "left_on"] as const;

/** The normalised record the commit function understands (see import_commit). */
export type ImportData = {
  membership_number: string | null;
  title: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  lodge_number: number | null;
  lodge_id: string | null;
  is_primary: boolean;
  status: (typeof PERSON_STATUSES)[number] | null;
  initiated_on: string | null;
  passed_on: string | null;
  raised_on: string | null;
  joined_on: string | null;
  exalted_on: string | null;
  left_on: string | null;
  leaving_reason: (typeof LEAVING_REASONS)[number] | null;
};

export type ValidatedRow = { row_no: number; raw: Record<string, string>; data: ImportData; errors: string[] };

const STATUS_WORDS: Record<string, (typeof PERSON_STATUSES)[number]> = {
  active: "active", current: "active", member: "active", subscribing: "active", "full member": "active",
  resigned: "resigned", ceased: "ceased", lapsed: "ceased", "ceased to be a member": "ceased", deceased: "deceased", died: "deceased",
  excluded: "excluded", expelled: "excluded", unknown: "unknown",
};
const REASON_WORDS: Record<string, (typeof LEAVING_REASONS)[number]> = {
  resigned: "resigned", resignation: "resigned", ceased: "ceased", lapsed: "ceased", excluded: "excluded", expelled: "excluded",
  deceased: "deceased", died: "deceased", death: "deceased", transferred: "transferred", transfer: "transferred", other: "other",
};
const YES = ["y", "yes", "true", "1", "primary", "p"];
const NO = ["n", "no", "false", "0", "secondary", "s", ""];

const blank = (v?: string) => (v === undefined || v.trim() === "" ? null : v.trim());
const titleCase = (s: string) => (s === s.toUpperCase() || s === s.toLowerCase() ? s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_, p, c) => p + c.toUpperCase()) : s);

/** Validate one mapped row. `lodges` maps Lodge numbers to ids (Lodges that exist). */
export function validateRow(row: MappedRow, rowNo: number, lodges: Map<number, string>, raw: Record<string, string> = {}): ValidatedRow {
  const errors: string[] = [];
  const first = blank(row.first_name);
  const last = blank(row.last_name);
  if (!first) errors.push("First name is missing.");
  if (!last) errors.push("Last name is missing.");

  const email = blank(row.email)?.toLowerCase() ?? null;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push(`Email "${email}" is not a valid address.`);

  const membership = blank(row.membership_number)?.replace(/\s+/g, "") ?? null;
  if (membership && !/^[A-Za-z0-9/-]{1,30}$/.test(membership)) errors.push(`Membership number "${membership}" is not in a recognised format.`);

  let lodgeNumber: number | null = null;
  let lodgeId: string | null = null;
  const lodgeRaw = blank(row.lodge_number);
  if (!lodgeRaw) errors.push("Lodge number is missing.");
  else {
    const n = Number(lodgeRaw.replace(/^no\.?\s*/i, ""));
    if (!Number.isInteger(n) || n <= 0) errors.push(`Lodge number "${lodgeRaw}" is not a number.`);
    else {
      lodgeNumber = n;
      lodgeId = lodges.get(n) ?? null;
      if (!lodgeId) errors.push(`Lodge No. ${n} is not a Lodge in this Province.`);
    }
  }

  let status: ImportData["status"] = null;
  const statusRaw = blank(row.status);
  if (statusRaw) {
    status = STATUS_WORDS[statusRaw.toLowerCase()] ?? null;
    if (!status) errors.push(`Status "${statusRaw}" is not recognised.`);
  }

  let reason: ImportData["leaving_reason"] = null;
  const reasonRaw = blank(row.leaving_reason);
  if (reasonRaw) reason = REASON_WORDS[reasonRaw.toLowerCase()] ?? "other";

  const primaryRaw = (row.is_primary ?? "").trim().toLowerCase();
  let isPrimary = true;
  if (YES.includes(primaryRaw)) isPrimary = true;
  else if (NO.includes(primaryRaw)) isPrimary = primaryRaw === "" ? true : false;
  else errors.push(`Primary Lodge value "${row.is_primary}" should be Yes or No.`);

  const dates = {} as Record<(typeof DATE_FIELDS)[number], string | null>;
  for (const f of DATE_FIELDS) {
    const d = parseDate(row[f]);
    if (d === "invalid") { errors.push(`${f.replace("_on", "").replace(/^./, (c) => c.toUpperCase())} date "${row[f]}" should be dd/mm/yyyy or yyyy-mm-dd.`); dates[f] = null; }
    else dates[f] = d;
  }
  const today = new Date().toISOString().slice(0, 10);
  for (const f of DATE_FIELDS) if (dates[f] && dates[f]! > today) errors.push(`The ${f.replace("_on", "")} date is in the future.`);
  if (dates.initiated_on && dates.passed_on && dates.passed_on < dates.initiated_on) errors.push("The passing date is before the initiation date.");
  if (dates.passed_on && dates.raised_on && dates.raised_on < dates.passed_on) errors.push("The raising date is before the passing date.");

  return {
    row_no: rowNo,
    raw,
    errors,
    data: {
      membership_number: membership,
      title: blank(row.title),
      first_name: first ? titleCase(first) : "",
      last_name: last ? titleCase(last) : "",
      email,
      phone: blank(row.phone),
      lodge_number: lodgeNumber,
      lodge_id: lodgeId,
      is_primary: isPrimary,
      status,
      ...dates,
      leaving_reason: reason,
    },
  };
}

export function validateRows(rows: MappedRow[], lodges: Map<number, string>, raws: Record<string, string>[] = []): ValidatedRow[] {
  return rows.map((r, i) => validateRow(r, i + 1, lodges, raws[i] ?? {}));
}
