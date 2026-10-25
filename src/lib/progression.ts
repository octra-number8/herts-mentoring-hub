import { monthsBetween } from "./utils";

export type ProgressionSettings = { ea_to_fc_months: number; fc_to_mm_months: number };
export const DEFAULT_PROGRESSION: ProgressionSettings = { ea_to_fc_months: 9, fc_to_mm_months: 9 };

/**
 * A gentle prompt, never a judgement: an unusually long interval may suggest a
 * conversation would be welcome. It does not classify anyone as disengaged.
 */
export function progressionPrompt(m: { initiated_on?: string | null; passed_on?: string | null; raised_on?: string | null; status?: string | null }, s: ProgressionSettings = DEFAULT_PROGRESSION): string | null {
  if (m.status && m.status !== "active") return null;
  if (m.initiated_on && !m.passed_on && !m.raised_on) {
    const months = monthsBetween(m.initiated_on);
    if (months >= s.ea_to_fc_months) return `${months} months since Initiation. A conversation about the Second Degree may be welcome.`;
  }
  if (m.passed_on && !m.raised_on) {
    const months = monthsBetween(m.passed_on);
    if (months >= s.fc_to_mm_months) return `${months} months since Passing. A conversation about the Third Degree may be welcome.`;
  }
  return null;
}
