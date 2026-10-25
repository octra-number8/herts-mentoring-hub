// Pure helpers for progression prompts (no server-only imports, so they are unit-testable).
import { DEFAULT_PROGRESSION, type ProgressionSettings } from "@/lib/progression";

/** ISO date `months` months before `from` (default today). */
export function monthsAgo(months: number, from: Date = new Date()): string {
  const y = from.getFullYear(), m = from.getMonth() - months;
  // Clamp to the last day of the target month (e.g. 30 November less 9 months is 28 February).
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const d = new Date(Date.UTC(y, m, Math.min(from.getDate(), lastDay)));
  return d.toISOString().slice(0, 10);
}

/**
 * PostgREST `or` filter matching members for whom a progression prompt would
 * appear (mirrors progressionPrompt in src/lib/progression.ts).
 */
export function promptFilter(s: ProgressionSettings = DEFAULT_PROGRESSION, today: Date = new Date()): string {
  return `and(initiated_on.lte.${monthsAgo(s.ea_to_fc_months, today)},passed_on.is.null,raised_on.is.null),and(passed_on.lte.${monthsAgo(s.fc_to_mm_months, today)},raised_on.is.null)`;
}

export function progressionSettings(orgSettings: Record<string, unknown> | undefined): ProgressionSettings {
  const p = (orgSettings?.progression ?? {}) as Partial<ProgressionSettings>;
  return { ea_to_fc_months: Number(p.ea_to_fc_months) || DEFAULT_PROGRESSION.ea_to_fc_months, fc_to_mm_months: Number(p.fc_to_mm_months) || DEFAULT_PROGRESSION.fc_to_mm_months };
}
